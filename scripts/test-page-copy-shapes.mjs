import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
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
  const project = (
    await (
      await api('/api/projects', {
        action: 'create',
        name: 'Copy and resize',
        templateId: 'regelerate',
      })
    ).json()
  ).id;
  const link = await (
    await api('/api/mcp-links', { name: 'Standard editor', days: 1 }, project)
  ).json();
  const key = new URL(link.url).searchParams.get('key');
  const save = async (id, value) => {
    const content = await (await api('/api/content', null, project)).json();
    const version = content.rows.find((r) => r.id === id)?.version || 0;
    const r = await api('/api/content', { id, value, version }, project);
    assert.equal(r.status, 200, await r.text());
  };
  const rows = () =>
    api('/api/content', null, project)
      .then((r) => r.json())
      .then((r) => Object.fromEntries(r.rows.map((x) => [x.id, x])));
  const original = await rows();
  const fields = Object.keys(original).filter((id) =>
    id.startsWith('template:description:'),
  );
  assert.ok(fields.length);
  await save(fields[0], 'Original saved text');
  const shape = await call(key, 'add_section', {
    page: 'description',
    heading: 'Diagram',
    kind: 'shape',
    shape: 'ellipse',
  });
  await call(key, 'update_section', {
    page: 'description',
    id: shape.id,
    changes: { span: 6, minHeight: 260, background: '#3478f6' },
  });
  const frame = await call(key, 'add_section', {
    page: 'description',
    heading: 'Free frame',
    kind: 'section',
  });
  await call(key, 'update_section', {
    page: 'description',
    id: frame.id,
    changes: { layoutMode: 'free' },
  });
  const child = await call(key, 'add_section', {
    page: 'description',
    heading: 'Arrow',
    kind: 'shape',
    inside: frame.id,
  });
  await call(key, 'update_section', {
    page: 'description',
    id: child.id,
    changes: { x: 10, y: 80, freeWidth: 45, freeHeight: 160, shape: 'arrow' },
  });
  await rejects(
    call(key, 'update_section', {
      page: 'description',
      id: child.id,
      changes: { freeWidth: 101 },
    }),
    /invalid|valid|layout/i,
  );
  const sourceRows = await rows();
  const sourceLayout = JSON.parse(sourceRows['layout:description'].value);
  const stale = await api(
    '/api/pages',
    { source: 'description', sourceVersion: 0, title: 'Stale', slug: 'stale' },
    project,
  );
  assert.equal(stale.status, 409);
  await call(key, 'duplicate_page', {
    source: 'description',
    title: 'Description copy',
    slug: 'description-copy',
    sourceVersion: sourceRows['layout:description'].version,
  });
  const after = await rows();
  assert.deepEqual(
    JSON.parse(after['layout:description-copy'].value),
    sourceLayout,
  );
  assert.equal(
    after['copy:description-copy:' + fields[0]].value,
    'Original saved text',
  );
  await save('copy:description-copy:' + fields[0], 'Independent copy text');
  assert.equal((await rows())[fields[0]].value, 'Original saved text');
  await call(key, 'duplicate_page', {
    source: 'description-copy',
    title: 'Second copy',
    slug: 'second-copy',
  });
  assert.equal(
    (await rows())['copy:second-copy:' + fields[0]].value,
    'Independent copy text',
  );
  await rejects(
    call(key, 'duplicate_page', {
      source: 'description',
      title: 'Duplicate',
      slug: 'second-copy',
    }),
    /already/,
  );
  await call(key, 'update_section', {
    page: 'description-copy',
    id: shape.id,
    changes: { span: 3, minHeight: 100 },
  });
  assert.equal(
    JSON.parse((await rows())['layout:description'].value).nodes.find(
      (n) => n.id === shape.id,
    ).span,
    6,
  );
  // Lock protection remains effective for standard links.
  const latest = await rows();
  const layout = JSON.parse(latest['layout:description-copy'].value);
  layout.nodes.find((n) => n.id === shape.id).locked = true;
  await save('layout:description-copy', JSON.stringify(layout));
  await rejects(
    call(key, 'update_section', {
      page: 'description-copy',
      id: shape.id,
      changes: { span: 2 },
    }),
    /locked/,
  );
  const copyPage = await call(key, 'get_page', { page: 'description-copy' });
  assert.ok(JSON.stringify(copyPage).includes('Independent copy text'));
  await call(key, 'delete_page', { slug: 'description' });
  assert.ok(
    JSON.stringify(
      await call(key, 'get_page', { page: 'description-copy' }),
    ).includes('Independent copy text'),
  );
  // Static compilation proves copied fields, shapes and template structure survive export.
  const snapshot = path.join(dataDir, 'copy.json');
  await (
    await import('node:fs/promises')
  ).writeFile(
    snapshot,
    JSON.stringify({
      format: 'prion-wiki-source',
      version: 1,
      values: Object.fromEntries(
        Object.entries(await rows()).map(([id, row]) => [id, row.value]),
      ),
    }),
  );
  const { spawnSync } = await import('node:child_process');
  const out = path.join(dataDir, 'export');
  const result = spawnSync(
    process.execPath,
    [
      'scripts/export-static.mjs',
      '--snapshot',
      snapshot,
      '--out',
      out,
      '--base',
      '/test-team/',
    ],
    { encoding: 'utf8' },
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const html = await readFile(
    path.join(out, 'public/description-copy/index.html'),
    'utf8',
  );
  assert.ok(html.includes('Independent copy text'));
  assert.ok(html.includes('<ellipse'));
  assert.ok(html.includes('<polygon'));
  console.log(
    'PASS: standard MCP resize/shape edits, validation, locks, atomic page copies, stale-version protection, independent text/layouts, duplicate copies and static output.',
  );
} finally {
  server.close();
  server.closeAllConnections?.();
}
