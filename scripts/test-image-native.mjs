import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { runNativeImage } from '../selfhost-dist/server/image-native-process.mjs';

const requireNative = createRequire(
  new URL(
    `../selfhost-dist/server/image-runtime/${process.platform}-${process.arch}/package.json`,
    import.meta.url,
  ),
);
const sharp = requireNative('sharp');
sharp.cache(false);
sharp.concurrency(1);
const dir = await mkdtemp(path.resolve('work/native-image-test-'));
const save = async (name, bytes) => {
  const file = path.join(dir, name);
  await writeFile(file, bytes);
  return file;
};
const raw = randomBytes(256 * 256 * 4);
const image = () =>
  sharp(raw, { raw: { width: 256, height: 256, channels: 4 } });
const jpeg = await image().jpeg({ quality: 100 }).toBuffer();
const jpgFile = await save('photo.jpg', jpeg);
const result = await runNativeImage(jpgFile, { limit: 30000 });
assert.ok(result.changed && result.data.length <= 30000);
assert.deepEqual(await readFile(jpgFile), jpeg);
const unchanged = await runNativeImage(jpgFile);
assert.equal(unchanged.changed, false);
assert.deepEqual(unchanged.data, jpeg);
assert.equal(
  (await runNativeImage(jpgFile, { omitUnchangedData: true })).data,
  undefined,
);
for (const fraction of [0.2, 0.5, 0.9, 0.99]) {
  const truncated = Buffer.concat([
    jpeg.subarray(0, Math.floor(jpeg.length * fraction)),
    Buffer.from([255, 217]),
  ]);
  await assert.rejects(
    runNativeImage(await save('broken.jpg', truncated)),
    /image validation failed/,
  );
}
await assert.rejects(
  runNativeImage(await save('no-end.jpg', jpeg.subarray(0, -2))),
  /image validation failed/,
);
await assert.rejects(
  runNativeImage(await save('fake.jpg', Buffer.from('not an image'))),
  /image validation failed/,
);
const png = await image().png().toBuffer();
const pngFile = await save('diagram.png', png);
const compressed = await runNativeImage(pngFile, { limit: 50000 });
assert.ok(compressed.changed && compressed.data.length <= 50000);
assert.equal(compressed.extension, '.png');
assert.ok((await sharp(compressed.data).metadata()).hasAlpha);
const damagedPng = Buffer.from(png);
damagedPng[damagedPng.length - 6] ^= 1;
await assert.rejects(
  runNativeImage(await save('checksum.png', damagedPng)),
  /checksum/,
);
assert.deepEqual((await runNativeImage(pngFile)).data, png);
await assert.rejects(runNativeImage(jpgFile, { limit: 10 }), /could not meet/);
const oriented = await sharp({
  create: { width: 300, height: 150, channels: 3, background: 'red' },
})
  .withMetadata({ orientation: 6 })
  .jpeg()
  .toBuffer();
const orientedFile = await save('oriented.jpg', oriented);
const upright = await runNativeImage(orientedFile, {
  limit: oriented.length - 1,
});
assert.ok(
  upright.changed && upright.height > upright.width,
  'compression preserves visual orientation',
);
// A progressive JPEG requires full-image coefficients. Reject an oversized one
// before allocation, but support normal 24 MP progressive and 38 MP baseline.
const largeFile = path.join(dir, 'large-progressive.jpg');
await sharp({
  create: { width: 7600, height: 5000, channels: 3, background: '#467192' },
})
  .jpeg({ progressive: true, chromaSubsampling: '4:4:4' })
  .toFile(largeFile);
const start = performance.now();
await assert.rejects(
  runNativeImage(largeFile, { omitUnchangedData: true }),
  /progressive JPEG.*24 megapixels/,
);
await sharp({
  create: { width: 6000, height: 4000, channels: 3, background: '#467192' },
})
  .jpeg({ progressive: true, chromaSubsampling: '4:4:4' })
  .toFile(largeFile);
const large = await runNativeImage(largeFile, { omitUnchangedData: true });
assert.equal(large.changed, false);
assert.ok(
  large.peakRssKiB < 280 * 1024,
  `24 MP worker peak ${large.peakRssKiB} KiB exceeds budget`,
);
await sharp({
  create: { width: 7600, height: 5000, channels: 3, background: '#467192' },
})
  .jpeg({ progressive: false, chromaSubsampling: '4:4:4' })
  .toFile(largeFile);
const baseline = await runNativeImage(largeFile, { omitUnchangedData: true });
assert.ok(
  baseline.peakRssKiB < 280 * 1024,
  `38 MP baseline peak ${baseline.peakRssKiB} KiB exceeds budget`,
);
console.log(
  `PASS: native validation/compression, late scan corruption, PNG CRC/transparency, orientation, unchanged originals, oversized progressive guard. 24 MP progressive: ${Math.round(large.peakRssKiB / 1024)} MiB; 38 MP baseline: ${Math.round(baseline.peakRssKiB / 1024)} MiB peak RSS with a 64 MiB JS heap (${Math.round(performance.now() - start)} ms including fixture writes).`,
);
