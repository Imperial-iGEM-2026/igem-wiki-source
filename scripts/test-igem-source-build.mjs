import assert from 'node:assert/strict';
import {
  mkdtemp,
  mkdir,
  cp,
  readFile,
  writeFile,
  symlink,
  access,
} from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { templateDefaults } from '../selfhost-dist/server/shared.mjs';
import {
  igemURL,
  externalResources,
  withoutGoogleFontImports,
} from './igem-resources.mjs';

assert.ok(igemURL('https://teams.igem.org/wiki/6377/attributions'));
assert.ok(!igemURL('https://igem.org.evil.example/file'));
assert.ok(!igemURL('https://igem.org@evil.example/file'));
assert.deepEqual(
  externalResources(
    '<a href="https://example.org/paper">Citation</a><img src="https://elsewhere.example/p.png"><iframe src="https://www.youtube.com/embed/x"></iframe><style>@import "https://external.example/font.css";</style>',
  ),
  [
    'https://elsewhere.example/p.png',
    'https://www.youtube.com/embed/x',
    'https://external.example/font.css',
  ],
);
assert.equal(
  withoutGoogleFontImports(
    '@import url("https://fonts.googleapis.com/css2?family=Test:wght@400;500&display=swap"); h1 {color: purple}',
  ).trim(),
  'h1 {color: purple}',
);

// An isolated source checkout: no server, public media, database or compiled output.
const checkout = await mkdtemp(path.resolve('work/igem-source-build-'));
for (const dir of ['app', 'components', 'hooks', 'lib'])
  await cp(dir, path.join(checkout, dir), { recursive: true });
for (const file of [
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  'scripts/build-igem.mjs',
  'scripts/artifact-size.mjs',
  'scripts/share-publication-assets.mjs',
  'scripts/export-static.mjs',
  'scripts/export-media.mjs',
  'scripts/export-recordings.mjs',
  'scripts/google-fonts.mjs',
  'scripts/pdf-parts.mjs',
  'scripts/image-export.mjs',
  'publication/katex-LICENSE.txt',
  'publication/pdf-processing-LICENSES.txt',
  'scripts/igem-resources.mjs',
  'scripts/build-options.mjs',
  'scripts/static-renderer.tsx',
  'scripts/static-runtime.ts',
  'ops/igem.gitlab-ci.yml',
]) {
  await mkdir(path.dirname(path.join(checkout, file)), { recursive: true });
  await cp(file, path.join(checkout, file));
}
// Use the already-installed locked dependencies locally; the CI job runs npm ci.
await symlink(
  path.resolve('node_modules'),
  path.join(checkout, 'node_modules'),
  process.platform === 'win32' ? 'junction' : 'dir',
);
await mkdir(path.join(checkout, 'publication'), { recursive: true });
await writeFile(
  path.join(checkout, 'LICENSE'),
  await readFile('publication/wiki-LICENSE.txt', 'utf8'),
);
const values = templateDefaults('notebook-purple');
const layout = JSON.parse(values['layout:home']);
layout.nodes.push({
  id: 'audio-test',
  kind: 'audio',
  title: 'Interview recording',
  body: '',
  src: '/api/media/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.mp3',
  caption: '',
  alt: '',
  span: 12,
  align: 'left',
  background: '',
  padding: 0,
  hidden: false,
});
layout.order.push('audio-test');
values['layout:home'] = JSON.stringify(layout);
const input = { format: 'prion-wiki-source', version: 1, values };
await writeFile(
  path.join(checkout, 'publication/content.json'),
  JSON.stringify(input),
);
const template = JSON.parse(await readFile('app/template-data.json', 'utf8'))[
  'notebook-purple'
];
const map = {};
function walk(n) {
  if (!n || typeof n !== 'object') return;
  if (n.a?.src?.startsWith('/templates/'))
    map[n.a.src] =
      'https://static.igem.wiki/teams/6377/test-fixture/' +
      path.basename(n.a.src);
  n.c?.forEach(walk);
}
template.pages.forEach((p) => p.layers.forEach((l) => walk(l.ast)));
const { templateFonts, siteIcon } = await import('./export-media.mjs');
map[siteIcon(values)] = 'https://static.igem.wiki/teams/6377/icons/favicon.svg';
for (const font of templateFonts(values))
  map[font.source] =
    'https://static.igem.wiki/teams/6377/test-fixture/' +
    path.basename(font.source);
map[layout.nodes.at(-1).src] = 'https://video.igem.org/videos/embed/test-audio';
await writeFile(
  path.join(checkout, 'publication/media-map.json'),
  JSON.stringify(map),
);
await writeFile(
  path.join(checkout, 'publication/fonts.css'),
  '@font-face {font-family: "DM Sans";src:url("https://static.igem.wiki/teams/6377/test-fixture/dm-sans.woff2")}',
);
await writeFile(
  path.join(checkout, 'publication/config.json'),
  JSON.stringify({
    teamSlug: 'imperial-college',
    repository: 'https://gitlab.igem.org/2026/imperial-college',
    source: 'publication/content.json',
    mediaMap: 'publication/media-map.json',
    review: 'publication/review.json',
    attributionUrl: 'https://teams.igem.org/wiki/6377/attributions',
    requiredPages: [],
    fontCss: 'publication/fonts.css',
  }),
);
const run = () =>
  spawnSync(process.execPath, ['scripts/build-igem.mjs'], {
    cwd: checkout,
    encoding: 'utf8',
  });
let result = run();
assert.equal(result.status, 0, result.stdout + result.stderr);
const report = JSON.parse(
  await readFile(
    path.join(checkout, 'igem-build/publication-report.json'),
    'utf8',
  ),
);
assert.equal(report.pageCount, 20);
assert.deepEqual(report.issues, []);
assert.equal(report.submissionReady, false);
assert.equal(report.recordingTodos.length, 1);
const html = await readFile(
  path.join(checkout, 'igem-build/public/index.html'),
  'utf8',
);
assert.match(html, /data-recording-todo="audio"/);
assert.ok(
  html.includes(
    '<link rel="icon" href="https://static.igem.wiki/teams/6377/icons/favicon.svg">',
  ),
);
assert.ok(!html.includes('fonts.googleapis.com'));
assert.ok(!/src="\/api\/media\//.test(html));
assert.ok(!html.includes('<audio'));
assert.match(html, /href="\/imperial-college\/engineering\//);
await assert.rejects(access(path.join(checkout, 'public')));
assert.equal(
  await readFile(path.join(checkout, 'igem-build/public/LICENSE'), 'utf8'),
  await readFile('publication/wiki-LICENSE.txt', 'utf8'),
);
const ci = await readFile(
  path.join(checkout, 'igem-build/.gitlab-ci.yml'),
  'utf8',
);
assert.match(ci, /npm ci --include=dev/);
assert.match(ci, /node scripts\/build-igem.mjs/);
assert.match(ci, /publish: igem-build\/public/);
assert.match(ci, /CI_COMMIT_BRANCH == "main"/);
input.media = {};
await writeFile(
  path.join(checkout, 'publication/content.json'),
  JSON.stringify(input),
);
result = run();
assert.notEqual(result.status, 0);
assert.match(result.stderr, /portable\/private snapshot/);
console.log(
  'PASS: clean source-only 20-page build with CC BY 4.0 LICENSE, mapped static media and recording TODOs; font replacement, resource checks, build without review checkboxes and private-snapshot rejection. No real uploads or credentials used.\n' +
    checkout,
);
