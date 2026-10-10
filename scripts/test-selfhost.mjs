import assert from 'node:assert/strict';
import { generateKeyPair, SignJWT } from 'jose';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createAppServer } from '../selfhost-dist/server/app.mjs';
import { initial } from '../selfhost-dist/server/shared.mjs';
const root = path.resolve('work');
await mkdir(root, { recursive: true });
const dataDir = await mkdtemp(path.join(root, 'selfhost-test-'));
const { privateKey, publicKey } = await generateKeyPair('RS256');
const environment = {
  CF_ACCESS_TEAM_DOMAIN: 'https://example.cloudflareaccess.com',
  CF_ACCESS_AUD: 'test-audience',
  CF_ACCESS_ORIGIN: 'https://editor.example.com',
};
const sign = (
  email = 'one@example.com',
  aud = 'test-audience',
  expiry = '10m',
) =>
  new SignJWT({ email, name: email })
    .setProtectedHeader({ alg: 'RS256' })
    .setSubject(email)
    .setIssuer(environment.CF_ACCESS_TEAM_DOMAIN)
    .setAudience(aud)
    .setIssuedAt()
    .setExpirationTime(expiry)
    .sign(privateKey);
let server = await createAppServer({
  dataDir,
  clientDir: path.resolve('selfhost-dist/client'),
  environment,
  keyOverride: publicKey,
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
let origin = 'http://127.0.0.1:' + server.address().port;
const token = await sign(),
  token2 = await sign('two@example.com');
const headers = {
  'X-Prion-Layout-Protocol': '2',
  'cf-access-jwt-assertion': token,
  origin: environment.CF_ACCESS_ORIGIN,
};
const get = (url, opts = {}) =>
  fetch(origin + url, { ...opts, headers: { ...headers, ...opts.headers } });
const post = (body, extra = {}) =>
  get('/api/content', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...extra },
    body: JSON.stringify(body),
  });
try {
  const nestedNode = {
    id: 'frame-api',
    kind: 'section',
    title: '',
    body: '',
    src: '',
    caption: '',
    alt: '',
    span: 12,
    align: 'left',
    background: '',
    padding: 0,
    hidden: false,
    layoutMode: 'free',
  };
  const nestedLayout = {
    nodes: [
      nestedNode,
      {
        ...nestedNode,
        id: 'button-api',
        kind: 'button',
        parentId: 'frame-api',
        linkTo: '/description',
        linkLabel: 'Project',
      },
    ],
    order: ['frame-api', 'button-api'],
    gap: 0,
    width: 'full',
    sidebar: true,
  };
  assert.equal(
    (
      await post({
        id: 'layout:engineering',
        value: JSON.stringify(nestedLayout),
        version: 0,
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await post({
        id: 'layout:engineering',
        value: JSON.stringify({
          ...nestedLayout,
          nodes: [{ ...nestedNode, parentId: 'frame-api' }],
        }),
        version: 1,
      })
    ).status,
    400,
  );
  const headerBody = {
    id: 'site:header',
    value: JSON.stringify({
      name: 'Imperial iGEM',
      logo: '/prion-hero.png',
      height: 88,
    }),
    version: 0,
  };
  assert.equal(
    (
      await post({
        ...headerBody,
        value: JSON.stringify({ logo: 'javascript:bad' }),
      })
    ).status,
    400,
  );
  assert.equal((await post(headerBody)).status, 200);
  assert.equal(
    (await post(headerBody)).status,
    409,
    'Stale shared header save must conflict',
  );
  for (const route of [
    '/',
    '/api/content',
    '/api/export',
    '/api/session',
    '/prion-hero.png',
  ])
    assert.equal((await fetch(origin + route)).status, 401, route);
  assert.equal(
    (
      await get('/api/content', {
        headers: {
          'X-Prion-Layout-Protocol': '2',
          'cf-access-jwt-assertion': await sign('bad@example.com', 'wrong'),
        },
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await get('/api/content', {
        headers: {
          'X-Prion-Layout-Protocol': '2',
          'cf-access-jwt-assertion': await sign(
            'bad@example.com',
            'test-audience',
            '-1m',
          ),
        },
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await post(
        { id: 'headline', value: 'No', version: 0 },
        { origin: 'https://attacker.example' },
      )
    ).status,
    403,
  );
  const edits = await Promise.all([
    post({ id: 'headline', value: 'First saved snapshot title', version: 0 }),
    post(
      { id: 'headline', value: 'Second saved snapshot title', version: 0 },
      { 'X-Prion-Layout-Protocol': '2', 'cf-access-jwt-assertion': token2 },
    ),
  ]);
  assert.deepEqual(edits.map((r) => r.status).sort(), [200, 409]);
  assert.equal(
    (await post({ id: 'headline', value: 'Stale overwrite', version: 0 }))
      .status,
    409,
  );
  assert.equal(
    (await post({ id: 'layout:home', value: '{}', version: 0 })).status,
    400,
  );
  assert.equal((await post({ presence: true })).status, 200);
  assert.equal(
    (
      await post(
        { presence: true },
        { 'X-Prion-Layout-Protocol': '2', 'cf-access-jwt-assertion': token2 },
      )
    ).status,
    200,
  );
  const content = await (await get('/api/content')).json();
  assert.equal(content.people.length, 2);
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j7gAAAABJRU5ErkJggg==',
    'base64',
  );
  const upload = await get('/api/media?name=fixture.png', {
    method: 'POST',
    body: png,
  });
  assert.equal(upload.status, 200);
  const asset = await upload.json();
  const range = await get(asset.url, { headers: { range: 'bytes=0-7' } });
  assert.equal(range.status, 206);
  assert.deepEqual(Buffer.from(await range.arrayBuffer()), png.subarray(0, 8));
  assert.equal(
    (await get(asset.url, { headers: { range: 'bytes=9999-' } })).status,
    416,
  );
  assert.equal((await fetch(origin + asset.url)).status, 401);
  assert.equal(
    (await get('/api/media?name=bad.pdf', { method: 'POST', body: png }))
      .status,
    400,
  );
  const node = {
    id: 'snapshot-image',
    kind: 'image',
    title: 'Exported image',
    body: '',
    src: asset.url,
    caption: 'Test caption',
    alt: 'One pixel fixture',
    span: 6,
    align: 'center',
    background: '#eef0aa',
    padding: 12,
    hidden: false,
  };
  const layout = {
    order: ['snapshot-image', 'explore'],
    nodes: [
      node,
      {
        ...node,
        id: 'hidden-test',
        kind: 'text',
        src: '',
        body: 'HIDDEN-DO-NOT-PUBLISH',
        hidden: true,
      },
    ],
    gap: 18,
    width: 'reading',
    sidebar: false,
  };
  assert.equal(
    (
      await post({
        id: 'layout:home',
        value: JSON.stringify(layout),
        version: 0,
      })
    ).status,
    200,
  );
  const snapshot = await (await get('/api/export')).json();
  assert.equal(snapshot.values['layout:home'], JSON.stringify(layout));
  assert.ok(!JSON.stringify(snapshot).includes('one@example.com'));
  snapshot.media = { [asset.url]: png.toString('base64') };
  await writeFile(
    path.join(root, 'test-snapshot.json'),
    JSON.stringify(snapshot),
  );
  const createPage = (body, extra = {}) =>
    get('/api/pages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...extra },
      body: JSON.stringify(body),
    });
  assert.equal(
    (
      await fetch(origin + '/api/pages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Denied', slug: 'denied' }),
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await createPage(
        { title: 'Denied', slug: 'denied' },
        { origin: 'https://bad.example' },
      )
    ).status,
    403,
  );
  for (const slug of ['api', 'description', '../bad', 'UPPER', ''])
    assert.equal((await createPage({ title: 'Invalid', slug })).status, 400);
  const competing = await Promise.all([
    createPage({ title: 'Custom A', slug: 'custom-a' }),
    createPage(
      { title: 'Custom A', slug: 'custom-a' },
      { 'X-Prion-Layout-Protocol': '2', 'cf-access-jwt-assertion': token2 },
    ),
  ]);
  assert.deepEqual(competing.map((r) => r.status).sort(), [201, 409]);
  assert.equal(
    (await createPage({ title: 'Custom B', slug: 'custom-b' })).status,
    201,
  );
  assert.equal((await get('/custom-a')).status, 200);
  const customSnapshot = await (await get('/api/export')).json();
  assert.equal(JSON.parse(customSnapshot.values['pages:custom']).length, 2);
  const extraLayout = JSON.parse(customSnapshot.values['layout:custom-a']);
  extraLayout.nodes[0].linkTo = '/custom-b';
  extraLayout.nodes[0].linkLabel = 'Continue to B';
  assert.equal(
    (
      await post({
        id: 'layout:custom-a',
        value: JSON.stringify(extraLayout),
        version: 1,
      })
    ).status,
    200,
  );
  extraLayout.nodes[0].linkTo = '/not-created';
  assert.equal(
    (
      await post({
        id: 'layout:custom-a',
        value: JSON.stringify(extraLayout),
        version: 2,
      })
    ).status,
    400,
  );
  assert.equal(
    (await post({ id: 'pages:custom', value: '[]', version: 1 })).status,
    400,
  );
  const portable = await (await get('/api/export')).json();
  portable.media = snapshot.media;
  await writeFile(
    path.join(root, 'custom-pages-snapshot.json'),
    JSON.stringify(portable),
  );
  assert.equal((await get('/engineering')).status, 200);
  assert.equal((await get('/does-not-exist')).status, 404);
  await new Promise((resolve) => server.close(resolve));
  server = await createAppServer({
    dataDir,
    clientDir: path.resolve('selfhost-dist/client'),
    environment,
    keyOverride: publicKey,
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = 'http://127.0.0.1:' + server.address().port;
  const restored = await (await get('/api/export')).json();
  assert.equal(restored.values.headline, snapshot.values.headline);
  assert.equal((await get('/custom-a')).status, 200);
  assert.equal(JSON.parse(restored.values['pages:custom']).length, 2);
  assert.equal((await get(asset.url)).status, 200);
  console.log(
    'PASS: Access enforcement, JWT rejection, CSRF, two-user CAS conflict, presence, streamed upload, byte ranges, private snapshot, disk persistence and routes.',
  );
  console.log('Test snapshot: ' + path.join(root, 'test-snapshot.json'));
} finally {
  await new Promise((resolve) => server.close(resolve));
}
