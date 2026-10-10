import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, stat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
const templates = JSON.parse(await readFile('app/template-data.json', 'utf8'));
function firstLink(node, key = 'link-0') {
  if (!node || typeof node !== 'object' || !node.t) return null;
  if (node.t === 'a') return key;
  for (const [i, child] of node.c.entries()) {
    const found = firstLink(child, key + '-' + i);
    if (found) return found;
  }
  return null;
}
const root = await mkdtemp(path.resolve('work/template-publication-'));
const run = (args, env = process.env) => {
  const r = spawnSync(process.execPath, args, { encoding: 'utf8', env });
  if (r.status !== 0) throw Error(r.stdout + '\n' + r.stderr);
  return r.stdout;
};
for (const id of ['regelerate', 'swiss', 'blank']) {
  const snapshot = JSON.parse(
    await readFile('work/template-' + id + '-snapshot.json', 'utf8'),
  );
  const fields = Object.keys(snapshot.values).filter((k) =>
    k.startsWith('template:home:'),
  );
  if (fields.length) snapshot.values[fields[0]] = 'Saved template edit';
  const home = JSON.parse(snapshot.values['layout:home']);
  // A plain text section from the team page (new pages also hold layout layers).
  const { parentId: _parent, ...node } = JSON.parse(
    snapshot.values['layout:team-journal'],
  ).nodes.find((n) => n.kind === 'text');
  home.nodes.push({
    ...node,
    id: 'export-test',
    title: 'Saved custom layer',
    body: 'Content from this project only.',
    linkTo: 'https://example.org/research#details',
  });
  home.order.push('export-test');
  if (id !== 'blank') {
    const header = templates[id].pages
      .find((p) => p.slug === 'home')
      .layers.find((l) => l.region === 'header');
    const key = firstLink(header.ast);
    assert.ok(key);
    home.nodes.push({
      ...node,
      id: header.id,
      kind: 'template',
      title: 'Header',
      links: { [key]: 'https://example.org/team' },
    });
    home.order.push(header.id);
  }
  snapshot.values['layout:home'] = JSON.stringify(home);
  const input = path.join(root, id + '.json'),
    out = path.join(root, id);
  await writeFile(input, JSON.stringify(snapshot));
  run([
    'scripts/export-static.mjs',
    '--snapshot',
    input,
    '--base',
    '/imperial/',
    '--out',
    out,
  ]);
  const report = JSON.parse(
    await readFile(path.join(out, 'publication-report.json'), 'utf8'),
  );
  assert.equal(report.pageCount, id === 'blank' ? 2 : 21);
  const homeHtml = await readFile(path.join(out, 'public/index.html'), 'utf8');
  assert.match(homeHtml, /Saved custom layer/);
  assert.ok(homeHtml.includes('href="https://example.org/research#details"'));
  if (id !== 'blank')
    assert.ok(homeHtml.includes('href="https://example.org/team"'));
  assert.ok(!homeHtml.includes('Small proteins. Big questions.'));
  assert.ok(!/\b(?:href|src)="\/(api|auth)\//.test(homeHtml));
  if (fields.length) assert.match(homeHtml, /Saved template edit/);
  if (id !== 'blank') {
    assert.ok(homeHtml.includes('/imperial/description/'));
    assert.ok(homeHtml.includes('data-template-theme="' + id + '"'));
    const custom = await readFile(
      path.join(out, 'public/team-journal/index.html'),
      'utf8',
    );
    assert.match(custom, /reGELerate homepage/);
    assert.match(custom, /Team journal/);
  }
  for (const asset of report.assets)
    if (asset.file)
      assert.ok((await stat(path.join(out, asset.file))).isFile());
  const restore = path.join(root, id + '-restore');
  run(['selfhost-dist/server/import-snapshot.mjs', input], {
    ...process.env,
    DATA_DIR: restore,
  });
  const db = new DatabaseSync(path.join(restore, 'wiki.sqlite'));
  const project = db.prepare('SELECT * FROM projects WHERE archived=0').get();
  assert.equal(project.template_id, id);
  for (const [key, value] of Object.entries(snapshot.values))
    assert.equal(
      db
        .prepare('SELECT value FROM project_blocks WHERE project_id=? AND id=?')
        .get(project.id, key)?.value,
      value,
      key,
    );
  db.close();
  console.log(
    'PASS: ' +
      id +
      ' static pages, saved text/layers, base-path navigation, copied artwork, no old starter, custom-page header, and snapshot restore.',
  );
}
console.log('Review artifacts: ' + root);
