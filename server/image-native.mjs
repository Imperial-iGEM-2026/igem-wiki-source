import { createRequire } from 'node:module';
import { open, stat, readFile } from 'node:fs/promises';
import path from 'node:path';

const requireNative = createRequire(
  new URL(
    `./image-runtime/${process.platform}-${process.arch}/package.json`,
    import.meta.url,
  ),
);
const sharp = requireNative('sharp');
sharp.cache(false);
sharp.concurrency(1);
const options = {
  failOn: 'warning',
  sequentialRead: true,
  limitInputPixels: 40_000_000,
};
const crcTable = Uint32Array.from({ length: 256 }, (_, n) => {
  for (let i = 0; i < 8; i++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});

// libspng can ignore ancillary CRCs. Check every PNG chunk with a 64 KiB buffer,
// keeping the old strict integrity guarantee without allocating decoded pixels.
async function checkPng(file, size) {
  const handle = await open(file, 'r');
  const chunk = Buffer.alloc(65536),
    header = Buffer.alloc(8),
    tail = Buffer.alloc(4);
  let pos = 8,
    animated = false;
  const read = async (buffer, length, position) => {
    let done = 0;
    while (done < length) {
      const { bytesRead } = await handle.read(
        buffer,
        done,
        length - done,
        position + done,
      );
      if (!bytesRead) throw Error('Truncated PNG data.');
      done += bytesRead;
    }
  };
  try {
    while (pos + 12 <= size) {
      await read(header, 8, pos);
      const length = header.readUInt32BE(0),
        type = header.toString('ascii', 4);
      if (pos + length + 12 > size) throw Error('Truncated PNG chunk.');
      let crc = 0xffffffff;
      const update = (buffer, count) => {
        for (let i = 0; i < count; i++)
          crc = crcTable[(crc ^ buffer[i]) & 255] ^ (crc >>> 8);
      };
      update(header.subarray(4), 4);
      for (let offset = 0; offset < length; offset += chunk.length) {
        const count = Math.min(chunk.length, length - offset);
        await read(chunk, count, pos + 8 + offset);
        update(chunk, count);
      }
      await read(tail, 4, pos + 8 + length);
      if ((crc ^ 0xffffffff) >>> 0 !== tail.readUInt32BE(0))
        throw Error('Invalid PNG checksum.');
      if (type === 'acTL') animated = true;
      if (type === 'IEND') return { animated };
      pos += length + 12;
    }
    throw Error('PNG end chunk is missing.');
  } finally {
    await handle.close();
  }
}

export async function processImage(
  file,
  { limit = 9_900_000, omitUnchangedData = false } = {},
) {
  const name = path.basename(file),
    { size } = await stat(file);
  const fail = (reason) => Error(`Cannot export ${name}: ${reason}`);
  const unchanged = async () => ({
    changed: false,
    extension: null,
    ...(omitUnchangedData ? {} : { data: await readFile(file) }),
  });
  try {
    // Do not parse unsupported formats such as SVG or silently rasterize animations.
    const handle = await open(file, 'r');
    const magic = Buffer.alloc(8);
    try {
      await handle.read(magic, 0, 8, 0);
    } finally {
      await handle.close();
    }
    const jpeg = magic[0] === 255 && magic[1] === 216;
    const png = magic.equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    if (!jpeg && !png) {
      if (/\.(jpe?g|png)$/i.test(name))
        throw Error('Not a readable JPEG or PNG.');
      if (size <= limit) return unchanged();
      throw fail(
        'Automatic compression supports JPEG and static PNG only. Compress or replace this file.',
      );
    }
    const metadata = await sharp(file, options).metadata();
    if (
      !metadata.width ||
      !metadata.height ||
      metadata.width * metadata.height > 40_000_000
    )
      throw fail(
        'The image exceeds the 40 megapixel processing limit. Use a smaller export copy; keep the original.',
      );
    // Progressive JPEG decoding must retain coefficients for the whole image,
    // even with sequential reads. Reject before allocation on a 1 GB server.
    if (
      jpeg &&
      metadata.isProgressive &&
      metadata.width * metadata.height > 24_000_000
    )
      throw fail(
        'This progressive JPEG exceeds the low-memory processing limit (24 megapixels). Save a baseline (non-progressive) JPEG or a smaller export copy and upload it; keep the original. The file is not necessarily corrupt.',
      );
    const animation = png ? (await checkPng(file, size)).animated : false;
    // Sequentially decode through the bottom-right pixel. This forces the final
    // scanline to be consumed (a thumbnail can skip it), without retaining a
    // full-size output or building an encoder's coefficient arrays.
    await sharp(file, options)
      .extract({
        left: metadata.width - 1,
        top: metadata.height - 1,
        width: 1,
        height: 1,
      })
      .raw()
      .toBuffer();
    if (size <= limit) return unchanged();
    if (animation)
      throw fail(
        'Animated PNG compression is not supported. Compress or replace this file.',
      );
    // Bound export dimensions before encoding; never materialize a full JS pixel array.
    const maximum = Math.min(
      1,
      4096 / Math.max(metadata.width, metadata.height),
    );
    const swapped = metadata.orientation >= 5 && metadata.orientation <= 8;
    const uprightWidth = swapped ? metadata.height : metadata.width;
    const uprightHeight = swapped ? metadata.width : metadata.height;
    for (let scale = maximum; scale >= maximum * 0.24; scale *= 0.8) {
      for (const quality of png ? [0] : [85, 75, 65]) {
        const width = Math.max(1, Math.round(uprightWidth * scale));
        const height = Math.max(1, Math.round(uprightHeight * scale));
        let pipeline = sharp(file, options)
          .rotate()
          .resize({ width, height, fit: 'inside', withoutEnlargement: true });
        pipeline = png
          ? pipeline.png({ compressionLevel: 6 })
          : pipeline.jpeg({ quality });
        const { data, info } = await pipeline.toBuffer({
          resolveWithObject: true,
        });
        if (data.length <= limit)
          return {
            changed: true,
            data,
            extension: png ? '.png' : '.jpg',
            width: info.width,
            height: info.height,
          };
      }
    }
    throw fail(
      'Automatic compression could not meet the upload limit. Compress or replace this file.',
    );
  } catch (error) {
    if (error.message.startsWith('Cannot export')) throw error;
    if (/pixel limit/i.test(error.message))
      throw fail(
        'The image exceeds the 40 megapixel processing limit. Use a smaller export copy; keep the original.',
      );
    if (/memory|allocat/i.test(error.message))
      throw fail(
        'Image processing ran out of memory. Use a smaller export copy; this does not mean the file is corrupt.',
      );
    throw fail(
      `image validation failed. ${error.message} Re-export the original in an image editor and upload a fresh copy.`,
    );
  }
}

/** Display derivative only: no full-resolution JS pixel buffers or export validation pass. */
export async function previewImage(file, size) {
  if (![160, 1600].includes(size)) throw Error('Invalid preview size');
  const metadata = await sharp(file, options).metadata();
  if (!['jpeg', 'png', 'webp'].includes(metadata.format))
    throw Error('Unsupported image preview format');
  if (metadata.isProgressive && metadata.width * metadata.height > 24_000_000)
    throw Error('Use a smaller or baseline JPEG for the editor preview.');
  const { data, info } = await sharp(file, options)
    .rotate()
    .resize({
      width: size,
      height: size,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: 80, effort: 1 })
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height, extension: '.webp' };
}
