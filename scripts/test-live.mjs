import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import { generateKeyPair, SignJWT } from 'jose';
import { createAppServer } from '../selfhost-dist/server/app.mjs';
const keys = await generateKeyPair('RS256');
const environment = {
  CF_ACCESS_TEAM_DOMAIN: 'https://example.cloudflareaccess.com',
  CF_ACCESS_AUD: 'live-test',
  CF_ACCESS_ORIGIN: 'https://editor.example.com',
  CODEX_SOCKET: 'mock',
};
const token = (email) =>
  new SignJWT({ email })
    .setProtectedHeader({ alg: 'RS256' })
    .setSubject(email)
    .setIssuer(environment.CF_ACCESS_TEAM_DOMAIN)
    .setAudience(environment.CF_ACCESS_AUD)
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(keys.privateKey);
const ada = await token('ada@example.com'),
  bo = await token('bo@example.com');
const server = await createAppServer({
  environment,
  dataDir: await mkdtemp(path.resolve('work/live-test-')),
  clientDir: path.resolve('selfhost-dist/client'),
  keyOverride: keys.publicKey,
  codexRunner: async () => ({ enabled: false }),
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = 'http://127.0.0.1:' + server.address().port;
const request = (jwt, url, body, extra = {}) =>
  fetch(origin + url, {
    method: body ? 'POST' : 'GET',
    headers: {
      origin: environment.CF_ACCESS_ORIGIN,
      'cf-access-jwt-assertion': jwt,
      'Content-Type': 'application/json',
      ...extra,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
/** Minimal SSE reader: resolves the next event matching a predicate. */
async function stream(jwt, clientId, page) {
  const response = await request(
    jwt,
    `/api/live?clientId=${clientId}&page=${page}`,
  );
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /text\/event-stream/);
  const reader = response.body.getReader(),
    decoder = new TextDecoder();
  let buffer = '';
  const queue = [];
  const waiting = [];
  (async () => {
    for (;;) {
      const { value, done } = await reader.read().catch(() => ({ done: true }));
      if (done) return;
      buffer += decoder.decode(value, { stream: true });
      let end;
      while ((end = buffer.indexOf('\n\n')) >= 0) {
        const chunk = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        const event = /^event: (.+)$/m.exec(chunk)?.[1];
        const data = /^data: (.+)$/m.exec(chunk)?.[1];
        if (!event) continue;
        queue.push({ event, data: JSON.parse(data) });
        waiting.splice(0).forEach((resolve) => resolve());
      }
    }
  })();
  return {
    reader,
    async next(test, label) {
      const deadline = Date.now() + 3000;
      for (;;) {
        const index = queue.findIndex(test);
        if (index >= 0) return queue.splice(index, 1)[0];
        if (Date.now() > deadline) throw Error('Timed out waiting for ' + label);
        await new Promise((resolve) => {
          waiting.push(resolve);
          setTimeout(resolve, 100);
        });
      }
    },
  };
}
try {
  assert.equal((await fetch(origin + '/api/live?clientId=aaaaaaaa1')).status, 401);
  const created = await request(ada, '/api/projects', {
    action: 'create',
    name: 'Live',
    templateId: 'regelerate',
  });
  assert.equal(created.status, 201);
  assert.equal((await request(ada, '/api/live?clientId=bad')).status, 400);
  const a = await stream(ada, 'client-ada-1', 'home');
  await a.next((e) => e.event === 'hello', 'hello');
  const b = await stream(bo, 'client-bo-1', 'home');
  const seen = await a.next(
    (e) =>
      e.event === 'presence' &&
      e.data.peers.some((p) => p.id === 'client-bo-1' && p.page === 'home'),
    'Bo joining',
  );
  const boPeer = seen.data.peers.find((p) => p.id === 'client-bo-1');
  assert.match(boPeer.color, /^#[0-9a-f]{6}$/);
  // Selections are broadcast to everyone on the project.
  const selection = {
    layerId: 'intro',
    selector: '[data-layer-id="intro"] h2',
    label: 'Intro heading',
  };
  assert.equal(
    (
      await request(bo, '/api/live', {
        clientId: 'client-bo-1',
        page: 'home',
        selection,
      })
    ).status,
    200,
  );
  await a.next(
    (e) =>
      e.event === 'presence' &&
      e.data.peers.some(
        (p) =>
          p.id === 'client-bo-1' &&
          p.selection?.selector === selection.selector &&
          p.selection.label === 'Intro heading',
      ),
    'Bo selection',
  );
  // Another user cannot move someone else's selection, and bad selectors are refused.
  assert.equal(
    (
      await request(ada, '/api/live', {
        clientId: 'client-bo-1',
        page: 'home',
        selection: null,
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await request(bo, '/api/live', {
        clientId: 'client-bo-1',
        page: 'home',
        selection: { layerId: 'x y', selector: 'div' },
      })
    ).status,
    404,
  );
  // Saves announce a revision to every editor, tagged with the saving tab.
  const rows = (await (await request(ada, '/api/content')).json()).rows;
  const layout = rows.find((row) => row.id.startsWith('layout:'));
  assert.ok(layout, 'a layout row exists');
  const saved = await request(
    ada,
    '/api/content',
    { id: layout.id, value: layout.value, version: layout.version },
    { 'X-Prion-Client': 'client-ada-1' },
  );
  assert.equal(saved.status, 200);
  const revision = await b.next((e) => e.event === 'revision', 'revision');
  assert.deepEqual(revision.data, { ids: [layout.id], by: 'client-ada-1' });
  // Leaving removes the editor from everyone's presence.
  await b.reader.cancel();
  await a.next(
    (e) =>
      e.event === 'presence' &&
      !e.data.peers.some((p) => p.id === 'client-bo-1'),
    'Bo leaving',
  );
} finally {
  await new Promise((resolve) => server.close(resolve));
}
console.log(
  'PASS: live channel auth, presence, selection broadcast and ownership, revision push, disconnect cleanup and shutdown.',
);
