import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, stat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import {
  templateDefaults,
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
  ['watch-video', 'video', 'https://video.igem.org/w/test-video'],
  ['embed-video', 'video', 'https://video.igem.org/videos/embed/test-video'],
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
  'attributions',
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
assert.ok(report.issues.some((s) => s.includes('Google Fonts')));
assert.ok(
  report.issues.some(
    (s) => s.includes('embed URL') && s.endsWith('/audio.mp3'),
  ),
);
assert.ok(
  report.issues.some(
    (s) => s.includes('embed URL') && s.endsWith('/w/test-video'),
  ),
);
assert.ok(
  !report.issues.some(
    (s) => s.includes('embed URL') && s.endsWith('/embed/test-video'),
  ),
);
const html = await readFile(path.join(out, 'public/index.html'), 'utf8');
assert.match(html, /href="\/imperial-college\/engineering\//);
assert.match(html, /rel="license"/);
assert.match(html, /href="\/imperial-college\/safety-and-security\//);
assert.ok((await stat(path.join(out, 'public/safety/index.html'))).isFile());
assert.match(
  html,
  /<iframe[^>]*src="https:\/\/video\.igem\.org\/videos\/embed\/test-video"/,
);
assert.ok(!html.includes('<video src="https://video.igem.org/videos/embed/'));
const map = JSON.parse(
  await readFile(path.join(out, 'media-map.example.json'), 'utf8'),
);
assert.match(map['https://video.igem.org/w/test-video'], /videos\/embed\//);
console.log(
  'PASS: Imperial medal routes exist; missing selected award, Purple Google Fonts and watch-only video URLs block strict preflight; embed conversion and template license footer work.\n' +
    out,
);
