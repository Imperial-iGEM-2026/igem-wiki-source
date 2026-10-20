import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createMcpMedia } from '../selfhost-dist/server/mcp-media.mjs';
import { uploadSpaceError } from '../server/upload-space.mjs';
const MiB = 1024 * 1024;
assert.equal(uploadSpaceError(258 * MiB, MiB, MiB, 256), null);
assert.match(uploadSpaceError(255 * MiB, 0, MiB / 4, 256), /Additional space needed: 1.25 MiB/);
const db = new DatabaseSync(':memory:');
const dataDir = await mkdtemp(path.resolve('work/upload-space-'));
await mkdir(path.join(dataDir, 'media'));
let available = 258 * MiB;
const media = createMcpMedia({ db, dataDir, fail: (status, message) => Object.assign(Error(message), { status }),
  diskSpace: async () => ({ bavail: available, bsize: 1 }) });
const link = { id: 'one', project_id: 'project' };
const first = await media.start(link, 'ethics', { name: 'first.pdf', size: MiB });
const chunk = Buffer.alloc(MiB / 2, 32); chunk.write('%PDF-1.7\n');
await media.append(link, 'ethics', { uploadId: first.uploadId, offset: 0, base64: chunk.toString('base64') });
available -= chunk.length; // Real disk space falls as chunks arrive.
// Exactly enough for the pending half, another file and the unchanged safety reserve.
const second = await media.start(link, 'ethics', { name: 'second.pdf', size: MiB });
await assert.rejects(media.start(link, 'ethics', { name: 'third.pdf', size: 256 }), error => {
  assert.equal(error.status, 507);
  assert.match(error.message, /reserved for unfinished uploads: 1.50 MiB/);
  assert.match(error.message, /safety reserve: 256 MiB/);
  return true;
});
await media.cancel(link, 'ethics', second.uploadId);
assert.ok((await media.start(link, 'ethics', { name: 'replacement.pdf', size: MiB })).uploadId);
// Completed uploads release their remaining reservation without deleting the media.
await media.append(link, 'ethics', { uploadId: first.uploadId, offset: chunk.length, base64: chunk.toString('base64') });
await assert.rejects(media.cancel(link, 'ethics', first.uploadId), /complete/);
db.close();
console.log('PASS: partial uploads do not double-count disk usage; capacity boundary, rejection diagnostics, cancellation and completed-file protection.');
