import assert from 'node:assert/strict';
import { previewChanges, applyPreviewChanges } from '../app/preview-sync.ts';
const row = (value) => ({ value, version: 1, author: 'test' });
const before = Object.fromEntries(
  Array.from({ length: 36 }, (_, i) => [
    'layout:page-' + i,
    row('x'.repeat(80000)),
  ]),
);
const next = { ...before, title: row('New draft title') };
delete next['layout:page-35'];
const patch = previewChanges(before, next);
assert.deepEqual(Object.keys(patch.changes), ['title']);
assert.deepEqual(patch.removed, ['layout:page-35']);
const applied = applyPreviewChanges(before, patch.changes, patch.removed);
assert.deepEqual(applied, next);
assert.equal(applied['layout:page-0'], before['layout:page-0']);
const unchanged = previewChanges(before, structuredClone(before));
assert.equal(
  applyPreviewChanges(before, unchanged.changes, unchanged.removed),
  before,
);
const changed = previewChanges(before, {
  ...before,
  'layout:page-0': { ...before['layout:page-0'], version: 2 },
});
assert.equal(Object.keys(changed.changes).length, 1);
console.log(
  JSON.stringify({
    fullSnapshotBytes: Buffer.byteLength(JSON.stringify(next)),
    editPatchBytes: Buffer.byteLength(JSON.stringify(patch)),
    unchangedPatchBytes: Buffer.byteLength(JSON.stringify(unchanged)),
  }),
);
console.log(
  'PASS: preview deltas preserve rows, deletions and unchanged snapshot identity.',
);
