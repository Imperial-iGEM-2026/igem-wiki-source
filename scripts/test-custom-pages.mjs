import assert from 'node:assert/strict';
import { readFile, mkdtemp, readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
const snapshot = path.resolve('work/custom-pages-snapshot.json');
const out = await mkdtemp(path.resolve('work/custom-pages-export-'));
const compile = spawnSync(process.execPath, ['scripts/export-static.mjs', '--snapshot', snapshot, '--base', '/test-team/', '--out', out, '--igem'], { encoding: 'utf8' });
assert.equal(compile.status, 2, compile.stdout + compile.stderr);
const a = await readFile(path.join(out, 'public/custom-a/index.html'), 'utf8');
const b = await readFile(path.join(out, 'public/custom-b/index.html'), 'utf8');
assert.ok(a.includes('href="/test-team/custom-b/"'));
assert.ok(a.includes('Continue to B'));
assert.ok(b.includes('Custom B'));
assert.ok(a.includes('data-field-id="custom-a:title"'));
assert.ok(!a.includes('/api/content'));
let count = 0;
async function walk(dir) { for (const item of await readdir(dir, { withFileTypes: true })) { if (item.isDirectory()) await walk(path.join(dir,item.name)); else if (item.name === 'index.html') count++; } }
await walk(path.join(out,'public'));
assert.equal(count, 32);
const destination = await mkdtemp(path.resolve('work/custom-pages-import-'));
const restore = spawnSync(process.execPath, ['selfhost-dist/server/import-snapshot.mjs', snapshot], { encoding:'utf8', env:{...process.env,DATA_DIR:destination} });
assert.equal(restore.status,0,restore.stdout+restore.stderr);
const db = new DatabaseSync(path.join(destination,'wiki.sqlite'));
try {
  const registry=JSON.parse(db.prepare('SELECT value FROM blocks WHERE id=?').get('pages:custom').value);
  assert.equal(registry.length,2);
  const layout=JSON.parse(db.prepare('SELECT value FROM blocks WHERE id=?').get('layout:custom-a').value);
  assert.equal(layout.nodes[0].linkTo,'/custom-b');
} finally { db.close(); }
console.log('PASS: 32 static routes, rewritten custom page links, text wrappers, portable page registry and restored custom layouts/links.');
