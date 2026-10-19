import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createExportJobs } from '../server/export-jobs.mjs';
let clock = 1000,
  release,
  calls = 0;
const gate = new Promise((resolve) => (release = resolve));
const jobs = createExportJobs({
  now: () => clock,
  prepare: async (args) => {
    calls++;
    args.onProgress({ message: 'Splitting large PDF', completed: 0, total: 2 });
    await gate;
    return { downloads: [] };
  },
});
const args = {
  userId: 'owner',
  project: { id: 'project' },
  values: {},
  team: 'test',
};
const requestId = randomUUID();
const started = jobs.start(args, requestId);
assert.equal(started.state, 'queued');
assert.equal(jobs.start(args, requestId).id, started.id);
await new Promise((resolve) => setImmediate(resolve));
clock += 120000;
assert.equal(
  jobs.get({ id: started.id, userId: 'owner', projectId: 'project' }).message,
  'Splitting large PDF',
);
for (const identity of [
  { userId: 'other', projectId: 'project' },
  { userId: 'owner', projectId: 'other' },
])
  assert.throws(() => jobs.get({ id: started.id, ...identity }), {
    status: 404,
  });
assert.equal(calls, 1);
release();
await new Promise((resolve) => setImmediate(resolve));
assert.equal(
  jobs.get({ id: started.id, userId: 'owner', projectId: 'project' }).state,
  'ready',
);
clock += 1800001;
assert.throws(
  () => jobs.get({ id: started.id, userId: 'owner', projectId: 'project' }),
  { status: 404 },
);
jobs.close();
assert.throws(() => jobs.start(args, randomUUID()), { status: 503 });
const errors = createExportJobs({
  prepare: async () => {
    throw Object.assign(Error('Replace the missing image'), {
      status: 422,
      mediaIssues: [{ source: 'image.png' }],
    });
  },
});
const bad = errors.start(args, randomUUID());
await new Promise((resolve) => setImmediate(resolve));
const failed = errors.get({
  id: bad.id,
  userId: 'owner',
  projectId: 'project',
});
assert.equal(failed.state, 'failed');
assert.equal(failed.errorStatus, 422);
assert.equal(failed.mediaIssues[0].source, 'image.png');
errors.close();
console.log(
  'PASS: background jobs survive a simulated two-minute preparation, deduplicate starts, isolate users/projects, preserve diagnostics and expire.',
);
