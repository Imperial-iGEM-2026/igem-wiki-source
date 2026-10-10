import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { generateKeyPair, SignJWT } from 'jose';
import { createAppServer } from '../selfhost-dist/server/app.mjs';
import { newNode } from '../selfhost-dist/server/shared.mjs';

const keys = await generateKeyPair('RS256');
const environment = {
  CF_ACCESS_TEAM_DOMAIN: 'https://example.cloudflareaccess.com',
  CF_ACCESS_AUD: 'layout-safety',
  CF_ACCESS_ORIGIN: 'https://editor.example.com',
  CODEX_SOCKET: 'mock',
};
const jwt = await new SignJWT({ email: 'editor@example.com' })
  .setProtectedHeader({ alg: 'RS256' })
  .setSubject('editor')
  .setIssuer(environment.CF_ACCESS_TEAM_DOMAIN)
  .setAudience(environment.CF_ACCESS_AUD)
  .setIssuedAt()
  .setExpirationTime('10m')
  .sign(keys.privateKey);
const dataDir = await mkdtemp(path.resolve('work/layout-safety-'));
let server, origin, project;
async function start() {
  server = await createAppServer({
    environment,
    dataDir,
    clientDir: path.resolve('selfhost-dist/client'),
    keyOverride: keys.publicKey,
    codexRunner: async () => ({ kind: 'chat', reply: 'Ready', enabled: true }),
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = 'http://127.0.0.1:' + server.address().port;
}
const request = (url, body, protocol = '2') =>
  fetch(origin + url, {
    method: body ? 'POST' : 'GET',
    headers: {
      origin: environment.CF_ACCESS_ORIGIN,
      'cf-access-jwt-assertion': jwt,
      'Content-Type': 'application/json',
      ...(project ? { 'X-Prion-Project': project } : {}),
      ...(protocol === null ? {} : { 'X-Prion-Layout-Protocol': protocol }),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
const rows = async () => (await (await request('/api/content')).json()).rows;
await start();
try {
  const created = await request('/api/projects', {
    action: 'create',
    name: 'Template API test',
    templateId: 'regelerate',
  });
  project = (await created.json()).id;
  const endpoint = '/api/template-change';
  assert.equal(
    (
      await fetch(origin + endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'status', id: project }),
      })
    ).status,
    401,
  );
  let response = await request(endpoint, {
    action: 'preview',
    id: project,
    templateId: 'notebook-white',
  });
  assert.equal(response.status, 200);
  const preview = await response.json();
  assert.equal(preview.data['site:template'].value, 'regelerate');
  assert.equal(preview.data['site:appearance'].value, 'notebook-white');
  response = await request(endpoint, {
    action: 'apply',
    id: project,
    token: preview.token,
  });
  assert.equal(response.status, 200);
  const applied = await response.json();
  assert.equal(
    (await rows()).find((row) => row.id === 'site:appearance').value,
    'notebook-white',
  );
  const forbidden = await request('/api/content', {
    id: 'site:appearance',
    value: 'swiss',
    version: applied.version,
  });
  assert.equal(
    forbidden.status,
    400,
    'ordinary content writes cannot bypass preview',
  );
  response = await request(endpoint, {
    action: 'rollback',
    id: project,
    changeId: applied.rollback.id,
    version: applied.version,
  });
  assert.equal(response.status, 200);
  assert.equal(
    (await rows()).find((row) => row.id === 'site:appearance').value,
    'regelerate',
  );
  console.log(
    'PASS: authenticated preview/apply/rollback API, preview bypass rejected, appearance propagates through content polling.',
  );
} finally {
  await new Promise((resolve) => server.close(resolve));
}
