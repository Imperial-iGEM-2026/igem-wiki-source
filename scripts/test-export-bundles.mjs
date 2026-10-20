import { publicationRuntime } from './publication-runtime.mjs';
import assert from 'node:assert/strict';
import { partitionSource } from './source-parts.mjs';
import { request as httpRequest } from 'node:http';
// Send the fixture's public Host explicitly while connecting over localhost.
// Node's Fetch implementation can replace Host with the socket destination.
function fetch(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      url,
      {
        method: options.method || 'GET',
        headers: {
          host: 'editor.example.com',
          ...options.headers,
        },
      },
      (res) => {
        resolve(
          new Response(Readable.toWeb(res), {
            status: res.statusCode,
            headers: res.headers,
          }),
        );
      },
    );
    req.on('error', reject);
    req.end(options.body);
  });
}
import { mkdtemp, writeFile, readFile, symlink, mkdir } from 'node:fs/promises';
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
  MEDIA_ORIGIN: 'https://media.example.com',
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
      host: new URL(environment.CF_ACCESS_ORIGIN).host,
      origin: environment.CF_ACCESS_ORIGIN,
      'cf-access-jwt-assertion': jwt,
      'Content-Type': 'application/json',
      'X-Prion-Layout-Protocol': '2',
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
  assert.equal(
    (
      await fetch(origin + '/api/export/bundles', {
        headers: { host: new URL(environment.CF_ACCESS_ORIGIN).host },
      })
    ).status,
    401,
  );
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
  assert.equal((await fetch(origin + '/api/search-index')).status,401);
  await save(project, 'home:title', 'Unique search project marker');
  const search = await request('/api/search-index', null, project);
  assert.equal(search.status, 200);
  assert.ok(JSON.stringify(await search.json()).includes('Unique search project marker'));
  assert.ok(!JSON.stringify(await (await request('/api/search-index', null, second)).json()).includes('Unique search project marker'));
  assert.equal((await request('/api/search-index', null, 'missing-search-project')).status,404);
  const requestId = 'aaaaaaaa-bbbb-cccc-dddd-123456789012';
  const asyncResponse = await request(
    '/api/export/bundles',
    { team: 'imperial-college', requiredPages: ['hardware'], requestId },
    project,
    { Prefer: 'respond-async' },
  );
  assert.equal(asyncResponse.status, 202);
  const job = await asyncResponse.json();
  assert.match(job.statusURL, /^\/api\/export\/jobs\//);
  assert.equal((await request(job.statusURL, null, second)).status, 404);
  assert.equal(
    (
      await request(job.statusURL, null, project, {
        'cf-access-jwt-assertion': otherJwt,
      })
    ).status,
    404,
  );
  let jobState;
  for (let i = 0; i < 100; i++) {
    jobState = await (await request(job.statusURL, null, project)).json();
    if (jobState.state === 'failed') break;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.equal(jobState.state, 'failed');
  assert.equal(jobState.errorStatus, 422);
  assert.match(jobState.error, /Missing required pages/);
  const duplicate = await (
    await request(
      '/api/export/bundles',
      { team: 'imperial-college', requiredPages: ['hardware'], requestId },
      project,
      { Prefer: 'respond-async' },
    )
  ).json();
  assert.equal(duplicate.id, job.id);

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
  const savedHome = (
    await (await request('/api/content', null, project)).json()
  ).rows.find((row) => row.id === 'layout:home');
  const nestedHome = JSON.parse(savedHome.value);
  const accordion = {
    ...newNode('export-accordion', 'accordion', 'Nested export'),
    items: [
      {
        id: 'export-item',
        title: 'Export subsection',
        body: 'Original subsection text. [Linked section](/#section-export-accordion--item-export-item)',
      },
    ],
  };
  const nestedImage = {
    ...newNode('export-image', 'image'),
    parentId: accordion.id,
    parentItemId: 'export-item',
    src: '/templates/notebook-purple/favicon.svg',
    alt: 'Nested export image',
  };
  const largeComponent = {
    ...newNode('export-large-code', 'html'),
    javascript: '/*' + 'é'.repeat(65534) + '*/',
    html: '<p>Large component preserved</p>',
  };
  const absoluteLogos = [
    'https://editor.example.com/templates/regelerate/sponsor-logos/benchling.svg',
    'https://media.example.com/templates/regelerate/sponsor-logos/atlassian.svg',
    'https://media.example.com/templates/regelerate/sponsor-logos/neb.jpg?v=2#logo',
  ].map((src, i) => ({ ...newNode('absolute-logo-' + i, 'image'), src }));
  nestedHome.nodes.push(
    accordion,
    nestedImage,
    largeComponent,
    ...absoluteLogos,
  );
  nestedHome.order.push(
    accordion.id,
    nestedImage.id,
    largeComponent.id,
    ...absoluteLogos.map((n) => n.id),
  );
  await save(project, 'layout:home', JSON.stringify(nestedHome));
  const grant = await (
    await request('/api/mcp-links', { action: 'prepare-developer' }, project)
  ).json();
  const developer = await (
    await request(
      '/api/mcp-links',
      {
        name: 'Export source test',
        days: 1,
        mode: 'developer',
        confirmation: grant.confirmation,
        confirmDeveloper: true,
      },
      project,
    )
  ).json();
  const devKey = new URL(developer.url).searchParams.get('key');
  const sourceCall = async (name, args) => {
    const response = await fetch(origin + '/mcp?key=' + devKey, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        host: new URL(environment.CF_ACCESS_ORIGIN).host,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name, arguments: args },
      }),
    });
    const result = (await response.json()).result;
    assert.ok(!result.isError, result.content[0].text);
    return JSON.parse(result.content[0].text);
  };
  const newSource = await sourceCall('read_source_file', {
    path: 'app/project-components/ExportTest.tsx',
  });
  const sourceLease = await sourceCall('acquire_source_lock', {
    path: newSource.path,
  });
  await sourceCall('write_source_file', {
    path: newSource.path,
    lockToken: sourceLease.lockToken,
    ifVersion: newSource.version,
    ifBaseHash: newSource.baseHash,
    content: 'export default function Example() { return null; }',
  });
  await sourceCall('release_source_lock', {
    path: newSource.path,
    lockToken: sourceLease.lockToken,
  });
  const res = await prepare(project);
  assert.equal(res.status, 200, res.status === 200 ? '' : await res.text());
  const plan = await res.json();
  assert.deepEqual(plan.sourceChanges, [
    'app/project-components/ExportTest.tsx',
  ]);
  assert.equal(plan.downloads.length, 2);
  assert.equal(
    plan.downloads.find((entry) => entry.key === 'assets').files,
    33 + publicationRuntime.length,
  );
  assert.deepEqual(plan.recordingTodos, []);
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
  for (const key of ['source', 'assets']) await download(plan, key, project);
  const validate = `import zipfile,json,sys,pathlib,csv,io
root=pathlib.Path(sys.argv[1])
for p in root.glob('*.zip'):
 with zipfile.ZipFile(p) as z: assert z.testzip() is None
with zipfile.ZipFile(root/'01-website-source.zip') as z:
 assert z.read('app/project-components/ExportTest.tsx')==b'export default function Example() { return null; }'
 assert json.loads(z.read('bundle-info.json'))['sourceChanges']==['app/project-components/ExportTest.tsx']
 values=json.loads(z.read('publication/content.json'))['values']
 large=next(n for n in json.loads(values['layout:home'])['nodes'] if n['id']=='export-large-code')
 assert len(large['javascript'].encode('utf-8'))==131072
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
 assert all(n.startswith(('assets/logos/', 'assets/fonts/', 'assets/icons/', 'assets/runtime/')) for n in z.namelist() if n.startswith('assets/'))
 assert sum(n.endswith('.ttf') for n in z.namelist()) == 4
 assert sum(n.endswith('-OFL.txt') for n in z.namelist()) == 3
 rows=list(csv.DictReader(io.StringIO(z.read('upload-manifest.csv').decode())))
 search=json.loads((root/'source/publication/search.json').read_text())
 searchrow=next(r for r in rows if r['source']==search['source'])
 assert searchrow['kind']=='runtime' and searchrow['file'].startswith('assets/runtime/search-')
 assert z.read(searchrow['file']).startswith(b'export default {')
 for host,filename,suffix in [('editor.example.com','benchling.svg',''),('media.example.com','atlassian.svg',''),('media.example.com','neb.jpg','?v=2#logo')]:
  source='https://'+host+'/templates/regelerate/sponsor-logos/'+filename+suffix
  row=next(r for r in rows if r['source']==source)
  assert row['file'].startswith('assets/logos/'),row
  assert z.read(row['file'])==(pathlib.Path('public/templates/regelerate/sponsor-logos')/filename).read_bytes()
 assert all(r['file'] for r in rows),rows
assert not (root/'03-video-audio.zip').exists()
with zipfile.ZipFile(root/'01-website-source.zip') as z:
 assert 'scripts/export-recordings.mjs' in z.namelist()
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
  // CI must consume the partitioned source directly, without committing a
  // reassembled large JSON file.
  const reviewedContent = JSON.parse(await readFile(path.join(publication, 'content.json'), 'utf8'));
  for (const file of partitionSource(reviewedContent, { force: true })) {
    const target = path.join(checkout, file.path);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, file.content);
  }
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
  const exportedHome = await readFile(
    path.join(checkout, 'igem-build/public/index.html'),
    'utf8',
  );
  assert.ok(exportedHome.includes('id="section-export-accordion--item-export-item"'));
  assert.ok(exportedHome.includes('href="/imperial-college/#section-export-accordion--item-export-item"'));
  const searchManifest=JSON.parse(await readFile(path.join(publication,'search.json'),'utf8'));
  assert.ok(exportedHome.includes('data-site-search="'+map[searchManifest.source]+'"'));
  assert.ok(!(await (await import('node:fs/promises')).readdir(path.join(checkout,'igem-build/public/assets'))).some(name=>/^search-[a-f0-9]{64}/.test(name)),'Search index belongs on the static host, not the Pages artifact');
  const exportedSubsection = exportedHome.match(
    /<details[^>]*data-item-id="export-item"[\s\S]*?<\/details>/,
  )?.[0];
  assert.ok(exportedSubsection, 'Export preserves the collapsible subsection');
  assert.match(exportedSubsection, /Nested export image/);
  assert.match(exportedSubsection, /Original subsection text/);
  console.log(
    'Downloaded website source builds all 20 pages with the configured iGEM URL prefix.',
  );
  const video = newNode('recording', 'video');
  video.src = '/api/media/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.mp4';
  video.name = 'Lab recording';
  const layout = { ...emptyLayout, order: ['recording'], nodes: [video] };
  const invalid = newNode('bad-image', 'image');
  invalid.name = 'Lab photo';
  invalid.src = '/templates/notebook-purple//logo.png';
  await save(
    second,
    'layout:home',
    JSON.stringify({
      ...layout,
      order: ['recording', 'bad-image'],
      nodes: [video, invalid],
    }),
  );
  const failedExport = await prepare(second);
  assert.equal(failedExport.status, 422);
  const diagnostic = await failedExport.json();
  assert.equal(
    diagnostic.mediaIssues.length,
    1,
    'Excluded recordings must not block static media validation',
  );
  const invalidIssue = diagnostic.mediaIssues.find(
    (issue) => issue.source === invalid.src,
  );
  assert.match(invalidIssue.reason, /Invalid media path/);
  assert.equal(invalidIssue.locations[0].page, 'home');
  assert.equal(invalidIssue.locations[0].layerId, 'bad-image');
  assert.equal(invalidIssue.locations[0].layerName, 'Lab photo');
  assert.ok(
    !diagnostic.mediaIssues.some((issue) => issue.source === video.src),
  );
  assert.ok(
    !JSON.stringify(diagnostic).includes(dataDir),
    'Do not expose filesystem paths',
  );
  await save(second, 'layout:home', JSON.stringify(layout));
  const missingRecording = await prepare(second);
  assert.equal(
    missingRecording.status,
    200,
    'Excluded recordings do not need local files',
  );
  const recordingPlan = await missingRecording.json();
  assert.equal(recordingPlan.downloads.length, 2);
  assert.equal(recordingPlan.recordingTodos[0].source, video.src);
  assert.equal(
    recordingPlan.recordingTodos[0].locations[0].layerName,
    'Lab recording',
  );
  await download(recordingPlan, 'source', second);
  console.log(
    execFileSync(
      process.env.PYTHON || 'python',
      [
        '-c',
        `import zipfile,json,sys
with zipfile.ZipFile(sys.argv[1]) as z:
 assert json.loads(z.read('publication/media-map.json')).get('/api/media/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.mp4') is None
 assert 'mp4' not in z.read('upload-manifest.csv').decode()
 assert json.loads(z.read('publication/recording-todos.json'))[0]['kind']=='video'
 node=json.loads(json.loads(z.read('publication/content.json'))['values']['layout:home'])['nodes'][0]
 assert node['kind']=='video' and node['src'].endswith('.mp4')
print('Recording excluded; saved source retained; TODO report present')`,
        path.join(dataDir, '01-website-source.zip'),
      ],
      { encoding: 'utf8' },
    ),
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
    ).has(video.src),
    false,
  );
  assert.equal(
    exportMedia(
      {
        'pages:removed': '["removed"]',
        'layout:removed': JSON.stringify(layout),
      },
      { pages: [] },
    ).has(video.src),
    false,
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
    'PASS: authenticated exports, origin/project/user isolation, frozen source, invalid static media, excluded missing recordings, hidden/removed assets, and expiry.',
  );
  console.log('Extracted source:', path.join(dataDir, 'source'));
} finally {
  await new Promise((resolve) => server.close(resolve));
}
