import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { generateKeyPair, SignJWT } from 'jose';
import { createAppServer } from '../selfhost-dist/server/app.mjs';
const keys = await generateKeyPair('RS256');
const environment = {
  CF_ACCESS_TEAM_DOMAIN: 'https://example.cloudflareaccess.com',
  CF_ACCESS_AUD: 'projects-test',
  CF_ACCESS_ORIGIN: 'https://editor.example.com',
  CODEX_SOCKET: 'mock',
};
const jwt = await new SignJWT({ email: 'editor@example.com' })
  .setProtectedHeader({ alg: 'RS256' })
  .setSubject('editor')
  .setIssuer(environment.CF_ACCESS_TEAM_DOMAIN)
  .setAudience('projects-test')
  .setIssuedAt()
  .setExpirationTime('10m')
  .sign(keys.privateKey);
const dataDir = await mkdtemp(path.resolve('work/projects-test-'));
// Simulate an installation predating project support.
const old = new DatabaseSync(path.join(dataDir, 'wiki.sqlite'));
old.exec(
  "CREATE TABLE blocks (id TEXT PRIMARY KEY,value TEXT NOT NULL,version INTEGER NOT NULL,author TEXT NOT NULL); INSERT INTO blocks VALUES('headline','Existing team work',4,'Teammate');",
);
old.close();
let server, origin;
async function start() {
  server = await createAppServer({
    environment,
    dataDir,
    clientDir: path.resolve('selfhost-dist/client'),
    keyOverride: keys.publicKey,
    codexRunner: async (route, body) =>
      route === '/status'
        ? { enabled: true }
        : { kind: 'chat', reply: 'Project pages: ' + body.pages.join(',') },
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  origin = 'http://127.0.0.1:' + server.address().port;
}
const request = (url, body, project, extra = {}) =>
  fetch(origin + url, {
    method: body ? 'POST' : 'GET',
    headers: {
      origin: environment.CF_ACCESS_ORIGIN,
      'X-Prion-Layout-Protocol': '2',
      'cf-access-jwt-assertion': jwt,
      'Content-Type': 'application/json',
      ...(project ? { 'X-Prion-Project': project } : {}),
      ...extra,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
const content = async (project) =>
  (await request('/api/content', null, project)).json();
const post = (body, project) => request('/api/content', body, project);
await start();
try {
  assert.equal((await fetch(origin + '/api/projects')).status, 401);
  assert.equal(
    (
      await request(
        '/api/projects',
        { action: 'create', name: 'Rejected' },
        null,
        { origin: 'https://other.example.com' },
      )
    ).status,
    403,
  );
  assert.equal(
    (await content()).rows.find((r) => r.id === 'headline').value,
    'Existing team work',
  );
  assert.equal(
    (await content()).rows.find((r) => r.id === 'headline').version,
    4,
  );
  const created = await request('/api/projects', {
    action: 'create',
    name: 'Second project',
  });
  assert.equal(created.status, 201);
  const { id } = await created.json();
  assert.deepEqual((await content(id)).rows, []);
  assert.equal(
    (
      await post(
        { id: 'headline', value: 'Second project headline', version: 0 },
        id,
      )
    ).status,
    200,
  );
  assert.equal(
    (await post({ id: 'headline', value: 'Stale', version: 0 }, id)).status,
    409,
  );
  assert.equal(
    (
      await post({
        id: 'headline',
        value: 'Old tab cannot guess project',
        version: 4,
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await post(
        {
          id: 'site:header',
          value: JSON.stringify({ name: 'Second project brand' }),
          version: 0,
        },
        id,
      )
    ).status,
    200,
  );
  assert.equal(
    (await content('main')).rows.find((r) => r.id === 'site:header'),
    undefined,
  );
  for (const project of ['main', id])
    assert.equal(
      (
        await request(
          '/api/pages',
          {
            slug: 'shared-address',
            title: project === 'main' ? 'Original page' : 'Other page',
          },
          project,
        )
      ).status,
      201,
    );
  assert.equal(
    (
      await request(
        '/api/pages',
        { slug: 'second-only', title: 'Second only' },
        id,
      )
    ).status,
    201,
  );
  assert.equal((await request('/second-only?project=' + id)).status, 200);
  assert.equal((await request('/second-only?project=main')).status, 404);
  assert.equal((await post({ presence: true }, id)).status, 200);
  assert.equal((await content(id)).people.length, 1);
  assert.equal((await content('main')).people.length, 0);
  assert.equal(
    (await request('/api/projects', { action: 'default', id })).status,
    200,
  );
  assert.equal((await content()).projectId, id);
  assert.equal(
    (await content()).rows.find((r) => r.id === 'headline').value,
    'Second project headline',
  );
  assert.equal(
    (
      await post(
        {
          id: 'headline',
          value: 'Existing editor stays in original project',
          version: 4,
        },
        'main',
      )
    ).status,
    200,
  );
  assert.equal(
    (await content(id)).rows.find((r) => r.id === 'headline').value,
    'Second project headline',
  );
  const headerLinks = Array.from({ length: 40 }, (_, i) => ({
    label: 'Project navigation item ' + i,
    href: '/second-only',
    group: 'Research',
    hidden: i === 39,
  }));
  const newHeader = JSON.stringify({
    name: 'Second project brand',
    brandHref: '/second-only',
    links: headerLinks,
    layout: 'centered',
    navSize: 18,
  });
  assert.ok(newHeader.length > 2000);
  assert.equal(
    (await post({ id: 'site:header', value: newHeader, version: 1 }, id))
      .status,
    200,
  );
  assert.equal(
    (await post({ id: 'site:header', value: newHeader, version: 0 }, 'main'))
      .status,
    400,
    'Header links cannot target another project’s pages',
  );
  const exported = await (await request('/api/export', null, id)).json();
  assert.equal(exported.project.id, id);
  assert.equal(exported.values.headline, 'Second project headline');
  assert.equal(
    JSON.parse(exported.values['pages:custom'])[0].title,
    'Other page',
  );
  const context = {
    page: 'second-only',
    layout: { nodes: [], order: [], gap: 0, width: 'full', sidebar: true },
    layoutVersion: 0,
    fields: {},
    prompt: 'hello',
    messages: [],
    effort: 'medium',
    target: null,
  };
  assert.equal((await request('/api/ai/page', context, 'main')).status, 400);
  assert.equal((await request('/api/ai/page', context, id)).status, 200);
  assert.equal(
    (await request('/api/projects', { action: 'default', id: 'missing' }))
      .status,
    400,
  );
  assert.equal((await request('/api/content', null, 'missing')).status, 404);
  assert.equal((await fetch(origin + '/studio-preview')).status, 401);
  const preview = await request('/studio-preview');
  assert.equal(preview.status, 200);
  assert.match(await preview.text(), /type="module"/);
  const nginx = await readFile('ops/nginx-prion.conf', 'utf8');
  assert.match(nginx, /\/studio-preview\s+"'self'"/);
  assert.match(nginx, /default\s+"'none'"/);
  await writeFile('work/project-snapshot.json', JSON.stringify(exported));
  await new Promise((r) => server.close(r));
  await start();
  assert.equal((await content()).projectId, id);
  assert.equal(
    (await content('main')).rows.find((r) => r.id === 'headline').version,
    5,
  );
  assert.equal(
    (await content(id)).rows.find((r) => r.id === 'headline').version,
    1,
  );
  assert.equal(
    (await (await request('/api/projects')).json()).projects.length,
    2,
  );
  console.log(
    'PASS: upgrade preserves existing rows; project creation, scoped content/header/pages/presence/AI/export, CAS, stale-tab protection, default publication, authenticated preview, persistence across restart.',
  );
} finally {
  await new Promise((r) => server.close(r));
}
