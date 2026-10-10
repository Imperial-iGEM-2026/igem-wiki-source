import assert from 'node:assert/strict';
import { mkdtemp, open, writeFile, readFile, symlink } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { generateKeyPair, SignJWT } from 'jose';
import { createAppServer } from '../selfhost-dist/server/app.mjs';
import { newNode, emptyLayout } from '../selfhost-dist/server/shared.mjs';
import { exportMedia } from './export-media.mjs';
import { createBundleExports } from '../selfhost-dist/server/export-bundles.mjs';

const keys = await generateKeyPair('RS256');
const environment = {
  CF_ACCESS_TEAM_DOMAIN: 'https://example.cloudflareaccess.com',
  CF_ACCESS_AUD: 'export-test',
  CF_ACCESS_ORIGIN: 'https://editor.example.com',
};
const token = async (sub) =>
  new SignJWT({ email: sub + '@example.com' })
    .setProtectedHeader({ alg: 'RS256' })
    .setSubject(sub)
    .setIssuer(environment.CF_ACCESS_TEAM_DOMAIN)
    .setAudience(environment.CF_ACCESS_AUD)
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(keys.privateKey);
const jwt = await token('first'),
  otherJwt = await token('second');
const dataDir = await mkdtemp(path.resolve('work/export-bundles-test-'));
const server = await createAppServer({
  environment,
  dataDir,
  clientDir: path.resolve('selfhost-dist/client'),
  keyOverride: keys.publicKey,
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:' + server.address().port;
const request = (url, body, project, extra = {}) =>
  fetch(origin + url, {
    method: body ? 'POST' : 'GET',
    headers: {
      origin: environment.CF_ACCESS_ORIGIN,
      'cf-access-jwt-assertion': jwt,
      'Content-Type': 'application/json',
      ...(project ? { 'X-Prion-Project': project } : {}),
      ...extra,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
const prepare = (project) =>
  request(
    '/api/export/bundles',
    {
      team: 'imperial-college',
      requiredPages: ['safety-and-security', 'education'],
    },
    project,
  );
const create = async (name, templateId) => {
  const res = await request('/api/projects', {
    action: 'create',
    name,
    templateId,
  });
  assert.equal(res.status, 201);
  return (await res.json()).id;
};
const save = async (project, id, value) => {
  const content = await (await request('/api/content', null, project)).json();
  const version = content.rows.find((row) => row.id === id)?.version || 0;
  const res = await request('/api/content', { id, value, version }, project);
  assert.equal(res.status, 200, await res.text());
};
const download = async (plan, key, project) => {
  const item = plan.downloads.find((entry) => entry.key === key);
  const res = await request(item.url + '?project=' + project);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'application/zip');
  await pipeline(
    Readable.fromWeb(res.body),
    createWriteStream(path.join(dataDir, item.filename)),
  );
};
try {
  assert.equal((await fetch(origin + '/api/export/bundles')).status, 401);
  const helper = await request('/upload-helper.zip');
  assert.equal(helper.status, 200);
  assert.equal(helper.headers.get('content-type'), 'application/zip');
  assert.match(
    helper.headers.get('content-disposition'),
    /regelerate-upload-helper.zip/,
  );
  assert.equal(
    Buffer.from(await helper.arrayBuffer()).readUInt32LE(0),
    0x04034b50,
  );
  const project = await create('Export test', 'notebook-purple');
  const second = await create('Other project', 'notebook-purple');
  assert.equal(
    (
      await request(
        '/api/export/bundles',
        { team: 'imperial-college', requiredPages: ['hardware'] },
        project,
      )
    ).status,
    422,
  );
  assert.equal(
    (
      await request(
        '/api/export/bundles',
        { team: 'imperial-college', requiredPages: ['../bad'] },
        project,
      )
    ).status,
    400,
  );
  assert.equal((await prepare()).status, 409);
  assert.equal(
    (await request('/api/export/bundles', { team: '../bad' }, project)).status,
    400,
  );
  assert.equal(
    (
      await request(
        '/api/export/bundles',
        { team: 'imperial-college' },
        project,
        { origin: 'https://wrong.example.com' },
      )
    ).status,
    403,
  );
  await save(project, 'brand', 'Frozen export brand');
  await save(project, 'ai:brief', 'PRIVATE_AI_BRIEF');
  const res = await prepare(project);
  assert.equal(res.status, 200, res.status === 200 ? '' : await res.text());
  const plan = await res.json();
  assert.equal(plan.downloads.length, 3);
  assert.equal(
    plan.downloads.find((entry) => entry.key === 'assets').files,
    28,
  );
  assert.equal(plan.downloads.find((entry) => entry.key === 'media').files, 0);
  await save(project, 'brand', 'Newer unsnapshotted brand', 1);
  const sourceURL = plan.downloads[0].url;
  assert.equal(
    (
      await request(sourceURL, null, project, {
        'cf-access-jwt-assertion': otherJwt,
      })
    ).status,
    404,
  );
  assert.equal((await request(sourceURL, null, second)).status, 404);
  for (const key of ['source', 'assets', 'media'])
    await download(plan, key, project);
  const validate = `import zipfile,json,sys,pathlib
root=pathlib.Path(sys.argv[1])
for p in root.glob('*.zip'):
 with zipfile.ZipFile(p) as z: assert z.testzip() is None
with zipfile.ZipFile(root/'01-website-source.zip') as z:
 values=json.loads(z.read('publication/content.json'))['values']
 assert values['brand']=='Frozen export brand'
 assert json.loads(z.read('publication/config.json'))['requiredPages']==['safety-and-security','education']
 assert all(p['present'] for p in json.loads(z.read('publication/url-check.json'))['standardPages'])
 assert 'ai:brief' not in values
 assert 'scripts/export-media.mjs' in z.namelist()
 assert not any(n.lower().endswith('.md') for n in z.namelist())
 assert not any(n.startswith(('server/','public/','node_modules/')) for n in z.namelist())
 assert b'SPDX-License-Identifier: CC-BY-4.0' in z.read('LICENSE')
 z.extractall(root/'source')
with zipfile.ZipFile(root/'02-static-assets.zip') as z:
 assert all(n.startswith(('assets/logos/', 'assets/fonts/')) for n in z.namelist() if n.startswith('assets/'))
 assert sum(n.endswith('.ttf') for n in z.namelist()) == 4
 assert sum(n.endswith('-OFL.txt') for n in z.namelist()) == 3
with zipfile.ZipFile(root/'03-video-audio.zip') as z:
 assert 'No local recordings' in z.read('UPLOAD-FIRST.txt').decode()
print('ZIP64 CRC, source isolation and frozen snapshot passed')`;
  console.log(
    execFileSync(process.env.PYTHON || 'python', ['-c', validate, dataDir], {
      encoding: 'utf8',
    }),
  );
  // Build the exact source downloaded from the HTTP endpoint, with test-only reviews/URLs.
  const checkout = path.join(dataDir, 'source');
  await symlink(
    path.resolve('node_modules'),
    path.join(checkout, 'node_modules'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  assert.match(
    await readFile(path.join(checkout, 'LICENSE'), 'utf8'),
    /SPDX-License-Identifier: CC-BY-4.0/,
  );
  const publication = path.join(checkout, 'publication');
  for (const name of ['.gitlab-ci.yml', 'ops/igem.gitlab-ci.yml']) {
    assert.equal(
      await readFile(path.join(checkout, name), 'utf8'),
      await readFile('ops/igem.gitlab-ci.yml', 'utf8'),
    );
  }
  const config = JSON.parse(
    await readFile(path.join(publication, 'config.json'), 'utf8'),
  );
  const review = JSON.parse(
    await readFile(path.join(publication, 'review.json'), 'utf8'),
  );
  assert.equal(review.sourceReviewed, false);
  for (const key of Object.keys(review))
    if (typeof review[key] === 'boolean') review[key] = true;
  review.reviewer = 'Synthetic test fixture';
  review.reviewedAt = '2026-10-05';
  await writeFile(
    path.join(publication, 'review.json'),
    JSON.stringify(review),
  );
  const map = JSON.parse(
    await readFile(path.join(publication, 'media-map.json'), 'utf8'),
  );
  for (const source of Object.keys(map))
    map[source] =
      'https://static.igem.wiki/teams/6377/test-fixture/' +
      path.basename(source);
  await writeFile(
    path.join(publication, 'media-map.json'),
    JSON.stringify(map),
  );
  config.fontCss = '';
  assert.ok(plan.info?.fontsIncluded !== false);
  config.attributionUrl = 'https://teams.igem.org/wiki/6377/attributions';
  await writeFile(
    path.join(publication, 'config.json'),
    JSON.stringify(config),
  );
  execFileSync(process.execPath, ['scripts/build-igem.mjs'], {
    cwd: checkout,
    stdio: 'pipe',
  });
  const report = JSON.parse(
    await readFile(
      path.join(checkout, 'igem-build/publication-report.json'),
      'utf8',
    ),
  );
  assert.equal(report.pageCount, 20);
  assert.deepEqual(report.issues, []);
  console.log(
    'Downloaded website source builds all 20 pages with the configured iGEM URL prefix.',
  );
  const video = newNode('recording', 'video');
  video.src = '/api/media/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.mp4';
  const layout = { ...emptyLayout, order: ['recording'], nodes: [video] };
  await save(second, 'layout:home', JSON.stringify(layout));
  assert.equal(
    (await prepare(second)).status,
    422,
    'Missing media must fail before any download',
  );
  const file = await open(
    path.join(dataDir, 'media/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.mp4'),
    'w',
  );
  await file.truncate(151 * 1024 * 1024);
  await file.close();
  const large = await (await prepare(second)).json();
  assert.equal(large.downloads.find((item) => item.key === 'media').files, 1);
  await download(large, 'media', second);
  console.log(
    execFileSync(
      process.env.PYTHON || 'python',
      [
        '-c',
        `import zipfile,sys
with zipfile.ZipFile(sys.argv[1]) as z:
 assert z.testzip() is None
 media=[n for n in z.namelist() if n.startswith('media/')]
 assert all(n.startswith('media/videos/') for n in media)
 assert len(media)==1 and z.getinfo(media[0]).file_size==151*1024*1024
print('151 MiB recording streamed successfully with valid ZIP64 CRC')`,
        path.join(dataDir, '03-video-audio.zip'),
      ],
      { encoding: 'utf8' },
    ),
  );
  await writeFile(
    path.join(dataDir, 'media/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.mp4'),
    'changed',
  );
  assert.equal(
    (
      await request(
        large.downloads.find((item) => item.key === 'media').url,
        null,
        second,
      )
    ).status,
    409,
  );
  const hidden = { ...newNode('parent', 'section'), hidden: true };
  assert.equal(
    exportMedia(
      {
        'layout:home': JSON.stringify({
          ...emptyLayout,
          nodes: [hidden, { ...video, parentId: 'parent' }],
        }),
      },
      { pages: [] },
    ).size,
    0,
  );
  assert.equal(
    exportMedia(
      {
        'pages:removed': '["removed"]',
        'layout:removed': JSON.stringify(layout),
      },
      { pages: [] },
    ).size,
    0,
  );
  const expiring = createBundleExports({
    dataDir,
    clientDir: path.resolve('selfhost-dist/client'),
    now: () => clock,
  });
  let clock = Date.now();
  await assert.rejects(
    expiring.prepare({
      userId: 'one',
      project: { id: 'one', name: 'test' },
      values: { 'pages:removed': '["contribution"]' },
      template: {
        pages: [
          'attributions',
          'contribution',
          'engineering',
          'human-practices',
        ].map((slug) => ({ slug, layers: [] })),
      },
      team: 'imperial-college',
    }),
    { status: 422 },
  );
  const expires = await expiring.prepare({
    userId: 'one',
    project: { id: 'one', name: 'test' },
    values: {},
    template: {
      pages: [
        'attributions',
        'contribution',
        'engineering',
        'human-practices',
      ].map((slug) => ({ slug, layers: [] })),
    },
    team: 'imperial-college',
  });
  clock += 31 * 60 * 1000;
  await assert.rejects(
    expiring.download({
      id: expires.id,
      key: 'source',
      userId: 'one',
      projectId: 'one',
    }),
    { status: 404 },
  );
  expiring.close();
  console.log(
    'PASS: authenticated exports, origin/project/user isolation, frozen source, missing/changed media, large recording, hidden/removed assets, and expiry.',
  );
  console.log('Extracted source:', path.join(dataDir, 'source'));
} finally {
  await new Promise((resolve) => server.close(resolve));
}
