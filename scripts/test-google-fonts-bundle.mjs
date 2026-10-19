import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, symlink } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { createBundleExports } from '../selfhost-dist/server/export-bundles.mjs';
import {
  templateDefaults,
  templates,
  newNode,
} from '../selfhost-dist/server/shared.mjs';
import { extractZip, sourceFiles } from '../upload-helper/files.mjs';

const dir = await mkdtemp(path.resolve('work/google-fonts-bundle-'));
const sheet =
  'https://fonts.googleapis.com/css2?family=Roboto:wght@400;700&display=swap';
const font = 'https://fonts.gstatic.com/s/roboto/v1/test.woff2';
const fontBytes = Buffer.from('wOF2fixture-data');
const css = `@font-face{font-family:'Roboto';font-style:normal;font-weight:400 700;src:url(${font}) format('woff2');unicode-range:U+0000-00FF;}`;
const exporter = createBundleExports({
  dataDir: dir,
  clientDir: path.resolve('selfhost-dist/client'),
  fontFetcher: async (url) => {
    if (url === sheet) return new Response(css);
    if (url === font) return new Response(fontBytes);
    if (url.endsWith('/ofl/roboto/OFL.txt'))
      return new Response('Copyright Test Authors\nSIL OPEN FONT LICENSE');
    throw Error('Unexpected font request: ' + JSON.stringify(url));
  },
});
const values = templateDefaults('notebook-purple');
const layout = JSON.parse(values['layout:home']);
const node = {
  ...newNode('font-fixture', 'html'),
  name: 'Custom font example',
  html: `<link rel="preconnect" href="https://fonts.gstatic.com"><link rel="stylesheet" href="${sheet.replaceAll('&', '&amp;')}"><p style="font-family:Roboto">Font export fixture</p>`,
};
layout.nodes.push(node);
layout.order.push(node.id);
node.css = `@import url("${sheet}"); p { font-family: Roboto; }`;
values['layout:home'] = JSON.stringify(layout);
try {
  const plan = await exporter.prepare({
    userId: 'test',
    project: { id: 'test', name: 'Test' },
    team: 'imperial-college',
    values,
    template: templates['notebook-purple'],
  });
  assert.equal(plan.googleFontsDownloaded, 1);
  for (const key of ['source', 'assets']) {
    const zip = path.join(dir, key + '.zip');
    const res = createWriteStream(zip);
    res.writeHead = () => {};
    await exporter.download({
      id: plan.id,
      key,
      userId: 'test',
      projectId: 'test',
      res,
    });
    await extractZip(zip, path.join(dir, key));
  }
  const root = path.join(dir, 'source');
  const rows = await sourceFiles(root);
  for (const name of [
    'scripts/google-fonts.mjs',
    'publication/google-fonts.json',
    'publication/font-licenses/roboto-OFL.txt',
  ])
    assert.ok(
      rows.some((x) => x.path === name),
      name,
    );
  const manifest = JSON.parse(
    await readFile(path.join(root, 'publication/google-fonts.json'), 'utf8'),
  );
  assert.equal(manifest.stylesheets[sheet], css);
  const original = JSON.parse(
    await readFile(path.join(root, 'publication/content.json'), 'utf8'),
  );
  assert.deepEqual(
    original.values,
    Object.fromEntries(
      Object.entries(values).filter(([key]) => !key.startsWith('ai:')),
    ),
    'Preparation must not edit saved content',
  );
  const csv = await readFile(path.join(root, 'upload-manifest.csv'), 'utf8');
  const row = csv.split(/\r?\n/).find((x) => x.includes(font));
  assert.match(row, /assets\/fonts\/google-.*\.woff2/);
  const file = row.split(',')[3].replaceAll('"', '');
  assert.deepEqual(await readFile(path.join(dir, 'assets', file)), fontBytes);
  const mapPath = path.join(root, 'publication/media-map.json');
  const map = JSON.parse(await readFile(mapPath, 'utf8'));
  for (const source of Object.keys(map))
    map[source] =
      'https://static.igem.wiki/teams/6377/test/' + path.basename(source);
  await writeFile(mapPath, JSON.stringify(map));
  await symlink(
    path.resolve('node_modules'),
    path.join(root, 'node_modules'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  execFileSync(process.execPath, ['scripts/build-igem.mjs'], {
    cwd: root,
    stdio: 'pipe',
  });
  const report = JSON.parse(
    await readFile(
      path.join(root, 'igem-build/publication-report.json'),
      'utf8',
    ),
  );
  assert.deepEqual(report.issues, []);
  const html = await readFile(
    path.join(root, 'igem-build/public/index.html'),
    'utf8',
  );
  assert.ok(html.includes(map[font]));
  assert.ok(!/fonts\.(googleapis|gstatic)\.com/.test(html));
  assert.ok(html.includes('Font export fixture'));
  console.log(
    'PASS: server prepares fonts and licences; helper retains compiler and manifest; downloaded source builds without Google dependencies; custom iframe and its CSS preserve hosted fonts.',
  );
} finally {
  exporter.close();
}
