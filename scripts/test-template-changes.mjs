import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createProjects } from '../selfhost-dist/server/projects.mjs';
import { createTemplateChanges } from '../selfhost-dist/server/template-changes.mjs';
const db = new DatabaseSync(':memory:');
db.exec(
  'CREATE TABLE blocks(id TEXT PRIMARY KEY,value TEXT NOT NULL,version INTEGER NOT NULL,author TEXT NOT NULL); CREATE TABLE presence(id TEXT PRIMARY KEY,name TEXT NOT NULL,seen INTEGER NOT NULL);',
);
const projects = createProjects(db);
let changes = createTemplateChanges(db, projects);
const id = projects.create('Existing team project', 'regelerate');
const other = projects.create('Another project', 'swiss');
const store = projects.scope(id);
store.insert.run('pages:test-marker', 'Keep custom and deleted pages', 'Team');
store.insert.run(
  'template:custom-media',
  '/api/media/my-original-logo.png',
  'Team',
);
const content = (project) =>
  projects
    .scope(project)
    .rows.all()
    .filter((r) => r.id !== 'site:appearance')
    .sort((a, b) => a.id.localeCompare(b.id));
const before = content(id),
  unrelated = projects.scope(other).rows.all();
assert.throws(
  () => changes.apply(id, 'no-preview', 'alice'),
  /Preview expired/,
);
let preview = changes.preview(id, 'notebook-white', 'alice');
assert.deepEqual(
  content(id),
  before,
  'preview is read-only for project content',
);
assert.equal(preview.data['site:template'].value, 'regelerate');
assert.equal(preview.data['site:appearance'].value, 'notebook-white');
assert.equal(
  preview.data['template:custom-media'].value,
  '/api/media/my-original-logo.png',
);
assert.throws(() => changes.apply(id, preview.token, 'bob'), /Preview expired/);
assert.throws(
  () => changes.apply(other, preview.token, 'alice'),
  /Preview expired/,
);
const title = store.select.get('home:title');
store.update.run('Latest title', 'Teammate', 'home:title', title.version);
assert.throws(
  () => changes.apply(id, preview.token, 'alice'),
  /changed since your preview/,
);
preview = changes.preview(id, 'notebook-white', 'alice');
const savedBeforeApply = content(id);
const applied = changes.apply(id, preview.token, 'alice');
assert.equal(applied.theme, 'notebook-white');
assert.deepEqual(
  content(id),
  savedBeforeApply,
  'apply preserves every content value and version',
);
assert.throws(
  () => changes.apply(id, preview.token, 'alice'),
  /Preview expired/,
);
store.insert.run('template:later-edit', 'Added after template change', 'Team');
const beforeRollback = content(id);
changes = createTemplateChanges(db, projects);
assert.equal(
  changes.status(id).rollback.id,
  applied.rollback.id,
  'rollback survives service restart',
);
assert.throws(
  () => changes.rollback(id, applied.rollback.id, applied.version - 1, 'alice'),
  /changed/,
);
changes.rollback(id, applied.rollback.id, applied.version, 'alice');
assert.equal(changes.status(id).theme, 'regelerate');
assert.deepEqual(
  content(id),
  beforeRollback,
  'rollback preserves edits made after apply',
);
assert.equal(changes.status(id).rollback, null);
for (const target of [
  'swiss',
  'notebook-purple',
  'notebook-white',
  'regelerate',
]) {
  const p = changes.preview(id, target, 'alice');
  changes.apply(id, p.token, 'alice');
  assert.deepEqual(content(id), beforeRollback);
}
preview = changes.preview(id, 'swiss', 'alice');
db.prepare('UPDATE template_previews SET expires=0 WHERE token=?').run(
  preview.token,
);
assert.throws(() => changes.apply(id, preview.token, 'alice'), /expired/);
assert.deepEqual(projects.scope(other).rows.all(), unrelated);
assert.equal(
  projects.list().projects.length,
  2,
  'previews do not create duplicate projects',
);
assert.equal(
  projects.templateId(id),
  'regelerate',
  'content structure never changes',
);
assert.equal(
  projects.list().projects.find((p) => p.id === id).appearanceId,
  'regelerate',
);
assert.throws(() => changes.preview(id, 'blank', 'alice'), /Choose a template/);
db.close();
console.log(
  'PASS: read-only preview, ownership, stale preview rejection, all content/media/page rows unchanged, atomic apply, durable rollback preserving later edits, template variants and project isolation.',
);
