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

// Small files need decoding too. Browsers can display incomplete JPEGs that
// iGEM's image processor rejects; even a trailing EOI cannot repair missing scans.
const scanStart = original.indexOf(Buffer.from([0xff, 0xda]));
assert.ok(scanStart > 0);
const scanData = scanStart + 2 + original.readUInt16BE(scanStart + 2);
const truncatedScan = Buffer.concat([
  original.subarray(0, scanData + 20),
  Buffer.from([0xff, 0xd9]),
]);
for (const bad of [
  original.subarray(0, original.length - 2),
  original.subarray(0, scanData + 20),
  truncatedScan,
  Buffer.from('not an image'),
]) {
  assert.throws(
    () => compressExportImage(bad, 'broken-small.jpg'),
    /broken-small\.jpg: image validation failed/,
  );
}
const damagedPng = Buffer.from(png);
damagedPng[damagedPng.length - 6] ^= 1;
assert.throws(
  () => compressExportImage(damagedPng, 'damaged.png'),
  /image validation failed/,
);
assert.equal(compressExportImage(png, 'healthy.png').data, png);
assert.equal(
  compressExportImage(Buffer.from('<svg/>'), 'logo.svg').changed,
  false,
);
assert.deepEqual(original, before, 'validation does not rewrite the source');
console.log(
  'PASS: under-limit JPEG scans/end markers and PNG checksums are validated; healthy bytes preserved.',
);
