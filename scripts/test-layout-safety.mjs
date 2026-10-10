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
    name: 'Layout protection',
    templateId: 'regelerate',
  });
  assert.equal(created.status, 201);
  project = (await created.json()).id;
  const initial = (await rows()).find((row) => row.id === 'layout:results');
  const nodes = Array.from({ length: 151 }, (_, i) =>
    newNode('text-' + i, 'text', 'Result ' + i),
  );
  const largeCss = Array.from(
    { length: 9000 },
    (_, i) => `.item-${i} { color: #123456; }`,
  ).join('\n');
  assert.ok(largeCss.length > 200000);
  const value = JSON.stringify({
    customCss: largeCss,
    nodes,
    order: nodes.map((node) => node.id),
    gap: 24,
    width: 'full',
    sidebar: true,
  });
  assert.equal(
    (
      await request('/api/content', {
        id: initial.id,
        value,
        version: initial.version,
      })
    ).status,
    200,
  );
  const beforeStaleSave = await rows();
  const saved = beforeStaleSave.find((row) => row.id === initial.id);
  assert.equal(
    JSON.parse(saved.value).nodes.length,
    151,
    'current browser can save above 100 sections',
  );
  assert.equal(
    JSON.parse(saved.value).customCss,
    largeCss,
    'large CSS round-trips without truncation',
  );
  for (const protocol of [null, '1']) {
    const rejected = await request(
      '/api/content',
      { id: saved.id, value: initial.value, version: saved.version },
      protocol,
    );
    assert.equal(rejected.status, 409);
    assert.match((await rejected.json()).error, /out of date/);
    assert.deepEqual(
      await rows(),
      beforeStaleSave,
      'stale reset must not change any page or shared chrome',
    );
    for (const endpoint of ['/api/ai/page', '/api/ai/apply']) {
      const rejectedAi = await request(endpoint, { page: 'results' }, protocol);
      assert.equal(rejectedAi.status, 409);
      assert.match((await rejectedAi.json()).error, /out of date/);
    }
  }
  const invalid = await request('/api/content', {
    id: saved.id,
    value: '{invalid',
    version: saved.version,
  });
  assert.equal(invalid.status, 400);
  assert.deepEqual(await rows(), beforeStaleSave);
  const nextValue = JSON.stringify({ ...JSON.parse(value), gap: 32 });
  assert.equal(
    (
      await request('/api/content', {
        id: saved.id,
        value: nextValue,
        version: saved.version,
      })
    ).status,
    200,
  );
  // A stale version remains protected even when it speaks the new protocol.
  assert.equal(
    (
      await request('/api/content', {
        id: saved.id,
        value,
        version: saved.version,
      })
    ).status,
    409,
  );
  const audit = new DatabaseSync(path.join(dataDir, 'wiki.sqlite'), {
    readOnly: true,
  });
  const history = audit
    .prepare(
      'SELECT value,version FROM layout_history WHERE project_id=? AND id=? ORDER BY sequence',
    )
    .all(project, saved.id);
  assert.equal(history.length, 2, 'rejected writes never create revisions');
  assert.equal(history.at(-1).value, saved.value);
  assert.equal(history.at(-1).version, saved.version);
  audit.close();
  await new Promise((resolve) => server.close(resolve));
  await start();
  assert.equal(
    (await rows()).find((row) => row.id === saved.id).value,
    nextValue,
  );
  // Only a missing row may use server defaults. Existing invalid values must
  // reach the client intact so it can pause editing and offer recovery.
  const fixtures = new DatabaseSync(path.join(dataDir, 'wiki.sqlite'));
  try {
    const readHome = () =>
      fixtures
        .prepare(
          'SELECT value,version,author FROM project_blocks WHERE project_id=? AND id=?',
        )
        .get(project, 'layout:home');
    const originalHome = readHome();
    for (const invalidValue of [
      '',
      '{invalid',
      JSON.stringify({ nodes: [] }),
    ]) {
      fixtures
        .prepare(
          'UPDATE project_blocks SET value=? WHERE project_id=? AND id=?',
        )
        .run(invalidValue, project, 'layout:home');
      const responseRow = (await rows()).find(
        (row) => row.id === 'layout:home',
      );
      assert.equal(responseRow.value, invalidValue);
      assert.equal(responseRow.version, originalHome.version);
      assert.equal(
        readHome().value,
        invalidValue,
        'GET must not reset rejected saved data',
      );
    }
    fixtures
      .prepare('DELETE FROM project_blocks WHERE project_id=? AND id=?')
      .run(project, 'layout:home');
    const defaultRow = (await rows()).find((row) => row.id === 'layout:home');
    assert.equal(defaultRow.version, 0);
    assert.deepEqual(JSON.parse(defaultRow.value).nodes, []);
    assert.equal(
      readHome(),
      undefined,
      'reading defaults does not mutate the database',
    );
    assert.equal(
      (
        await request('/api/content', {
          id: 'layout:home',
          value: defaultRow.value,
          version: 0,
        })
      ).status,
      200,
    );
    assert.equal(
      readHome().version,
      1,
      'first save of a server-provided default is valid',
    );
  } finally {
    fixtures.close();
  }
  console.log(
    'PASS: 151-section save, stale tab and AI rejection, invalid-layout rejection, version conflicts, previous-layout recovery, persistence after restart, server-only missing-row defaults, invalid saved values preserved.',
  );
} finally {
  await new Promise((resolve) => server.close(resolve));
}
