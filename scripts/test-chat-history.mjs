import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import { generateKeyPair, SignJWT } from 'jose';
import { createAppServer } from '../selfhost-dist/server/app.mjs';
const keys = await generateKeyPair('RS256');
const environment = {
  CF_ACCESS_TEAM_DOMAIN: 'https://example.cloudflareaccess.com',
  CF_ACCESS_AUD: 'history-test',
  CF_ACCESS_ORIGIN: 'https://editor.example.com',
};
const dataDir = await mkdtemp(path.resolve('work/chat-history-test-'));
async function token(id) {
  return new SignJWT({ email: id + '@example.com' })
    .setProtectedHeader({ alg: 'RS256' })
    .setSubject(id)
    .setIssuer(environment.CF_ACCESS_TEAM_DOMAIN)
    .setAudience(environment.CF_ACCESS_AUD)
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(keys.privateKey);
}
const a = await token('alice'),
  b = await token('bob');
let server, base, project;
async function start() {
  server = await createAppServer({
    dataDir,
    clientDir: path.resolve('selfhost-dist/client'),
    environment,
    keyOverride: keys.publicKey,
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = 'http://127.0.0.1:' + server.address().port;
}
const request = (who, route, body, extra = {}) =>
  fetch(base + route, {
    method: body ? 'POST' : 'GET',
    headers: {
      'cf-access-jwt-assertion': who,
      origin: environment.CF_ACCESS_ORIGIN,
      'Content-Type': 'application/json',
      ...(project ? { 'X-Prion-Project': project } : {}),
      ...extra,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
await start();
try {
  project = (
    await (
      await request(a, '/api/projects', {
        action: 'create',
        name: 'History test',
        templateId: 'blank',
      })
    ).json()
  ).id;
  assert.ok(project);
  const chat = {
    id: 'conversation-a',
    page: 'home',
    target: 'Entire page',
    revision: 1,
    messages: [{ role: 'user', text: 'Alice private protein design' }],
  };
  assert.equal((await request(a, '/api/ai/chats', chat)).status, 200);
  assert.equal((await fetch(base + '/api/ai/chats')).status, 401);
  assert.equal(
    (await request(b, '/api/ai/chats?id=conversation-a')).status,
    404,
  );
  assert.deepEqual(
    (await (await request(b, '/api/ai/chats?q=Alice&owner=alice')).json())
      .chats,
    [],
  );
  assert.equal(
    (await request(b, '/api/ai/chats', { ...chat, owner: 'alice' })).status,
    400,
  );
  assert.equal(
    (await request(a, '/api/ai/chats', chat, { origin: 'https://bad.example' }))
      .status,
    403,
  );
  assert.equal(
    (
      await request(b, '/api/ai/chats', {
        ...chat,
        messages: [{ role: 'user', text: 'Bob private' }],
      })
    ).status,
    200,
  );
  assert.equal(
    (await (await request(a, '/api/ai/chats?id=conversation-a')).json())
      .messages[0].text,
    'Alice private protein design',
  );
  await request(a, '/api/ai/chats', {
    ...chat,
    revision: 2,
    messages: [...chat.messages, { role: 'assistant', text: 'Answer latest' }],
  });
  await request(a, '/api/ai/chats', chat);
  assert.equal(
    (await (await request(a, '/api/ai/chats?id=conversation-a')).json())
      .messages.length,
    2,
    'Older saves must not overwrite a reply',
  );
  const search = await request(a, '/api/ai/chats?q=PROTEIN');
  assert.equal(search.headers.get('cache-control'), 'private, no-store');
  assert.equal((await search.json()).chats.length, 1);
  const exported = await (await request(a, '/api/export')).text();
  assert.ok(
    !exported.includes('Alice private') && !exported.includes('Bob private'),
  );
  await new Promise((r) => server.close(r));
  await start();
  assert.equal(
    (await (await request(a, '/api/ai/chats')).json()).chats.length,
    1,
  );
  assert.equal((await request(b, '/api/ai/chats?id=missing')).status, 404);
  assert.equal(
    (
      await request(a, '/api/ai/chats', {
        action: 'delete',
        id: chat.id,
        owner: 'bob',
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request(
        a,
        '/api/ai/chats',
        { action: 'clear' },
        { origin: 'https://bad.example' },
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await fetch(base + '/api/ai/chats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'clear' }),
      })
    ).status,
    401,
  );
  assert.equal(
    (await request(b, '/api/ai/chats', { action: 'delete', id: 'missing' }))
      .status,
    404,
  );
  assert.deepEqual(
    await (
      await request(a, '/api/ai/chats', { action: 'delete', id: chat.id })
    ).json(),
    { deletedIds: [chat.id] },
  );
  assert.equal((await request(a, '/api/ai/chats?id=' + chat.id)).status, 404);
  assert.equal(
    (await request(b, '/api/ai/chats?id=' + chat.id)).status,
    200,
    'Same identifier belonging to another user is preserved',
  );
  assert.deepEqual(
    await (await request(a, '/api/ai/chats', { ...chat, revision: 99 })).json(),
    { saved: false, deleted: true },
  );
  await request(a, '/api/ai/chats', { ...chat, id: 'another-chat' });
  const secondProject = (
    await (
      await request(a, '/api/projects', {
        action: 'create',
        name: 'Second history project',
        templateId: 'blank',
      })
    ).json()
  ).id;
  await request(
    a,
    '/api/ai/chats',
    { ...chat, id: 'other-project-chat' },
    { 'X-Prion-Project': secondProject },
  );
  const cleared = await request(
    a,
    '/api/ai/chats',
    { action: 'clear', pendingIds: ['pending-chat'] },
    { 'X-Prion-Project': 'missing-project' },
  );
  assert.equal(
    cleared.status,
    200,
    'Clearing own history is independent of the active project',
  );
  assert.deepEqual((await cleared.json()).deletedIds.sort(), [
    'another-chat',
    'other-project-chat',
    'pending-chat',
  ]);
  assert.deepEqual(
    (await (await request(a, '/api/ai/chats')).json()).chats,
    [],
  );
  assert.equal(
    (await (await request(b, '/api/ai/chats')).json()).chats.length,
    1,
  );
  await new Promise((r) => server.close(r));
  await start();
  for (const id of [chat.id, 'another-chat', 'pending-chat']) {
    assert.deepEqual(
      await (
        await request(a, '/api/ai/chats', { ...chat, id, revision: 999 })
      ).json(),
      { saved: false, deleted: true },
      'Deleted chats stay deleted after restart and stale saves',
    );
  }
  assert.equal(
    (await request(a, '/api/ai/chats', { ...chat, id: 'fresh-after-clear' }))
      .status,
    200,
  );
  assert.equal(
    (await (await request(a, '/api/ai/chats')).json()).chats.length,
    1,
  );
  console.log(
    'PASS: private search/read/write/delete, cross-project clear, cross-user isolation, CSRF, revision ordering, restart persistence, stale-save protection, new chats after clearing, and exclusion from public export.',
  );
} finally {
  await new Promise((r) => server.close(r));
}
