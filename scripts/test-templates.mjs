import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { generateKeyPair, SignJWT } from 'jose';
import { createAppServer } from '../selfhost-dist/server/app.mjs';
import { LAYOUT_WRITE_PROTOCOL } from '../selfhost-dist/server/shared.mjs';
const keys = await generateKeyPair('RS256');
const environment = {
  CF_ACCESS_TEAM_DOMAIN: 'https://example.cloudflareaccess.com',
  CF_ACCESS_AUD: 'templates-test',
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
const dataDir = await mkdtemp(path.resolve('work/templates-test-'));
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
    codexRunner: async (route) =>
      route === '/status'
        ? { enabled: true }
        : { kind: 'chat', reply: 'Hello!' },
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  origin = 'http://127.0.0.1:' + server.address().port;
}
const req = (url, body, project) =>
  fetch(origin + url, {
    method: body ? 'POST' : 'GET',
    headers: {
      origin: environment.CF_ACCESS_ORIGIN,
      'cf-access-jwt-assertion': jwt,
      'content-type': 'application/json',
      'X-Prion-Layout-Protocol': LAYOUT_WRITE_PROTOCOL,
      ...(project ? { 'X-Prion-Project': project } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
const content = async (id) => (await req('/api/content', null, id)).json();
await start();
try {
  assert.equal((await fetch(origin + '/api/projects')).status, 401);
  for (const url of [
    '/',
    '/workspace',
    '/api/session',
    '/templates/regelerate/gel-watercolor.png',
    '/api/ai/status',
  ])
    assert.equal((await req(url)).status, 200, url);
  const imageResponse = await req('/templates/regelerate/gel-watercolor.png');
  assert.match(
    imageResponse.headers.get('cache-control'),
    /private, max-age=600/,
  );
  assert.ok(imageResponse.headers.get('etag'));
  await imageResponse.arrayBuffer();
  assert.equal(
    (
      await fetch(origin + '/templates/regelerate/gel-watercolor.png', {
        headers: {
          'cf-access-jwt-assertion': jwt,
          'if-none-match': imageResponse.headers.get('etag'),
        },
      })
    ).status,
    304,
  );
  const list = await (await req('/api/projects')).json();
  assert.equal(list.projects.length, 0);
  assert.deepEqual(list.templates.map((template) => template.id).sort(),
    ['blank', 'luca', 'notebook-purple', 'notebook-white', 'regelerate', 'swiss']);
  assert.equal(list.archivedProjects[0].id, 'main');
  assert.equal((await req('/api/content', null, 'main')).status, 404);
  assert.equal(
    (await (await req('/api/export?project=main')).json()).values.headline,
    'Existing team work',
  );
  for (const templateId of ['missing', '__proto__'])
    assert.equal(
      (
        await req('/api/projects', {
          action: 'create',
          name: 'Bad',
          templateId,
        })
      ).status,
      400,
    );
  const ids = {};
  for (const templateId of ['regelerate', 'swiss', 'blank']) {
    const r = await req('/api/projects', {
      action: 'create',
      name: templateId,
      templateId,
    });
    assert.equal(r.status, 201);
    ids[templateId] = (await r.json()).id;
    const data = await content(ids[templateId]);
    assert.equal(
      data.rows.find((r) => r.id === 'site:template').value,
      templateId,
    );
    assert.ok(!data.rows.some((r) => r.id === 'headline'));
    assert.equal(
      (
        await req(
          '/api/content',
          { id: 'site:template', value: 'blank', version: 1 },
          ids[templateId],
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await req(
          '/api/pages',
          { slug: 'team-journal', title: 'Team journal' },
          ids[templateId],
        )
      ).status,
      201,
    );
    const snapshot = await (
      await req('/api/export', null, ids[templateId])
    ).json();
    await writeFile(
      'work/template-' + templateId + '-snapshot.json',
      JSON.stringify(snapshot),
    );
  }
  assert.equal(
    (
      await req(
        '/api/pages',
        { slug: 'description', title: 'Description' },
        ids.regelerate,
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await req(
        '/api/pages',
        { slug: 'description', title: 'Description' },
        ids.blank,
      )
    ).status,
    201,
  );
  const blankData = await content(ids.blank);
  const linked = JSON.parse(
    blankData.rows.find((r) => r.id === 'layout:team-journal').value,
  );
  linked.nodes[0].linkTo = 'https://example.org/research';
  linked.nodes[0].links = { 'link-0-1': 'https://example.org/sponsor' };
  assert.equal(
    (
      await req(
        '/api/content',
        {
          id: 'layout:team-journal',
          value: JSON.stringify(linked),
          version: blankData.rows.find((r) => r.id === 'layout:team-journal')
            .version,
        },
        ids.blank,
      )
    ).status,
    200,
  );
  for (const bad of ['javascript:alert(1)', '//example.org', '/missing']) {
    const invalid = structuredClone(linked);
    invalid.nodes[0].linkTo = bad;
    assert.equal(
      (
        await req(
          '/api/content',
          {
            id: 'layout:team-journal',
            value: JSON.stringify(invalid),
            version: 2,
          },
          ids.blank,
        )
      ).status,
      400,
    );
    const invalidOverride = structuredClone(linked);
    invalidOverride.nodes[0].links = { 'link-0-1': bad };
    assert.equal(
      (
        await req(
          '/api/content',
          {
            id: 'layout:team-journal',
            value: JSON.stringify(invalidOverride),
            version: 2,
          },
          ids.blank,
        )
      ).status,
      400,
    );
  }
  assert.equal(
    (
      await req(
        '/api/content',
        {
          id: 'site:header',
          value: JSON.stringify({
            brandHref: 'https://example.org/team',
            links: [
              {
                href: 'https://example.org/paper',
                label: 'Paper',
                group: '',
                hidden: false,
              },
            ],
          }),
          version:
            blankData.rows.find((r) => r.id === 'site:header')?.version ?? 0,
        },
        ids.blank,
      )
    ).status,
    200,
  );
  const a = await content(ids.regelerate),
    field = a.rows.find((r) => r.id.startsWith('template:home:'));
  assert.ok(field);
  assert.equal(
    (
      await req(
        '/api/content',
        { id: field.id, value: 'Edited template text', version: field.version },
        ids.regelerate,
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await req(
        '/api/content',
        { id: field.id, value: 'Stale edit', version: field.version },
        ids.regelerate,
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await req('/api/content', {
        id: field.id,
        value: 'Unscoped edit',
        version: field.version,
      })
    ).status,
    409,
  );
  const beforeDuplicate = (await (await req('/api/projects')).json()).projects
    .length;
  for (const name of ['regelerate', ' REGELERATE ', 'ＲＥＧＥＬＥＲＡＴＥ']) {
    assert.equal(
      (
        await req('/api/projects', {
          action: 'create',
          name,
          templateId: 'regelerate',
        })
      ).status,
      409,
    );
  }
  assert.equal(
    (await (await req('/api/projects')).json()).projects.length,
    beforeDuplicate,
  );
  const copy = await (
    await req('/api/projects', {
      action: 'create',
      name: 'Second notebook',
      templateId: 'regelerate',
    })
  ).json();
  assert.equal(
    (await content(copy.id)).rows.find((r) => r.id === field.id).value,
    field.value,
  );
  assert.equal(
    (await req('/api/content', { presence: true }, ids.regelerate)).status,
    200,
  );
  assert.equal((await content(ids.regelerate)).people.length, 1);
  assert.equal((await content(ids.swiss)).people.length, 0);
  assert.equal(
    (await req('/api/projects', { action: 'default', id: ids.swiss })).status,
    200,
  );
  assert.equal((await content()).projectId, ids.swiss);
  const context = {
    page: 'home',
    layout: JSON.parse(a.rows.find((r) => r.id === 'layout:home').value),
    layoutVersion: 1,
    fields: { [field.id]: { value: field.value, version: 1 } },
    prompt: 'hello',
    messages: [],
    effort: 'medium',
  };
  const ai = await req('/api/ai/page', context, ids.regelerate);
  assert.equal(ai.status, 200, await ai.text());
  for (const id of Object.values(ids)) {
    assert.equal((await req('/team-journal?project=' + id)).status, 200);
  }
  await new Promise((r) => server.close(r));
  await start();
  assert.equal((await content()).projectId, ids.swiss);
  assert.equal(
    (await content(ids.regelerate)).rows.find((r) => r.id === field.id).value,
    'Edited template text',
  );
  assert.equal((await (await req('/api/projects')).json()).projects.length, 4);
  assert.equal(
    (await (await req('/api/export?project=main')).json()).values.headline,
    'Existing team work',
  );
  const beforeRestart = (
    await (await req('/api/projects')).json()
  ).projects.map((p) => p.id);
  for (let attempt = 0; attempt < 3; attempt++) {
    await new Promise((r) => server.close(r));
    await start();
    assert.deepEqual(
      (await (await req('/api/projects')).json()).projects.map((p) => p.id),
      beforeRestart,
    );
  }
  console.log(
    'PASS: repeated startup does not create template projects; same-name, case, whitespace and Unicode duplicate requests are rejected.',
  );
  // Project deletion is recoverable, isolated, authenticated, and explicit about publication.
  const deletion = { action: 'delete', id: copy.id };
  assert.equal(
    (
      await fetch(origin + '/api/projects', {
        method: 'POST',
        headers: {
          origin: environment.CF_ACCESS_ORIGIN,
          'content-type': 'application/json',
          'X-Prion-Layout-Protocol': LAYOUT_WRITE_PROTOCOL,
        },
        body: JSON.stringify(deletion),
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await fetch(origin + '/api/projects', {
        method: 'POST',
        headers: {
          origin: 'https://evil.example',
          'cf-access-jwt-assertion': jwt,
          'content-type': 'application/json',
          'X-Prion-Layout-Protocol': LAYOUT_WRITE_PROTOCOL,
        },
        body: JSON.stringify(deletion),
      })
    ).status,
    403,
  );
  assert.equal((await req('/api/projects', deletion)).status, 200);
  let afterDelete = await (await req('/api/projects')).json();
  assert.equal(afterDelete.defaultId, ids.swiss);
  assert.equal(afterDelete.projects.length, 3);
  assert.ok(afterDelete.deletedProjects.some((p) => p.id === copy.id));
  assert.equal((await req('/api/content', null, copy.id)).status, 404);
  assert.equal((await req('/api/export?project=' + copy.id)).status, 404);
  assert.equal(
    (await req('/api/content', { presence: true }, copy.id)).status,
    404,
  );
  assert.equal(
    (await req('/api/projects', { action: 'default', id: copy.id })).status,
    400,
  );
  assert.equal((await req('/api/projects', deletion)).status, 404);
  assert.equal(
    (await req('/api/projects', { action: 'delete', id: ids.swiss })).status,
    409,
  );
  assert.equal(
    (
      await req('/api/projects', {
        action: 'delete',
        id: ids.swiss,
        replacementId: copy.id,
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await req('/api/projects', {
        action: 'delete',
        id: ids.swiss,
        replacementId: ids.swiss,
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await req('/api/projects', {
        action: 'delete',
        id: ids.swiss,
        replacementId: ids.regelerate,
      })
    ).status,
    200,
  );
  assert.equal((await content()).projectId, ids.regelerate);
  assert.equal(
    (await content(ids.regelerate)).rows.find((r) => r.id === field.id).value,
    'Edited template text',
  );
  await new Promise((r) => server.close(r));
  await start();
  assert.equal((await req('/api/content', null, ids.swiss)).status, 404);
  assert.equal(
    (await req('/api/projects', { action: 'restore', id: copy.id })).status,
    200,
  );
  assert.equal(
    (await content(copy.id)).rows.find((r) => r.id === field.id).value,
    field.value,
  );
  assert.equal((await content()).projectId, ids.regelerate);
  assert.equal(
    (await req('/api/projects', { action: 'restore', id: copy.id })).status,
    404,
  );
  assert.equal(
    (await req('/api/projects', { action: 'delete', id: 'main' })).status,
    200,
  );
  assert.equal((await req('/api/export?project=main')).status, 404);
  await new Promise((r) => server.close(r));
  await start();
  assert.equal((await req('/api/export?project=main')).status, 404);
  assert.equal(
    (await req('/api/projects', { action: 'restore', id: 'main' })).status,
    200,
  );
  assert.equal(
    (await (await req('/api/export?project=main')).json()).values.headline,
    'Existing team work',
  );
  assert.equal((await req('/api/projects', deletion)).status, 200);
  assert.equal(
    (await req('/api/projects', { action: 'delete', id: ids.blank })).status,
    200,
  );
  assert.equal(
    (await req('/api/projects', { action: 'delete', id: ids.regelerate }))
      .status,
    200,
  );
  afterDelete = await (await req('/api/projects')).json();
  assert.equal(afterDelete.projects.length, 0);
  assert.equal(afterDelete.defaultId, '');
  assert.equal((await req('/')).status, 200);
  assert.equal((await req('/workspace')).status, 200);
  assert.equal(
    (await req('/api/projects', { action: 'restore', id: ids.swiss })).status,
    200,
  );
  assert.equal((await content()).projectId, ids.swiss);
  console.log(
    'PASS: authenticated deletion, origin checks, Trash/restore, archived project deletion, replacement selection, last-project deletion, stale-tab rejection, isolation and restart persistence.',
  );
  console.log(
    'PASS: templates, fresh login/library/assets, archive migration, independent copies, blank pages, duplicate protection, CAS, presence, AI text context, default project, export, and restart persistence.',
  );
} finally {
  await new Promise((r) => server.close(r));
}
