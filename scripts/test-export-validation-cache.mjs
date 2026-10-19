import assert from 'node:assert/strict';
import {
  mkdtemp,
  writeFile,
  readFile,
  readdir,
  stat,
  utimes,
} from 'node:fs/promises';
import path from 'node:path';
import { createImageValidationCache } from '../server/export-validation-cache.mjs';
const dir = await mkdtemp(path.resolve('work/image-cache-'));
const file = path.join(dir, 'photo.jpg');
const folder = path.join(dir, 'cache');
let time = Date.now(),
  calls = 0,
  hits = 0;
const makeCache = () => createImageValidationCache(folder, { now: () => time });
let cache = makeCache();
const validate = async () => {
  calls++;
  if ((await readFile(file, 'utf8')) !== 'valid') throw Error('corrupt');
  return { changed: false };
};
await writeFile(file, 'valid');
await cache.check(file, validate);
cache = makeCache(); // A service restart must preserve successful checks.
await cache.check(file, validate, () => hits++);
assert.equal(calls, 1);
assert.equal(hits, 1);
const before = await stat(file);
await writeFile(file, 'wrong'); // Same path and size, with restored mtime.
await utimes(file, before.atime, before.mtime);
await assert.rejects(cache.check(file, validate), /corrupt/);
await assert.rejects(cache.check(file, validate), /corrupt/);
assert.equal(calls, 3, 'Failures are not cached');
await writeFile(file, 'valid');
await cache.check(file, validate);
assert.equal(calls, 3, 'Identical bytes can reuse validation');
time += 31 * 24 * 60 * 60_000;
await cache.check(file, validate);
assert.equal(calls, 4, 'Expired entries require fresh decoding');
for (const name of await readdir(folder))
  await writeFile(path.join(folder, name), '{broken cache');
await cache.check(file, validate);
assert.equal(calls, 5);
const marker = JSON.parse(
  await readFile(path.join(folder, (await readdir(folder))[0]), 'utf8'),
);
assert.deepEqual(Object.keys(marker).sort(), ['expires', 'key', 'version']);
assert.ok(!JSON.stringify(marker).includes(file));
await writeFile(file, 'other');
const changed = async () => {
  calls++;
  return { changed: true, data: Buffer.from('replacement') };
};
await cache.check(file, changed);
await cache.check(file, changed);
assert.equal(
  calls,
  7,
  'Compression results must not be treated as unchanged originals',
);
console.log(
  'PASS: content-keyed persistent validation, expiry, same-size replacement, failed/corrupt cache entries and unchanged-only caching.',
);
