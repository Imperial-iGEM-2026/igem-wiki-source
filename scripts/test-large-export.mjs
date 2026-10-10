import assert from 'node:assert/strict';
import { readFile, stat, mkdtemp } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
const fixture = JSON.parse(
  await readFile('work/large-media-fixture.json', 'utf8'),
);
const output = path.resolve('work/large-export-' + Date.now());
execFileSync(
  process.execPath,
  [
    'scripts/export-static.mjs',
    '--snapshot',
    fixture.snapshot,
    '--media-dir',
    fixture.mediaDir,
    '--base',
    '/',
    '--out',
    output,
  ],
  { stdio: 'pipe' },
);
const target = path.join(output, 'public/assets/media', fixture.key);
assert.equal((await stat(target)).size, fixture.size);
async function hash(file) {
  const h = createHash('sha256');
  for await (const chunk of createReadStream(file)) h.update(chunk);
  return h.digest('hex');
}
assert.equal(
  await hash(target),
  await hash(path.join(fixture.mediaDir, fixture.key)),
);
const restored = await mkdtemp(path.resolve('work/large-restore-'));
execFileSync(
  process.execPath,
  [
    'selfhost-dist/server/import-snapshot.mjs',
    fixture.snapshot,
    '--media-dir',
    fixture.mediaDir,
  ],
  { env: { ...process.env, DATA_DIR: restored }, stdio: 'pipe' },
);
assert.equal(
  await hash(path.join(restored, 'media', fixture.key)),
  await hash(target),
);
const modelTarget = path.join(output, 'public/assets/media', fixture.modelKey);
assert.equal((await stat(modelTarget)).size, fixture.size);
assert.equal(
  await hash(modelTarget),
  await hash(path.join(fixture.mediaDir, fixture.modelKey)),
);
assert.equal(
  await hash(path.join(restored, 'media', fixture.modelKey)),
  await hash(modelTarget),
);
const report = JSON.parse(
  await readFile(path.join(output, 'publication-report.json'), 'utf8'),
);
assert.ok(
  !report.issues.some((issue) => issue.includes('Could not validate GLB')),
);
console.log(
  'PASS: 32 MiB video and GLB copied byte-for-byte through metadata-only static export and snapshot restore.',
);
