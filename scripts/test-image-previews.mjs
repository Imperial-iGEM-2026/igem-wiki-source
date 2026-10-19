import assert from 'node:assert/strict';
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  readdir,
  stat,
} from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { createImagePreviews } from '../selfhost-dist/server/image-previews.mjs';
import { runNativeImage } from '../selfhost-dist/server/image-native-process.mjs';

const sharp = createRequire(
  new URL(
    `../selfhost-dist/server/image-runtime/${process.platform}-${process.arch}/package.json`,
    import.meta.url,
  ),
)('sharp');
const dir = await mkdtemp(path.resolve('work/image-previews-'));
await mkdir(path.join(dir, 'media'));
const input = await sharp({
  create: { width: 6000, height: 4000, channels: 3, background: '#92acd3' },
})
  .jpeg({ progressive: false })
  .toBuffer();
for (const key of ['aa.jpg', 'bb.jpg', 'cc.jpg'])
  await writeFile(path.join(dir, 'media', key), input);
let running = 0,
  maximum = 0,
  calls = 0;
const previews = createImagePreviews(dir, {
  process: async (...args) => {
    running++;
    calls++;
    maximum = Math.max(maximum, running);
    try {
      return await runNativeImage(...args);
    } finally {
      running--;
    }
  },
});
const results = await Promise.all([
  previews('aa.jpg', 1600),
  previews('aa.jpg', 1600),
  previews('bb.jpg', 160),
  previews('cc.jpg', 1600),
]);
assert.equal(results[0], results[1]);
assert.equal(calls, 3);
assert.equal(maximum, 1);
for (const [i, size] of [
  [0, 1600],
  [2, 160],
]) {
  const metadata = await sharp(results[i]).metadata();
  assert.equal(metadata.width, size);
  assert.ok(Math.abs(metadata.width / metadata.height - 1.5) < 0.01);
}
await previews('aa.jpg', 1600);
assert.equal(calls, 3, 'cached preview does not decode original again');
assert.deepEqual(await readFile(path.join(dir, 'media/aa.jpg')), input);
const oriented = await sharp({
  create: {
    width: 600,
    height: 300,
    channels: 4,
    background: { r: 1, g: 2, b: 3, alpha: 0.5 },
  },
})
  .withMetadata({ orientation: 6 })
  .png()
  .toBuffer();
await writeFile(path.join(dir, 'media/dd.png'), oriented);
const orientation = await sharp(await previews('dd.png', 160)).metadata();
assert.equal(orientation.height, 160);
assert.equal(orientation.width, 80);
assert.equal(orientation.hasAlpha, true);
await assert.rejects(previews('../aa.jpg', 160), /Invalid/);
await assert.rejects(previews('aa.jpg', 4096), /Invalid/);
await assert.rejects(previews('ee.jpg', 160), /not found/);
await writeFile(path.join(dir, 'media/ee.jpg'), 'damaged image');
await assert.rejects(previews('ee.jpg', 160), /preview unavailable/);
const failedCalls = calls;
await assert.rejects(previews('ee.jpg', 160), /preview unavailable/);
assert.equal(calls, failedCalls, 'failed decoding is not repeatedly retried');
// A replaced original gets a new derivative rather than a stale cache entry.
await writeFile(
  path.join(dir, 'media/aa.jpg'),
  await sharp(input).resize(300, 200).jpeg().toBuffer(),
);
assert.notEqual(await previews('aa.jpg', 1600), results[0]);
const tiny = await mkdtemp(path.resolve('work/image-preview-cache-'));
await mkdir(path.join(tiny, 'media'));
for (const key of ['aa.jpg', 'bb.jpg', 'cc.jpg'])
  await writeFile(path.join(tiny, 'media', key), 'source');
const bounded = createImagePreviews(tiny, {
  maxBytes: 100,
  process: async () => ({ data: Buffer.alloc(60) }),
});
for (const key of ['aa.jpg', 'bb.jpg', 'cc.jpg']) await bounded(key, 160);
let total = 0;
for (const name of await readdir(path.join(tiny, 'image-previews')))
  total += (await stat(path.join(tiny, 'image-previews', name))).size;
assert.ok(total <= 100);
console.log(
  'PASS: capped 24 MP derivatives, aspect ratio/orientation/alpha, untouched originals, serialized processing, deduplication, cache reuse/invalidation/eviction, safe paths and failure backoff.',
);
