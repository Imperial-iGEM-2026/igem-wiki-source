import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, truncate, symlink } from 'node:fs/promises';
import path from 'node:path';
import {
  loadAiImages,
  decodeAiImages,
  MAX_IMAGE_BYTES,
} from '../server/ai-images.mjs';
const root = await mkdtemp(path.resolve('work/image-test-'));
await mkdir(path.join(root, 'media'));
const key = '12345678-1234-1234-1234-123456789012.png';
const image = { url: '/api/media/' + key, name: 'Reference.png' };
const filename = path.join(root, 'media', key);
const bytes = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9XcAAAAASUVORK5CYII=',
  'base64',
);
await writeFile(filename, bytes);
const loaded = await loadAiImages(root, [image]);
assert.equal(loaded[0].data, bytes.toString('base64'));
assert.deepEqual(decodeAiImages(loaded)[0].bytes, bytes);
for (const url of [
  '/etc/prion.env',
  '/api/media/../prion.env',
  'https://example.com/private.png',
  '/api/media/' + key + '?path=/etc/prion.env',
])
  await assert.rejects(loadAiImages(root, [{ url }]), /uploaded to this site/);
await assert.rejects(loadAiImages(root, Array(5).fill(image)), /four/);
await assert.rejects(loadAiImages(root, null), /four/);
await writeFile(filename, Buffer.from('<!DOCTYPE html> Not an image'));
await assert.rejects(loadAiImages(root, [image]), /PNG/);
await truncate(filename, MAX_IMAGE_BYTES + 1);
await assert.rejects(loadAiImages(root, [image]), /5 MiB/);
assert.throws(() => decodeAiImages([{ path: '/etc/prion.env' }]), /Invalid/);
assert.throws(() => decodeAiImages([{ data: '<!DOCTYPE html>' }]), /Invalid/);
const large = Buffer.alloc(MAX_IMAGE_BYTES);
bytes.copy(large);
assert.throws(
  () => decodeAiImages(Array(3).fill({ data: large.toString('base64') })),
  /too large/,
);
if (process.platform !== 'win32') {
  const link = '12345678-1234-1234-1234-123456789013.png';
  await symlink(filename, path.join(root, 'media', link));
  await assert.rejects(
    loadAiImages(root, [{ url: '/api/media/' + link }]),
    /unavailable/,
  );
}
console.log(
  'PASS: image bytes round-trip; external paths, traversal, spoofed types, count/size limits and arbitrary worker paths rejected.',
);
