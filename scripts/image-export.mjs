import jpeg from 'jpeg-js';
import { PNG } from 'pngjs';
export const IMAGE_UPLOAD_BYTES = 9_900_000;

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
  if (bytes.length <= limit)
    return { data: bytes, extension: null, changed: false };
  const fail = (reason) =>
    new Error(
      `Cannot export ${filename}: ${reason} The image must be below 10 MB. Compress or replace it, then export again.`,
    );
  let image,
    png = false;
  try {
    if (bytes[0] === 0xff && bytes[1] === 0xd8) {
      image = jpeg.decode(bytes, {
        useTArray: true,
        maxResolutionInMP: 40,
        maxMemoryUsageInMB: 256,
      });
    } else if (
      bytes
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    ) {
      if (
        bytes.length < 24 ||
        bytes.readUInt32BE(16) * bytes.readUInt32BE(20) > 40_000_000
      )
        throw fail('Image dimensions exceed the automatic processing limit.');
      // APNG must not silently become a still image.
      for (let pos = 8; pos + 12 <= bytes.length;) {
        const length = bytes.readUInt32BE(pos);
        if (bytes.toString('ascii', pos + 4, pos + 8) === 'acTL')
          throw fail('Animated PNG compression is not supported.');
        pos += length + 12;
      }
      image = PNG.sync.read(bytes);
      png = true;
    } else
      throw fail('Automatic compression supports JPEG and static PNG only.');
  } catch (error) {
    if (error.message.startsWith('Cannot export')) throw error;
    throw fail('The image could not be decoded safely.');
  }
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
