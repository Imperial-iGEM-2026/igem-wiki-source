import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, mkdir, readFile } from 'node:fs/promises';
import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
const [beforeFile, afterFile, reportFile] = process.argv.slice(2);
if (!reportFile)
  throw Error(
    'Pass before snapshot, after snapshot and diagnostic text paths (private local fixtures).',
  );
const before = JSON.parse(await readFile(beforeFile, 'utf8')).values;
const after = JSON.parse(await readFile(afterFile, 'utf8')).values;
const reportText = await readFile(reportFile, 'utf8');
const report = JSON.parse(reportText.slice(reportText.indexOf('{')));
const project = report.changes[0].page.split('/')[0];
const root = await mkdtemp(path.resolve('work/recovery-test-'));
const sourceDir = path.join(root, 'source');
await mkdir(path.join(sourceDir, 'var/lib/prion'), { recursive: true });
const oldFile = path.join(sourceDir, 'var/lib/prion/wiki.sqlite');
const liveFile = path.join(root, 'wiki.sqlite');
function seed(filename, values, side) {
  const db = new DatabaseSync(filename);
  db.exec(
    'CREATE TABLE project_blocks(project_id TEXT,id TEXT,value TEXT,version INTEGER,author TEXT,PRIMARY KEY(project_id,id));',
  );
  const put = db.prepare('INSERT INTO project_blocks VALUES(?,?,?,?,?)');
  for (const row of report.changes)
    put.run(
      project,
      row.page.split('/')[1],
      values[row.page.split('/')[1]],
      row[side].version,
      'Fixture',
    );
  put.run(
    'another-project',
    'layout:results',
    'untouched other project',
    100,
    'Other',
  );
  put.run(project, 'headline', 'newer text must survive', 99, 'Editor');
  db.close();
}
seed(oldFile, before, 'before');
seed(liveFile, after, 'after');
const archive = path.join(root, 'backup.tar.gz');
execFileSync('tar', [
  '-czf',
  archive,
  '-C',
  sourceDir,
  'var/lib/prion/wiki.sqlite',
]);
const run = (...args) =>
  spawnSync(
    process.execPath,
    ['ops/recover-notebook-layouts.mjs', archive, liveFile, ...args],
    { encoding: 'utf8' },
  );
const readRows = (file = liveFile) => {
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    return db
      .prepare('SELECT * FROM project_blocks ORDER BY project_id,id')
      .all();
  } finally {
    db.close();
  }
};
const initialRows = readRows();
const initialBytes = await readFile(liveFile);
const preview = run();
assert.equal(preview.status, 0, preview.stderr);
assert.equal(JSON.parse(preview.stdout).count, 24);
assert.deepEqual(
  await readFile(liveFile),
  initialBytes,
  'dry run never writes the live DB',
);
const concurrent = new DatabaseSync(liveFile);
concurrent
  .prepare('UPDATE project_blocks SET value=? WHERE project_id=? AND id=?')
  .run('newer work', project, 'layout:results');
concurrent.close();
const withNewWork = readRows();
const blocked = run('--apply');
assert.notEqual(blocked.status, 0);
assert.match(blocked.stderr, /Page changed since the diagnostic/);
assert.deepEqual(readRows(), withNewWork, 'conflict aborts every page restore');
const reset = new DatabaseSync(liveFile);
reset
  .prepare('UPDATE project_blocks SET value=? WHERE project_id=? AND id=?')
  .run(after['layout:results'], project, 'layout:results');
reset.close();
const failMidway = new DatabaseSync(liveFile);
failMidway.exec(
  "CREATE TRIGGER test_recovery_failure BEFORE UPDATE ON project_blocks WHEN OLD.id='layout:results' BEGIN SELECT RAISE(ABORT,'simulated disk write failure'); END;",
);
failMidway.close();
const failed = run('--apply');
assert.notEqual(failed.status, 0);
assert.match(failed.stderr, /simulated disk write failure/);
assert.deepEqual(
  readRows(),
  initialRows,
  'failure after earlier updates rolls back the entire recovery',
);
const removeFailure = new DatabaseSync(liveFile);
removeFailure.exec('DROP TRIGGER test_recovery_failure');
removeFailure.close();
const applied = run('--apply');
assert.equal(applied.status, 0, applied.stderr);
const result = JSON.parse(applied.stdout);
assert.equal(result.count, 24);
assert.deepEqual(
  readRows(result.safetyBackup),
  initialRows,
  'safety backup contains the complete pre-recovery state',
);
for (const row of readRows()) {
  const original = initialRows.find(
    (item) => item.project_id === row.project_id && item.id === row.id,
  );
  if (row.project_id !== project || !row.id.startsWith('layout:'))
    assert.deepEqual(row, original);
  else {
    assert.equal(row.value, before[row.id]);
    assert.equal(
      row.version,
      original.version + 1,
      'versions advance to invalidate old drafts',
    );
  }
}
const repeated = run('--apply');
assert.equal(repeated.status, 0, repeated.stderr);
assert.equal(
  JSON.parse(repeated.stdout).count,
  0,
  'repeat execution makes no changes',
);
console.log(
  'PASS: 24 real incident layouts restored; read-only preview; newer-work conflict rejection; full safety backup; other projects and text preserved; versions advance; repeat is harmless.',
);
