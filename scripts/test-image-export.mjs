import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import jpeg from 'jpeg-js';
import { PNG } from 'pngjs';
import { compressExportImage } from './image-export.mjs';
const pixels = { width: 256, height: 256, data: randomBytes(256 * 256 * 4) };
const original = jpeg.encode(pixels, 100).data;
const before = Buffer.from(original);
const result = compressExportImage(original, 'photo.jpg', 30000);
assert.ok(result.changed && result.data.length <= 30000);
assert.deepEqual(original, before);
assert.ok(jpeg.decode(result.data).width > 0);
const png = PNG.sync.write(pixels);
const transparent = compressExportImage(png, 'diagram.png', 50000);
assert.ok(transparent.data.length <= 50000);
assert.equal(transparent.extension, '.png');
assert.ok(
  PNG.sync.read(transparent.data).data.some((v, i) => i % 4 === 3 && v < 255),
);
assert.equal(
  compressExportImage(original, 'small.jpg', original.length).data,
  original,
);
assert.throws(
  () => compressExportImage(Buffer.alloc(100), 'broken.jpg', 10),
  /broken.jpg/,
);
assert.throws(
  () => compressExportImage(original, 'impossible.jpg', 10),
  /could not meet/,
);
console.log(
  'PASS: JPEG compression, PNG transparency, unchanged originals, under-limit passthrough, named failures.',
);
