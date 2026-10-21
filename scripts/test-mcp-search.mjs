import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import { generateKeyPair, SignJWT } from 'jose';
import { createAppServer } from '../selfhost-dist/server/app.mjs';
const keys = await generateKeyPair('RS256');
const environment = {
  CF_ACCESS_TEAM_DOMAIN: 'https://example.cloudflareaccess.com',
  CF_ACCESS_AUD: 'mcp-test',
  CF_ACCESS_ORIGIN: 'https://editor.example.com',
  CODEX_SOCKET: 'mock',
};
const jwt = await new SignJWT({ email: 'ada@example.com' })
  .setProtectedHeader({ alg: 'RS256' })
  .setSubject('ada')
  .setIssuer(environment.CF_ACCESS_TEAM_DOMAIN)
  .setAudience(environment.CF_ACCESS_AUD)
  .setIssuedAt()
  .setExpirationTime('10m')
  .sign(keys.privateKey);
const dataDir = await mkdtemp(path.resolve('work/mcp-test-'));
const server = await createAppServer({
  environment,
  dataDir,
  clientDir: path.resolve('selfhost-dist/client'),
  keyOverride: keys.publicKey,
  codexRunner: async () => ({ enabled: false }),
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = 'http://127.0.0.1:' + server.address().port;
const api = (url, body, project, as = jwt) =>
  fetch(origin + url, {
    method: body ? 'POST' : 'GET',
    headers: {
      origin: environment.CF_ACCESS_ORIGIN,
      'X-Prion-Layout-Protocol': '2',
      'cf-access-jwt-assertion': as,
      'Content-Type': 'application/json',
      ...(project ? { 'X-Prion-Project': project } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
let rpcId = 0;
async function rpc(key, method, params, raw = false) {
  const response = await fetch(origin + '/mcp?key=' + key, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, params }),
  });
  if (raw) return response;
  assert.equal(response.status, 200, method);
  return (await response.json()).result;
}
async function call(key, name, args) {
  const result = await rpc(key, 'tools/call', { name, arguments: args });
  if (result.isError)
    throw Object.assign(Error(result.content[0].text), { tool: true });
  return JSON.parse(result.content[0].text);
}
const rejects = async (promise, pattern) => {
  const error = await promise.then(
    () => null,
    (e) => e,
  );
  assert.ok(error?.tool, 'expected a tool error');
  assert.match(error.message, pattern);
};
try {
  const project = (await (await api('/api/projects', { action: 'create', name: 'MCP search', templateId: 'regelerate' })).json()).id;
  const created = await (await api('/api/mcp-links', { name: 'Search bot', days: 1 }, project)).json();
  const key = new URL(created.url).searchParams.get('key');
  const scoped = await (await api('/api/mcp-links', { name: 'Page search', days: 1, page: 'home' }, project)).json();
  const scopedKey = new URL(scoped.url).searchParams.get('key');
  const { tools } = await rpc(key, 'tools/list', {});
  const other = 'results';
  assert.equal(tools.find((t) => t.name === 'search_project').annotations.readOnlyHint, true);
  const searchable = await call(key, 'add_section', {
    page: 'home', kind: 'html', heading: 'Searchable workshop',
    html: '<p>mcpquartz Workshop content</p><script>mcpscriptsecret</script><style>.mcpcsssecret{color:red}</style>',
  });
  const elsewhere = await call(key, 'add_section', {
    page: other, kind: 'text', heading: 'Research findings', body: 'mcpaxolotl scientific observations',
  });
  const hiddenSearch = await call(key, 'add_section', {
    page: 'home', kind: 'text', heading: 'Internal draft', body: 'mcphiddensecret',
  });
  await call(key, 'update_section', { page: 'home', id: hiddenSearch.id, changes: { hidden: true } });
  const beforeSearch = (await call(key, 'get_page', { page: 'home' })).version;
  const matches = await call(scopedKey, 'search_project', { query: 'mcpquartz', limit: 1 });
  assert.equal(matches.scope, 'home');
  assert.equal(matches.count, 1);
  assert.equal(matches.results[0].page, 'home');
  assert.equal(matches.results[0].sectionId, searchable.id);
  assert.equal(matches.results[0].url, '/#section-' + searchable.id);
  assert.match(matches.results[0].excerpt, /Workshop content/);
  assert.equal((await call(key, 'get_page', { page: 'home' })).version, beforeSearch);
  for (const query of ['mcpscriptsecret', 'mcpcsssecret', 'mcphiddensecret', 'mcpaxolotl', 'mcpaxoltl'])
    assert.equal((await call(scopedKey, 'search_project', { query })).count, 0, query);
  const correctedSearch = await call(key, 'search_project', { query: 'mcpaxoltl' });
  assert.equal(correctedSearch.results[0].page, other);
  assert.equal(correctedSearch.results[0].correction, 'mcpaxolotl');
  await rejects(call(scopedKey, 'search_project', { query: 'mcpaxolotl', page: other }), /only edit/);
  assert.equal((await call(key, 'search_project', { query: 'mcpaxolotl', page: 'home' })).count, 0);
  await call(key, 'update_section', { page: 'home', id: searchable.id, changes: { html: '<p>mcpfreshsavedcontent</p>' } });
  assert.equal((await call(key, 'search_project', { query: 'mcpquartz' })).count, 0);
  assert.equal((await call(key, 'search_project', { query: 'mcpfreshsavedcontent' })).count, 1);
  for (const args of [{ query: '' }, { query: ' '.repeat(10) }, { query: 'x'.repeat(201) }, { query: 3 }, { query: 'workshop', limit: 0 }, { query: 'workshop', limit: 51 }, { query: 'workshop', limit: 1.5 }])
    await rejects(call(key, 'search_project', args), /query|limit/);
  await call(key, 'create_page', { slug: 'search-backup-1', title: 'Search backup' });
  await call(key, 'add_section', { page: 'search-backup-1', kind: 'text', heading: 'Backup', body: 'mcpbackupsecret' });
  assert.equal((await call(key, 'search_project', { query: 'mcpbackupsecret' })).count, 0);
  await call(key, 'delete_page', { slug: 'search-backup-1' });
  const isolatedSearchProject = (await (await api('/api/projects', { action: 'create', name: 'Search isolation', templateId: 'blank' })).json()).id;
  const isolatedSearchLink = await (await api('/api/mcp-links', { name: 'Search isolation', days: 1 }, isolatedSearchProject)).json();
  const isolatedSearchKey = new URL(isolatedSearchLink.url).searchParams.get('key');
  assert.equal((await call(isolatedSearchKey, 'search_project', { query: 'mcpfreshsavedcontent' })).count, 0);
  await call(key, 'delete_section', { page: 'home', id: searchable.id });
  await call(key, 'delete_section', { page: 'home', id: hiddenSearch.id });
  await call(key, 'delete_section', { page: other, id: elsewhere.id });
  console.log('PASS: Standard MCP search, fresh saves, section links, hidden/development exclusion, typo ranking and page/project isolation.');
  await api('/api/mcp-links', { action: 'revoke', id: created.link.id }, project);
  assert.equal((await rpc(key, 'tools/call', { name: 'search_project', arguments: { query: 'hydrogel' } }, true)).status, 401);
} finally {
  await new Promise(resolve => server.close(resolve));
}
