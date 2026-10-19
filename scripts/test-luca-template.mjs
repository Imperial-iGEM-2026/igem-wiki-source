import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { templates, templateDefaults, validateLayout } from '../selfhost-dist/server/shared.mjs';
import { createProjects } from '../selfhost-dist/server/projects.mjs';
import { createTemplateChanges } from '../selfhost-dist/server/template-changes.mjs';

const template = templates.luca;
assert.equal(template.name, 'Luca');
assert.equal(template.pages.length, 15);
const values = templateDefaults('luca');
for (const page of template.pages) {
  const layout = JSON.parse(values['layout:' + page.slug]);
  assert.ok(validateLayout(layout), `valid saved layout: ${page.slug}`);
  assert.ok(layout.nodes.length > 20, `editable sections: ${page.slug}`);
  assert.ok(layout.nodes.some(n => n.name === 'Site header'));
  const footer = layout.nodes.find(n => n.id === 'luca-footer-' + page.slug);
  assert.ok(footer && !footer.parentId && footer.indexHidden, `${page.slug}: footer outside article index`);
  assert.ok(!layout.nodes.some(n => n.id.startsWith('luca-footer-details-')));
  if (page.slug !== 'home') {
    assert.equal(layout.sidebar, true);
    assert.ok(!layout.nodes.find(n => n.name === 'Site header').parentId);
    assert.ok(!layout.nodes.find(n => n.id === 'custom-intro').parentId);
    assert.ok(layout.order.indexOf('custom-intro') < layout.order.indexOf('custom-content'));
  }
  assert.doesNotMatch(JSON.stringify(layout), /media-igem2026|\/api\/media\/|\/mcp\?/);
}
const home = JSON.parse(values['layout:home']);
assert.ok(home.nodes.some(n => n.kind === 'html' && n.name === '3D model of the gel' && n.javascript));
assert.equal(home.nodes.filter(n => n.kind === 'image').length, 20);
for (const page of ['home', 'team', 'human-practices', 'entrepreneurship']) {
  const layout = JSON.parse(values['layout:' + page]);
  const logos = layout.nodes.filter(n => n.id.startsWith(`luca-${page}-sponsor-`));
  assert.equal(logos.length, 20, `${page}: complete sponsor list`);
  assert.equal(new Set(logos.map(n => n.src)).size, 20, `${page}: no duplicate saved logos`);
  for (const logo of logos) assert.ok((await readFile('public' + logo.src)).length > 0);
  assert.doesNotMatch(layout.customCss, /animation:luca-sponsors \d+s ease-in-out/, 'no short back-and-forth movement');
}
const menus = JSON.parse(values['site:menu']);
assert.equal(menus.groups.length, 3);
const styles = JSON.parse(await readFile('app/luca-styles.json', 'utf8'));
assert.ok(styles.includes('[data-template-theme="luca"]'));

const db = new DatabaseSync(':memory:');
db.exec('CREATE TABLE blocks(id TEXT PRIMARY KEY,value TEXT NOT NULL,version INTEGER NOT NULL,author TEXT NOT NULL); CREATE TABLE presence(id TEXT PRIMARY KEY,name TEXT NOT NULL,seen INTEGER NOT NULL);');
const projects = createProjects(db);
const first = projects.create('Luca one', 'luca');
const second = projects.create('Luca two', 'luca');
const a = projects.scope(first), b = projects.scope(second);
const row = a.select.get('layout:home');
home.nodes[1].title = 'My saved title';
a.update.run(JSON.stringify(home), 'test', 'layout:home', row.version);
assert.notEqual(a.select.get('layout:home').value, b.select.get('layout:home').value);
assert.equal(b.select.get('layout:home').value, values['layout:home']);
const existing = projects.create('Existing notebook', 'regelerate');
const store = projects.scope(existing);
const before = store.rows.all().filter(r => r.id !== 'site:appearance');
const changes = createTemplateChanges(db, projects);
const preview = changes.preview(existing, 'luca', 'test');
changes.apply(existing, preview.token, 'test');
assert.deepEqual(store.rows.all().filter(r => r.id !== 'site:appearance'), before);
db.close();
await mkdir('work', { recursive: true });
await writeFile('work/luca-template-snapshot.json', JSON.stringify({ format: 'prion-wiki-snapshot', version: 1, values }));
console.log('PASS: Luca has 15 valid editable pages, local sponsor assets, sandboxed animation, saved menus, independent projects and content-preserving appearance preview/apply.');
