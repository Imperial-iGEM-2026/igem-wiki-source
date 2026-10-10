import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, stat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import {
  templates,
  templateDefaults,
} from '../selfhost-dist/server/shared.mjs';
const themeId = process.argv[2] || 'notebook-purple';
const template = templates[themeId];
assert.equal(template.pages.length, templates.regelerate.pages.length);
assert.equal(templateDefaults(themeId)['site:template'], themeId);
const walk = (n, visit) => {
  if (n && typeof n === 'object') {
    visit(n);
    n.c?.forEach((c) => walk(c, visit));
  }
};
for (const page of template.pages) {
  let disclosures = 0;
  for (const layer of page.layers)
    walk(layer.ast, (n) => {
      if ('f' in n) assert.equal(typeof template.fields[n.f], 'string');
      if (n.t === 'details' && /purple-/.test(n.a.class || '')) disclosures++;
      if (n.t === 'a' && /^\/[a-z-]+$/.test(n.a.href || ''))
        assert.ok(
          template.pages.some((p) => '/' + p.slug === n.a.href),
          n.a.href,
        );
    });
  if (!(themeId === 'notebook-white' && page.slug === 'home'))
    assert.ok(disclosures > 0, `${page.slug} has an interactive entry`);
}
// Theme adaptation must not recolour scientific reporter diagrams.
const readouts = (t) =>
  t.pages
    .find((p) => p.slug === 'home')
    .layers.find((l) => l.ast.a?.id === 'readouts');
assert.deepEqual(readouts(template).ast, readouts(templates.regelerate).ast);
if (themeId === 'notebook-white') {
  const home = template.pages.find((page) => page.slug === 'home');
  assert.ok(!home.layers.some((layer) => layer.id === 'purple-discovery'));
  for (const layer of home.layers)
    walk(layer.ast, (node) => {
      assert.notEqual(node.a?.class, 'purple-logo-stamp');
    });
  const svgs = (source) => {
    const found = new Map();
    for (const page of source.pages)
      for (const layer of page.layers)
        walk(layer.ast, (node) => {
          if (node.t === 'svg' && (node.a.id || node.a.class))
            found.set(node.a.id || node.a.class, node);
        });
    return found;
  };
  const original = svgs(templates.regelerate);
  const white = svgs(template);
  assert.ok(original.size >= 10);
  for (const [key, svg] of original)
    assert.deepEqual(
      white.get(key),
      svg,
      `Original Notebook SVG preserved: ${key}`,
    );
}
const root = await mkdtemp(path.resolve('work/purple-template-test-'));
const snapshot = path.join(root, 'snapshot.json');
const values = templateDefaults(themeId);
const edited = Object.keys(values).find(
  (key) => values[key] === 'Map the people',
);
values[edited] = 'Saved stakeholder timeline edit';
await writeFile(
  snapshot,
  JSON.stringify({ format: 'prion-wiki-snapshot', version: 1, values }),
);
const out = path.join(root, 'export');
const result = spawnSync(
  process.execPath,
  [
    'scripts/export-static.mjs',
    '--snapshot',
    snapshot,
    '--base',
    '/imperial/',
    '--out',
    out,
  ],
  { encoding: 'utf8' },
);
assert.equal(result.status, 0, result.stdout + result.stderr);
const report = JSON.parse(
  await readFile(path.join(out, 'publication-report.json'), 'utf8'),
);
assert.equal(report.pageCount, 20);
const hp = await readFile(
  path.join(out, 'public/human-practices/index.html'),
  'utf8',
);
assert.match(hp, /Saved stakeholder timeline edit/);
assert.match(hp, /purple-timeline-entry/);
assert.match(hp, /href="\/imperial\/engineering\//);
const model = await readFile(path.join(out, 'public/model/index.html'), 'utf8');
assert.match(model, /data-purple-network/);
assert.match(model, /type="range"/);
assert.match(model, /not a prediction/);
const home = await readFile(path.join(out, 'public/index.html'), 'utf8');
assert.match(home, /Small proteins/);
assert.match(home, new RegExp(themeId));
for (const asset of report.assets)
  if (asset.file) assert.ok((await stat(path.join(out, asset.file))).isFile());
await writeFile(
  themeId === 'notebook-white'
    ? 'work/white-review-location.txt'
    : 'work/purple-review-location.txt',
  out,
);
console.log(
  'PASS: 20 editable pages, valid links, every page has interactions, scientific colours preserved, timeline edits and network controls survive static export; all exported assets exist.\nPreview: ' +
    out,
);
