import jpeg from 'jpeg-js';
import { PNG } from 'pngjs';
export const IMAGE_UPLOAD_BYTES = 9_900_000;
// jpeg-js accounts for coefficient planes, decoded components and output pixels,
// not the compressed upload size. A normal 23 MP photo can exceed 256 MiB.
const JPEG_DECODE_MEMORY_MB = 512;

// Walk marker boundaries as well as decoding pixels: tolerant decoders may
// otherwise accept an incomplete file or mistake an EOI inside EXIF for its end.
function checkJpegStructure(bytes) {
  let pos = 2,
    scanned = false;
  while (pos < bytes.length) {
    if (bytes[pos++] !== 0xff) throw Error('Invalid JPEG marker.');
    while (bytes[pos] === 0xff) pos++;
    if (pos >= bytes.length) throw Error('Truncated JPEG marker.');
    const marker = bytes[pos++];
    if (marker === 0xd9) {
      if (!scanned) throw Error('JPEG has no image scan.');
      return;
    }
    if (
      marker === 0x00 ||
      marker === 0xd8 ||
      (marker >= 0xd0 && marker <= 0xd7)
    )
      throw Error('Unexpected JPEG marker.');
    if (marker === 0x01) continue;
    if (pos + 2 > bytes.length) throw Error('Truncated JPEG segment.');
    const length = bytes.readUInt16BE(pos);
    if (length < 2 || pos + length > bytes.length)
      throw Error('Truncated JPEG segment.');
    pos += length;
    if (marker === 0xda) {
      scanned = true;
      // Entropy bytes contain escaped FF00 and optional restart markers.
      while (pos < bytes.length) {
        if (bytes[pos] !== 0xff) {
          pos++;
          continue;
        }
        const start = pos++;
        while (bytes[pos] === 0xff) pos++;
        if (pos >= bytes.length) throw Error('Truncated JPEG scan.');
        const next = bytes[pos];
        if (next === 0 || (next >= 0xd0 && next <= 0xd7)) {
          pos++;
          continue;
        }
        pos = start;
        break;
      }
    }
  }
  throw Error('JPEG end marker is missing.');
}

function resize(image, width, height) {
  const data = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const sx = ((x + 0.5) * image.width) / width - 0.5;
      const sy = ((y + 0.5) * image.height) / height - 0.5;
      const x0 = Math.max(0, Math.floor(sx)),
        y0 = Math.max(0, Math.floor(sy));
      const x1 = Math.min(image.width - 1, x0 + 1),
        y1 = Math.min(image.height - 1, y0 + 1);
      const fx = Math.max(0, sx - x0),
        fy = Math.max(0, sy - y0);
      for (let c = 0; c < 4; c++) {
        const a = image.data[(y0 * image.width + x0) * 4 + c];
        const b = image.data[(y0 * image.width + x1) * 4 + c];
        const d = image.data[(y1 * image.width + x0) * 4 + c];
        const e = image.data[(y1 * image.width + x1) * 4 + c];
        data[(y * width + x) * 4 + c] = Math.round(
          (a * (1 - fx) + b * fx) * (1 - fy) + (d * (1 - fx) + e * fx) * fy,
        );
      }
    }
  return { width, height, data, exifBuffer: image.exifBuffer };
}
export function compressExportImage(
  bytes,
  filename,
  limit = IMAGE_UPLOAD_BYTES,
) {
  const fail = (reason) =>
    new Error(
      `Cannot export ${filename}: ${reason} The image must be below 10 MB. Compress or replace it, then export again.`,
    );
  const corrupt = (reason) =>
    new Error(
      `Cannot export ${filename}: image validation failed. ${reason} Re-export the original image from an image editor and upload the new file, or replace it, then prepare a fresh export.`,
    );
  const resourceLimit = (reason) =>
    new Error(
      `Cannot export ${filename}: ${reason} This is a processing limit, not evidence of image corruption. Use a smaller export copy and prepare again; keep the original image.`,
    );
  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8;
  const isPng = bytes
    .subarray(0, 8)
    .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (!isJpeg && !isPng) {
    if (/\.(jpe?g|png)(?:[?#]|$)/i.test(filename))
      throw corrupt(
        'The file is not a readable JPEG or PNG; it may be corrupt or incomplete.',
      );
    if (bytes.length <= limit)
      return { data: bytes, extension: null, changed: false };
    throw fail('Automatic compression supports JPEG and static PNG only.');
  }
  let image,
    png = false;
  try {
    if (isJpeg) {
      checkJpegStructure(bytes);
      image = jpeg.decode(bytes, {
        useTArray: true,
        tolerantDecoding: false,
        maxResolutionInMP: 40,
        maxMemoryUsageInMB: JPEG_DECODE_MEMORY_MB,
      });
    } else if (
      bytes
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    ) {
      if (bytes.length < 24) throw corrupt('The PNG header is incomplete.');
      if (bytes.readUInt32BE(16) * bytes.readUInt32BE(20) > 40_000_000)
        throw resourceLimit(
          'Image dimensions exceed the safe validation limit (40 megapixels); reduce its dimensions.',
        );
      // APNG must not silently become a still image.
      for (let pos = 8; pos + 12 <= bytes.length;) {
        const length = bytes.readUInt32BE(pos);
        if (
          bytes.length > limit &&
          bytes.toString('ascii', pos + 4, pos + 8) === 'acTL'
        )
          throw fail('Animated PNG compression is not supported.');
        pos += length + 12;
      }
      image = PNG.sync.read(bytes);
      png = true;
    } else
      throw fail('Automatic compression supports JPEG and static PNG only.');
  } catch (error) {
    if (error.message.startsWith('Cannot export')) throw error;
    if (/maxResolution/i.test(error.message))
      throw resourceLimit(
        'The image exceeds the 40 megapixel processing limit.',
      );
    if (/maxMemory|memory limit|allocate enough memory/i.test(error.message))
      throw resourceLimit(
        `The image exceeds the ${JPEG_DECODE_MEMORY_MB} MiB decoder memory budget.`,
      );
    throw corrupt(
      'The image is corrupt or incomplete (truncated data, invalid image structure or checksum).',
    );
  }
  if (bytes.length <= limit)
    return { data: bytes, extension: null, changed: false };
  // Keep PNGs as PNGs: preserve transparency and avoid JPEG artefacts in diagrams.
  for (let scale = 1; scale >= 0.24; scale *= 0.8) {
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    const pixels = scale === 1 ? image : resize(image, width, height);
    for (const quality of png ? [0] : [85, 75, 65]) {
      const data = png
        ? PNG.sync.write(pixels, { deflateLevel: 9 })
        : jpeg.encode(pixels, quality).data;
      if (data.length <= limit)
        return {
          data,
          extension: png ? '.png' : '.jpg',
          changed: true,
          width,
          height,
        };
    }
  }
  throw fail('Automatic compression could not meet the upload limit.');
}
