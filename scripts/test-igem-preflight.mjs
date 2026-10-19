import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, stat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import {
  templateDefaults,
  newNode,
  publicationSlug,
  igemPageCheck,
} from '../selfhost-dist/server/shared.mjs';

assert.equal(publicationSlug('safety', ['safety']), 'safety-and-security');
assert.equal(
  publicationSlug('safety', ['safety', 'safety-and-security']),
  'safety',
);
assert.equal(
  igemPageCheck(['hardware'], ['hardware'], '/team/').find(
    (p) => p.slug === 'hardware',
  ).present,
  true,
);
assert.equal(
  igemPageCheck([], ['hardware'], '/team/').find((p) => p.slug === 'hardware')
    .present,
  false,
);
const root = await mkdtemp(path.resolve('work/igem-preflight-'));
const values = templateDefaults('notebook-purple');
const layout = JSON.parse(values['layout:home']);
for (const [id, kind, src] of [
  ['empty-video', 'video', ''],
  ['watch-video', 'video', 'https://video.igem.org/w/test-video'],
  ['embed-video', 'video', 'https://video.igem.org/videos/embed/test-video'],
  ['configured-video', 'video', 'https://video.igem.org/videos/embed/configured?title=0&warningTitle=0&start=3s'],
  ['configured-embed', 'embed', 'https://video.igem.org/videos/embed/configured?title=0&warningTitle=0&start=3s'],
  ['cdn-audio', 'audio', 'https://static.igem.wiki/test/audio.mp3'],
]) {
  layout.nodes.push({
    id,
    src,
    kind,
    title: id,
    body: '',
    caption: '',
    alt: '',
    span: 12,
    align: 'left',
    background: '',
    padding: 0,
    hidden: false,
  });
  layout.order.push(id);
}
layout.nodes.push({ ...newNode('html-video', 'html'), html:'<iframe title="HTML video test" src="https://video.igem.org/videos/embed/configured?title=0&warningTitle=0&start=3s" allow="fullscreen"></iframe><img src="/templates/notebook-purple/favicon.svg" alt="Mapped HTML image">' });
layout.order.push('html-video');
values['layout:home'] = JSON.stringify(layout);
const snapshot = path.join(root, 'snapshot.json');
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
    '--out',
    out,
    '--base',
    '/imperial-college/',
    '--required-pages',
    'hardware,safety-and-security,education',
    '--repository',
    'https://gitlab.igem.org/2026/imperial-college',
    '--license-confirmed',
    '--igem',
  ],
  { encoding: 'utf8' },
);
assert.equal(result.status, 2, result.stdout + result.stderr);
const report = JSON.parse(
  await readFile(path.join(out, 'publication-report.json'), 'utf8'),
);
assert.equal(report.submissionReady, false);
for (const slug of [
  'contribution',
  'engineering',
  'human-practices',
  'safety-and-security',
  'education',
]) {
  assert.ok(
    report.standardPages.some(
      (p) =>
        p.slug === slug && p.present && p.path === '/imperial-college/' + slug,
    ),
  );
  assert.ok(
    (await stat(path.join(out, 'public', slug, 'index.html'))).isFile(),
  );
}
assert.ok(
  report.issues.includes(
    'Missing required iGEM page: /imperial-college/hardware',
  ),
);
// Bundled fonts no longer require Google Fonts hosting.
assert.ok(!report.issues.some((s) => s.includes('Google Fonts')));
assert.equal(report.recordingTodos.length, 5);
assert.ok(!report.assets.some(a => ['video', 'audio', 'embed'].includes(a.kind)));
const html = await readFile(path.join(out, 'public/index.html'), 'utf8');
assert.match(html, /href="\/imperial-college\/engineering\//);
assert.match(html, /rel="license"/);
assert.match(html, /href="\/imperial-college\/safety-and-security\//);
assert.ok((await stat(path.join(out, 'public/safety/index.html'))).isFile());
assert.match(html, /data-recording-todo="video"/);
assert.match(html, /data-recording-todo="audio"/);
assert.ok(!html.includes('<video src="https://video.igem.org/videos/embed/'));
assert.ok(!report.issues.some(s=>s.includes('embed URL') && s.includes('/configured?')));
assert.ok(html.includes('src="https://video.igem.org/videos/embed/configured?title=0&amp;warningTitle=0&amp;start=3s"'));
const htmlDocumentAttr = /data-html-document="([^"]*)"/.exec(html)?.[1];
assert.ok(htmlDocumentAttr, 'export retains the isolated HTML document');
assert.ok(htmlDocumentAttr.includes('title=0&amp;warningTitle=0&amp;start=3s'));
assert.ok(htmlDocumentAttr.includes('/imperial-college/templates/notebook-purple/favicon.svg'), 'HTML image reference must use the exported team prefix');
assert.ok(!html.includes('srcDoc='));
const map = JSON.parse(
  await readFile(path.join(out, 'media-map.example.json'), 'utf8'),
);
assert.equal(map['https://video.igem.org/w/test-video'], undefined);
console.log(
  'PASS: Imperial medal routes exist; missing selected award, Purple Google Fonts and recordings become TODOs without upload mappings; existing embeds and template license footer work.\n' +
    out,
);

assert.ok(!report.standardPages.some(p => p.slug === "attributions"));
assert.ok(!report.issues.some(s => s.includes("attribution-url")));
