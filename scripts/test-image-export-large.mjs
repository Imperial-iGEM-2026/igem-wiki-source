import assert from 'node:assert/strict';
import jpeg from 'jpeg-js';
import { compressExportImage, IMAGE_UPLOAD_BYTES } from './image-export.mjs';

// A compressed photo can be small while its decoder planes exceed 256 MiB.
// Generate a synthetic fixture; never commit a user's portrait to the tests.
const bytes = jpeg.encode(
  { width: 4000, height: 4000, data: Buffer.alloc(4000 * 4000 * 4, 180) },
  80,
).data;
assert.ok(bytes.length < IMAGE_UPLOAD_BYTES);
assert.throws(
  () =>
    jpeg.decode(bytes, {
      useTArray: true,
      tolerantDecoding: false,
      maxMemoryUsageInMB: 256,
    }),
  /maxMemoryUsageInMB/,
);
const result = compressExportImage(bytes, 'large-valid-photo.jpg');
assert.equal(result.changed, false);
assert.equal(result.data, bytes);

const excessive = Buffer.from(bytes);
const frame = excessive.indexOf(Buffer.from([0xff, 0xc0]));
assert.ok(frame > 0);
excessive.writeUInt16BE(50000, frame + 5);
excessive.writeUInt16BE(50000, frame + 7);
assert.throws(
  () => compressExportImage(excessive, 'oversized-dimensions.jpg'),
  (error) =>
    /40 megapixel processing limit/.test(error.message) &&
    !/image validation failed/.test(error.message),
);
assert.throws(
  () =>
    compressExportImage(
      bytes.subarray(0, bytes.length - 2),
      'truncated-large.jpg',
    ),
  /image validation failed/,
);
console.log(
  'PASS: valid 16 MP JPEG previously rejected at 256 MiB exports unchanged; excessive dimensions and truncated files still fail with distinct errors.',
);
