import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createProjects } from '../selfhost-dist/server/projects.mjs';

const db = new DatabaseSync(':memory:');
db.exec(`CREATE TABLE blocks (id TEXT PRIMARY KEY,value TEXT NOT NULL,version INTEGER NOT NULL,author TEXT NOT NULL);
  CREATE TABLE presence (id TEXT PRIMARY KEY,name TEXT NOT NULL,seen INTEGER NOT NULL);
  INSERT INTO blocks VALUES('layout:results','original',7,'Editor');`);
createProjects(db);
const history = (project = 'main') =>
  db
    .prepare(
      'SELECT * FROM layout_history WHERE project_id=? AND id=? ORDER BY sequence',
    )
    .all(project, 'layout:results');
assert.equal(db.prepare('SELECT value FROM blocks').get().value, 'original');
assert.equal(
  history().length,
  0,
  'startup preserves existing rows without inventing history',
);
db.prepare('UPDATE blocks SET value=?,version=version+1 WHERE id=?').run(
  'edited',
  'layout:results',
);
assert.equal(history()[0].value, 'original');
assert.equal(history()[0].version, 7);
assert.equal(history()[0].author, 'Editor');
db.exec("UPDATE blocks SET version=version+1 WHERE id='layout:results'");
assert.equal(
  history().length,
  1,
  'unchanged values do not consume recovery slots',
);
db.exec("BEGIN; UPDATE blocks SET value='aborted'; ROLLBACK;");
assert.equal(history().length, 1, 'history and writes roll back together');
assert.equal(db.prepare('SELECT value FROM blocks').get().value, 'edited');
db.exec(
  "INSERT INTO project_blocks VALUES('other','layout:results','other-original',3,'Teammate'); UPDATE project_blocks SET value='other-edited'",
);
assert.equal(history('other')[0].value, 'other-original');
assert.equal(history().length, 1, 'project histories remain separate');
for (let i = 0; i < 25; i++)
  db.prepare('UPDATE blocks SET value=?,version=version+1').run(
    'revision-' + i,
  );
assert.equal(history().length, 20);
assert.equal(history()[0].value, 'revision-4');
assert.equal(history().at(-1).value, 'revision-23');
db.exec('DELETE FROM blocks; DELETE FROM project_blocks;');
assert.equal(history().length, 20);
assert.equal(
  history().at(-1).value,
  'revision-24',
  'deletion also preserves the last saved layout',
);
assert.equal(history('other').at(-1).value, 'other-edited');
createProjects(db);
assert.equal(history().length, 20, 'repeated startup preserves history');
db.close();
console.log(
  'Layout history: atomic recovery, deletion, retention and project isolation passed.',
);
