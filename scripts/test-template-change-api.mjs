import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { generateKeyPair, SignJWT } from 'jose';
import { createAppServer } from '../selfhost-dist/server/app.mjs';
import {
  newNode,
  pageLayers,
  materialize,
  removeNodes,
} from '../selfhost-dist/server/shared.mjs';

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
  const listed = (await (await request('/api/projects')).json()).projects.find(
    (p) => p.id === project,
  );
  assert.equal(listed.appearanceId, 'notebook-white');
  assert.equal(
    listed.templateId,
    'regelerate',
    'original template remains provenance only',
  );
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
  assert.equal(
    (await (await request('/api/projects')).json()).projects.find(
      (p) => p.id === project,
    ).appearanceId,
    'regelerate',
  );
  const sponsorRows = await rows();
  const sponsorBlocks = Object.fromEntries(
    sponsorRows.map((row) => [row.id, row]),
  );
  const homeRow = sponsorBlocks['layout:home'];
  const homeLayers = pageLayers(sponsorBlocks, 'home').layers;
  const sponsorSection = homeLayers.find((layer) => layer.sponsorGrid);
  const homeLayout = materialize(JSON.parse(homeRow.value), homeLayers);
  const withoutSponsors = removeNodes(homeLayout, [sponsorSection.id]);
  assert.equal(
    (
      await request('/api/content', {
        id: 'layout:home',
        value: JSON.stringify(withoutSponsors),
        version: homeRow.version,
      })
    ).status,
    200,
  );
  const savedRows = await rows();
  assert.equal(
    JSON.parse(
      savedRows.find((row) => row.id === 'layout:home').value,
    ).nodes.find((node) => node.id === sponsorSection.id).deleted,
    true,
  );
  assert.deepEqual(
    materialize(
      JSON.parse(savedRows.find((row) => row.id === 'layout:sponsors').value),
      pageLayers(sponsorBlocks, 'sponsors').layers,
    ).nodes.filter(
      (n) => !['import-header-0', 'import-footer-0'].includes(n.id),
    ),
    materialize(
      JSON.parse(sponsorBlocks['layout:sponsors'].value),
      pageLayers(sponsorBlocks, 'sponsors').layers,
    ).nodes.filter(
      (n) => !['import-header-0', 'import-footer-0'].includes(n.id),
    ),
    'homepage deletion cannot change sponsor content (shared header/footer still sync)',
  );
  const before = savedRows;
  const beforeList = await (await request('/api/projects')).json();
  response = await request('/api/projects', {
    action: 'rename',
    id: project,
    name: '  Our research  ',
  });
  assert.equal(response.status, 200);
  const renamed = await response.json();
  assert.equal(
    renamed.projects.find((p) => p.id === project).name,
    'Our research',
  );
  assert.equal(renamed.defaultId, beforeList.defaultId);
  assert.deepEqual(
    await rows(),
    before,
    'rename preserves every saved row and version',
  );
  assert.equal(
    (
      await request('/api/projects', {
        action: 'rename',
        id: project,
        name: 'Our research',
      })
    ).status,
    200,
    'unchanged name is valid',
  );
  for (const name of ['', '  ', null, 42, 'x'.repeat(81)])
    assert.equal(
      (await request('/api/projects', { action: 'rename', id: project, name }))
        .status,
      400,
    );
  assert.equal(
    (
      await request('/api/projects', {
        action: 'rename',
        id: 'missing',
        name: 'Name',
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await fetch(origin + '/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'rename',
          id: project,
          name: 'Unauthorized',
        }),
      })
    ).status,
    401,
  );
  const second = await (
    await request('/api/projects', {
      action: 'create',
      name: 'Other project',
      templateId: 'blank',
    })
  ).json();
  assert.equal(
    (
      await request('/api/projects', {
        action: 'rename',
        id: second.id,
        name: 'ＯＵＲ   research',
      })
    ).status,
    409,
  );
  assert.equal(
    (await request('/api/projects', { action: 'delete', id: second.id }))
      .status,
    200,
  );
  assert.equal(
    (
      await request('/api/projects', {
        action: 'rename',
        id: second.id,
        name: 'Deleted project',
      })
    ).status,
    404,
  );
  await new Promise((resolve) => server.close(resolve));
  await start();
  assert.equal(
    (await (await request('/api/projects')).json()).projects.find(
      (p) => p.id === project,
    ).name,
    'Our research',
  );
  assert.deepEqual(await rows(), before);
  console.log(
    'PASS: rename persistence, content preservation, duplicate/invalid/deleted names and authentication.',
  );
} finally {
  await new Promise((resolve) => server.close(resolve));
}
