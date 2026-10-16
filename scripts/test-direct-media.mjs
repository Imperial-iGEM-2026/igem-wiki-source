import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { generateKeyPair, SignJWT } from 'jose';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { request as httpRequest } from 'node:http';
import { createAppServer } from '../selfhost-dist/server/app.mjs';
import { createTicketSigner } from '../selfhost-dist/server/media-gateway.mjs';

const secret = randomBytes(32),
  signer = createTicketSigner(secret, 'https://media.example.com', () => 1000);
const ticket = signer.issue({ action: 'read', key: 'test' }, 10);
assert.equal(signer.verify(ticket, 'read', 'test').exp, 1010);
for (const check of [
  () => signer.verify(ticket, 'upload', 'test'),
  () => signer.verify(ticket, 'read', 'other'),
  () =>
    createTicketSigner(secret, 'https://other.example.com', () => 1000).verify(
      ticket,
      'read',
      'test',
    ),
  () =>
    createTicketSigner(secret, 'https://media.example.com', () => 1010).verify(
      ticket,
      'read',
      'test',
    ),
  () => signer.verify(ticket.slice(0, -5) + 'abcde', 'read', 'test'),
])
  assert.throws(check);

await mkdir('work', { recursive: true });
const dataDir = await mkdtemp(path.resolve('work/direct-media-'));
const environment = {
  CF_ACCESS_TEAM_DOMAIN: 'https://example.cloudflareaccess.com',
  CF_ACCESS_AUD: 'test-aud',
  CF_ACCESS_ORIGIN: 'https://editor.example.com',
  MEDIA_ORIGIN: 'https://media.example.com',
};
const keys = await generateKeyPair('RS256');
const jwt = await new SignJWT({ email: 'editor@example.com' })
  .setProtectedHeader({ alg: 'RS256' })
  .setIssuer(environment.CF_ACCESS_TEAM_DOMAIN)
  .setSubject('editor')
  .setAudience('test-aud')
  .setIssuedAt()
  .setExpirationTime('1h')
  .sign(keys.privateKey);
let server;
const start = async () => {
  server = await createAppServer({
    environment,
    dataDir,
    clientDir: path.resolve('selfhost-dist/client'),
    keyOverride: keys.publicKey,
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
};
await start();
const request = (host, url, options = {}) =>
  new Promise((resolve, reject) => {
    const body = options.body === undefined ? null : Buffer.from(options.body);
    const req = httpRequest(
      {
        hostname: '127.0.0.1',
        port: server.address().port,
        path: url,
        method: options.method || 'GET',
        agent: false,
        headers: {
          host,
          ...(body ? { 'Content-Length': body.length } : {}),
          ...options.headers,
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () =>
          resolve(
            new Response(
              [204, 304].includes(res.statusCode)
                ? null
                : Buffer.concat(chunks),
              { status: res.statusCode, headers: res.headers },
            ),
          ),
        );
      },
    );
    req.on('error', reject);
    req.end(body);
  });
const main = (url, options = {}) =>
  request('editor.example.com', url, {
    ...options,
    headers: {
      'cf-access-jwt-assertion': jwt,
      origin: environment.CF_ACCESS_ORIGIN,
      ...options.headers,
    },
  });
const media = (url, options = {}) =>
  request('media.example.com', url, {
    ...options,
    headers: { origin: environment.CF_ACCESS_ORIGIN, ...options.headers },
  });
const relative = (url) => new URL(url).pathname + new URL(url).search;
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j7gAAAABJRU5ErkJggg==',
  'base64',
);
const issue = async (name = 'test.png', size = png.length) =>
  main('/api/media-ticket', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, size }),
  });
try {
  // An AI link can authorize binary uploads without an Access login cookie.
  const mcpProject = await (await main('/api/projects', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({action:'create',name:'Media MCP',templateId:'regelerate'})})).json();
  const mcpLink = await (await main('/api/mcp-links', {method:'POST', headers:{'Content-Type':'application/json','X-Prion-Project':mcpProject.id}, body:JSON.stringify({name:'Media assistant',days:1,page:'home'})})).json();
  const mediaTool = async (name, args) => {
    const response = await request('media.example.com', relative(mcpLink.url), {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}})});
    assert.equal(response.status,200);
    const result = (await response.json()).result;
    assert.equal(result.isError,undefined,result.content?.[0]?.text);
    return JSON.parse(result.content[0].text);
  };
  const direct = await mediaTool('get_media_upload_url', {page:'home',name:'mcp.png',size:png.length});
  assert.equal(direct.headers.Origin, environment.CF_ACCESS_ORIGIN);
  const directResponse = await request('media.example.com', relative(direct.url), {method:direct.method,headers:direct.headers,body:png});
  assert.equal(directResponse.status,200);
  const directItem = await directResponse.json();
  assert.deepEqual(await readFile(path.join(dataDir,'media',directItem.url.split('/').pop())),png);
  // Chunk uploads are also readable via the production signed media gateway.
  const chunked = await mediaTool('upload_media',{page:'home',name:'mcp-chunk.png',base64:png.toString('base64')});
  const readChunked = await main(chunked.url);
  assert.equal(readChunked.status,302);
  assert.equal((await media(relative(readChunked.headers.get('location')))).status,200);
  const resumed = await mediaTool('start_media_upload',{page:'home',name:'resume.png',size:png.length});
  await mediaTool('upload_media_chunk',{page:'home',uploadId:resumed.uploadId,offset:0,base64:png.subarray(0,32).toString('base64')});
  await new Promise(r=>server.close(r)); await start();
  assert.equal((await mediaTool('get_media_upload',{page:'home',uploadId:resumed.uploadId})).nextOffset,32);
  const resumedResult = await mediaTool('upload_media_chunk',{page:'home',uploadId:resumed.uploadId,offset:32,base64:png.subarray(32).toString('base64')});
  assert.equal(resumedResult.complete,true);
  assert.deepEqual(await readFile(path.join(dataDir,'media',resumedResult.url.split('/').pop())),png);
  assert.equal(
    (
      await request('editor.example.com', '/api/media-ticket', {
        method: 'POST',
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await request('unknown.example.com', '/api/session', {
        headers: { 'cf-access-jwt-assertion': jwt },
      })
    ).status,
    421,
  );
  assert.equal((await media('/api/content')).status, 404);
  assert.equal((await issue('test.png', 30 * 1024 * 1024)).status, 413);
  const permit = await (await issue()).json();
  const upload = relative(permit.url);
  assert.equal(
    (
      await media(upload, {
        method: 'OPTIONS',
        headers: {
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'content-type',
        },
      })
    ).status,
    204,
  );
  assert.equal(
    (
      await media(upload, {
        method: 'POST',
        headers: { origin: 'https://evil.example.com' },
        body: png,
      })
    ).status,
    403,
  );
  assert.equal(
    (await media(upload, { method: 'POST', body: Buffer.alloc(20) })).status,
    400,
  );
  const uploaded = await media(upload, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: png,
  });
  assert.equal(uploaded.status, 200);
  const item = await uploaded.json();
  assert.equal(
    uploaded.headers.get('access-control-allow-origin'),
    environment.CF_ACCESS_ORIGIN,
  );
  assert.equal(
    (await media(upload, { method: 'POST', body: png })).status,
    409,
  );
  assert.equal(
    (await main('/api/media?name=bad.png', { method: 'POST', body: png }))
      .status,
    409,
  );
  const redirect = await main(item.url);
  assert.equal(redirect.status, 302);
  assert.equal((await redirect.arrayBuffer()).byteLength, 0);
  const readURL = relative(redirect.headers.get('location'));
  const download = await media(readURL, { headers: { Range: 'bytes=0-7' } });
  assert.equal(download.status, 206);
  assert.deepEqual(
    Buffer.from(await download.arrayBuffer()),
    png.subarray(0, 8),
  );
  assert.equal(
    download.headers.get('access-control-allow-origin'),
    environment.CF_ACCESS_ORIGIN,
  );
  const cacheHeader = download.headers.get('cache-control');
  assert.match(cacheHeader, /^private, max-age=\d+, must-revalidate$/);
  const maxAge = Number(/max-age=(\d+)/.exec(cacheHeader)[1]);
  assert.ok(maxAge > 0 && maxAge <= 600);
  assert.equal(
    (await main(item.url)).headers.get('location'),
    redirect.headers.get('location'),
    'Repeated authorized reads reuse the signed URL',
  );
  assert.equal(
    redirect.headers.get('cache-control'),
    'private, no-store',
    'Authorization redirects must always reach Access',
  );
  const etag = download.headers.get('etag');
  assert.ok(etag);
  assert.equal(
    (await media(readURL, { headers: { 'If-None-Match': etag } })).status,
    304,
  );
  const deniedCached = await media(readURL.split('?')[0], {
    headers: { 'If-None-Match': etag },
  });
  assert.equal(
    deniedCached.status,
    403,
    'Conditional requests cannot bypass ticket authentication',
  );
  assert.equal(deniedCached.headers.get('cache-control'), 'private, no-store');
  assert.equal((await media(readURL.split('?')[0])).status, 403);
  assert.equal(
    (await media(readURL, { headers: { origin: 'https://evil.example.com' } }))
      .status,
    403,
  );
  assert.equal(
    (await media(readURL, { method: 'POST', body: png })).status,
    405,
  );
  assert.equal((await media(readURL, { method: 'HEAD' })).status, 200);
  assert.equal(
    (await media(readURL, { headers: { range: 'bytes=999999-' } })).status,
    416,
  );
  const badPermit = await (await issue('bad.pdf')).json();
  assert.equal(
    (await media(relative(badPermit.url), { method: 'POST', body: png }))
      .status,
    400,
  );
  const large = Buffer.concat([png, Buffer.alloc(2 * 1024 * 1024, 35)]);
  const largePermit = await (await issue('large.png', large.length)).json();
  const largeUpload = await media(relative(largePermit.url), {
    method: 'POST',
    body: large,
  });
  assert.equal(largeUpload.status, 200);
  const largeItem = await largeUpload.json(),
    largeRedirect = await main(largeItem.url);
  const largeDownload = await media(
    relative(largeRedirect.headers.get('location')),
  );
  assert.deepEqual(Buffer.from(await largeDownload.arrayBuffer()), large);
  const video = Buffer.alloc(32 * 1024 * 1024);
  video.set([0x1a, 0x45, 0xdf, 0xa3]);
  const videoPermit = await (await issue('large.webm', video.length)).json();
  assert.equal(videoPermit.timeoutMs, 1800000);
  const videoResponse = await media(relative(videoPermit.url), {
    method: 'POST',
    body: video,
  });
  assert.equal(videoResponse.status, 200);
  const videoItem = await videoResponse.json();
  assert.equal(videoItem.size, video.length);
  const videoRedirect = await main(videoItem.url);
  const tail = await media(relative(videoRedirect.headers.get('location')), {
    headers: { Range: `bytes=${video.length - 16}-` },
  });
  assert.equal(tail.status, 206);
  assert.equal((await tail.arrayBuffer()).byteLength, 16);
  assert.equal(
    (await issue('impossible.glb', Number.MAX_SAFE_INTEGER)).status,
    507,
  );
  const model = Buffer.alloc(32 * 1024 * 1024);
  const modelJson = JSON.stringify({
    asset: { version: '2.0' },
    buffers: [{ byteLength: model.length - 100 }],
  });
  const jsonChunkLength = Math.ceil(modelJson.length / 4) * 4;
  model.write('glTF');
  model.writeUInt32LE(2, 4);
  model.writeUInt32LE(model.length, 8);
  model.writeUInt32LE(jsonChunkLength, 12);
  model.write('JSON', 16);
  model.fill(32, 20, 20 + jsonChunkLength);
  model.write(modelJson, 20);
  model.writeUInt32LE(
    model.length - 28 - jsonChunkLength,
    20 + jsonChunkLength,
  );
  model.write('BIN\0', 24 + jsonChunkLength);
  const modelPermit = await (await issue('large.glb', model.length)).json();
  const modelResponse = await media(relative(modelPermit.url), {
    method: 'POST',
    body: model,
  });
  assert.equal(modelResponse.status, 200);
  const modelItem = await modelResponse.json();
  assert.equal(modelItem.size, model.length);
  const snapshot = await (await main('/api/export')).json();
  assert.ok(!JSON.stringify(snapshot).includes('?ticket='));
  const fixtureSnapshot = {
    ...snapshot,
    values: {
      ...snapshot.values,
      'layout:home': JSON.stringify({
        order: ['large-video', 'large-model'],
        nodes: [
          {
            id: 'large-video',
            kind: 'video',
            title: 'Large video',
            body: '',
            src: videoItem.url,
            caption: '',
            alt: '',
            span: 12,
            align: 'left',
            background: '',
            padding: 0,
            hidden: false,
          },
        ],
        gap: 0,
        width: 'full',
        sidebar: true,
      }),
    },
  };
  const fixtureLayout = JSON.parse(fixtureSnapshot.values['layout:home']);
  fixtureLayout.nodes.push({
    ...fixtureLayout.nodes[0],
    id: 'large-model',
    kind: 'model',
    title: 'Large model',
    src: modelItem.url,
  });
  fixtureSnapshot.values['layout:home'] = JSON.stringify(fixtureLayout);
  await writeFile(
    path.join(dataDir, 'snapshot.json'),
    JSON.stringify(fixtureSnapshot),
  );
  await writeFile(
    'work/large-media-fixture.json',
    JSON.stringify({
      snapshot: path.join(dataDir, 'snapshot.json'),
      mediaDir: path.join(dataDir, 'media'),
      key: videoItem.url.split('/').pop(),
      size: video.length,
      modelKey: modelItem.url.split('/').pop(),
    }),
  );

  const key = await readFile(path.join(dataDir, 'media-signing.key'));
  assert.equal(key.length, 32);
  await new Promise((r) => server.close(r));
  await start();
  assert.equal((await media(readURL)).status, 200);
  assert.equal(
    (await media(upload, { method: 'POST', body: png })).status,
    409,
  );
  console.log(
    'PASS: signed media scope/signature/expiry/audience, Access-only ticket issuing, strict hosts/CORS, single-use uploads persisted across restart, file-type validation, proxy redirects without media bodies, protected downloads and ranges, 32 MiB video/GLB uploads, disk reservation checks, MCP binary upload authorization and chunk resume after restart.',
  );
} finally {
  await new Promise((r) => server.close(r));
}
