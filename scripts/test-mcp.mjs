import assert from 'node:assert/strict';
import { mkdtemp, stat } from 'node:fs/promises';
import path from 'node:path';
import { generateKeyPair, SignJWT } from 'jose';
import { createAppServer } from '../selfhost-dist/server/app.mjs';
import { newNode } from '../selfhost-dist/server/shared.mjs';
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
const bobJwt = await new SignJWT({ email: 'bob@example.com' })
  .setProtectedHeader({ alg: 'RS256' })
  .setSubject('bob')
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
        name: 'MCP',
        templateId: 'regelerate',
      })
    ).json()
  ).id;
  // Links are created by signed-in editors only.
  assert.equal(
    (await fetch(origin + '/api/mcp-links?project=' + project)).status,
    401,
  );
  assert.equal(
    (await api('/api/mcp-links', { name: 'x', days: 3 }, project)).status,
    400,
  );
  // The team writes one brief; each link can carry its own task.
  const briefRow = (
    await (await api('/api/content', null, project)).json()
  ).rows.find((r) => r.id === 'ai:brief');
  assert.equal(briefRow.value, '');
  assert.equal(
    (
      await api(
        '/api/content',
        {
          id: 'ai:brief',
          value: 'We engineer yeast prion proteins into a self-healing gel.',
          version: briefRow.version,
        },
        project,
      )
    ).status,
    200,
  );
  const created = await (
    await api(
      '/api/mcp-links',
      { name: 'Claude', days: 7, task: 'Draft the Results page.' },
      project,
    )
  ).json();
  assert.equal(created.link.task, 'Draft the Results page.');
  // The creator can copy their link again; teammates see it but cannot copy it.
  const own = (await (await api('/api/mcp-links', null, project)).json()).links;
  assert.deepEqual(
    own.map((l) => [l.name, l.mine, l.canCopy]),
    [['Claude', true, true]],
  );
  const again = await (
    await api(
      '/api/mcp-links',
      { action: 'reveal', id: created.link.id },
      project,
    )
  ).json();
  assert.equal(again.url, created.url);
  const seenByBob = (
    await (await api('/api/mcp-links', null, project, bobJwt)).json()
  ).links;
  assert.deepEqual(
    seenByBob.map((l) => [l.name, l.createdBy, l.mine, l.canCopy]),
    [['Claude', 'ada@example.com', false, false]],
  );
  const bobReveal = await api(
    '/api/mcp-links',
    { action: 'reveal', id: created.link.id },
    project,
    bobJwt,
  );
  assert.equal(bobReveal.status, 403);
  assert.ok(
    !JSON.stringify(seenByBob).includes(
      new URL(created.url).searchParams.get('key'),
    ),
  );
  // The stored key is encrypted with a server-only key file.
  const { DatabaseSync } = await import('node:sqlite');
  const stored = new DatabaseSync(path.join(dataDir, 'wiki.sqlite'))
    .prepare('SELECT token_enc FROM mcp_links WHERE id=?')
    .get(created.link.id).token_enc;
  assert.ok(
    stored && !stored.includes(new URL(created.url).searchParams.get('key')),
  );
  assert.equal((await stat(path.join(dataDir, 'mcp-link.key'))).size, 32);
  const key = new URL(created.url).searchParams.get('key');
  assert.ok(key.length >= 40);
  const listed = await (await api('/api/mcp-links', null, project)).json();
  assert.equal(listed.links.length, 1);
  assert.ok(!JSON.stringify(listed).includes(key), 'secret is never listed');

  assert.equal((await rpc('wrong', 'ping', {}, true)).status, 401);
  assert.equal(
    (await fetch(origin + '/mcp?key=' + key, { method: 'GET' })).status,
    405,
  );
  const init = await rpc(key, 'initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'test', version: '1' },
  });
  assert.equal(init.protocolVersion, '2025-06-18');
  assert.ok(init.capabilities.tools);
  assert.ok(init.capabilities.prompts);
  assert.match(init.instructions, /get_site_overview/);
  assert.match(init.instructions, /self-healing gel/);
  assert.match(init.instructions, /Draft the Results page/);
  assert.match(init.instructions, /Project: MCP\./);
  const promptList = await rpc(key, 'prompts/list', {});
  assert.deepEqual(promptList.prompts.map((p) => p.name).sort(), [
    'improve_page',
    'review_wiki',
    'write_from_notes',
  ]);
  const prompt = await rpc(key, 'prompts/get', {
    name: 'improve_page',
    arguments: { page: 'results', goal: 'add figures' },
  });
  assert.match(prompt.messages[0].content.text, /"results".*add figures/s);

  // One call gives the AI the site map, brief, task and page purposes.
  const overview = await call(key, 'get_site_overview', {});
  assert.equal(overview.project, 'MCP');
  assert.match(overview.teamBrief, /self-healing gel/);
  assert.equal(overview.yourTask, 'Draft the Results page.');
  assert.equal(overview.menu.groups.length, 5);
  assert.equal(overview.menu.groups[0].group, 'Project');
  assert.ok(overview.menu.groups[0].pages.includes('results'));
  const resultsPage = overview.pages.find((p) => p.slug === 'results');
  assert.match(resultsPage.purpose, /figures/);
  assert.equal(resultsPage.status, 'untouched template content');
  assert.equal(resultsPage.menuGroup, 'Project');
  assert.match(
    (await call(key, 'get_page', { page: 'results' })).purpose,
    /Results/,
  );

  // Menu editing: new pages go where they are asked; groups can be created.
  await call(key, 'create_page', {
    title: 'Lab journal',
    slug: 'lab-journal',
    menuGroup: 'Wet Lab',
  });
  let map = (await call(key, 'get_site_overview', {})).menu;
  assert.equal(
    map.groups.find((g) => g.group === 'Wet Lab').pages.at(-1),
    'lab-journal',
  );
  await call(key, 'move_page_in_menu', {
    slug: 'lab-journal',
    group: 'Extras',
    position: 0,
  });
  await call(key, 'move_page_in_menu', {
    slug: 'sponsors',
    group: 'Extras',
    position: 0,
  });
  map = (await call(key, 'get_site_overview', {})).menu;
  assert.deepEqual(map.groups.at(-1), {
    group: 'Extras',
    pages: ['sponsors', 'lab-journal'],
  });
  assert.ok(
    !map.groups.find((g) => g.group === 'Team').pages.includes('sponsors'),
  );
  await call(key, 'move_page_in_menu', { slug: 'lab-journal', group: null });
  map = (await call(key, 'get_site_overview', {})).menu;
  assert.ok(map.notInMenu.includes('lab-journal'));
  await rejects(
    call(key, 'set_menu', { groups: [{ label: 'X', pages: ['nope'] }] }),
    /Unknown pages: nope/,
  );
  await rejects(
    call(key, 'set_menu', {
      groups: [{ label: 'Only', pages: ['results'] }],
      ifVersion: map.version - 1,
    }),
    /Conflict/,
  );
  // Invalid menus are refused by the content API too.
  const menuRow = (
    await (await api('/api/content', null, project)).json()
  ).rows.find((r) => r.id === 'site:menu');
  assert.equal(
    (
      await api(
        '/api/content',
        {
          id: 'site:menu',
          value: JSON.stringify({
            groups: [{ id: 'g', label: 'A', pages: ['home'] }],
          }),
          version: menuRow.version,
        },
        project,
      )
    ).status,
    400,
  );
  await call(key, 'delete_page', { slug: 'lab-journal' });
  const note = await fetch(origin + '/mcp?key=' + key, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    }),
  });
  assert.equal(note.status, 202);
  const { tools } = await rpc(key, 'tools/list', {});
  for (const name of [
    'list_pages',
    'get_page',
    'update_text',
    'add_section',
    'update_section',
    'move_section',
    'delete_section',
    'set_page_css',
    'create_page',
    'delete_page',
  ])
    assert.ok(
      tools.some((t) => t.name === name),
      name,
    );

  const { pages } = await call(key, 'list_pages', {});
  assert.ok(pages.some((p) => p.slug === 'home'));
  let home = await call(key, 'get_page', { page: 'home' });
  const template = home.sections.find(
    (s) => s.kind === 'template' && s.texts?.length && s.region === 'main',
  );
  assert.ok(template, 'template section with text fields');

  // get_page describes each template element: role, text, fields, selector.
  const hero = home.sections.find((s) => s.id === 'import-main-0');
  const h1 = hero.elements.find((e) => e.role === 'heading 1');
  assert.ok(h1, 'hero heading is outlined');
  assert.match(
    h1.selector,
    /^\[data-layer-id="import-main-0"\] > div:nth-of-type\(1\) > section:nth-of-type\(1\)( > [a-z0-9]+:nth-of-type\(\d+\))+$/,
  );
  assert.ok(h1.fieldIds.every((id) => id.startsWith('template:home:')));
  assert.ok(h1.text.length > 3);
  assert.ok(hero.elements.some((e) => e.role === 'paragraph'));
  const menuLinks = home.sections
    .find((s) => s.region === 'header')
    .elements.filter((e) => e.role === 'link' && e.href);
  assert.ok(menuLinks.some((e) => e.href === '/results' && e.linkKey));
  // Every template field on the page is reachable from some element.
  const outlined = new Set(
    home.sections.flatMap((s) =>
      (s.elements || []).flatMap((e) => e.fieldIds || []),
    ),
  );
  for (const s of home.sections)
    for (const t of s.texts || [])
      assert.ok(outlined.has(t.fieldId), 'outlined ' + t.fieldId);
  // style_element changes one element through the editor's own CSS format.
  await call(key, 'style_element', {
    page: 'home',
    selector: h1.selector,
    styles: { color: '#c62828' },
    scope: 'mobile',
  });
  const styled = (await call(key, 'get_page', { page: 'home' })).customCss;
  assert.match(styled, /prion-selection-controls/);
  assert.match(styled, /@media \(max-width: 760px\)/);
  assert.ok(styled.includes(h1.selector));
  await rejects(
    call(key, 'style_element', {
      page: 'home',
      selector: h1.selector,
      styles: { position: 'fixed' },
    }),
    /position/,
  );
  await rejects(
    call(key, 'style_element', {
      page: 'home',
      selector: 'body',
      styles: { color: '#000' },
    }),
    /selector from get_page/,
  );

  // Collapsible sections: several items, stable ids, selectors per item.
  const { id: faq } = await call(key, 'add_section', {
    page: 'home',
    heading: 'Frequently asked',
    kind: 'accordion',
    items: [
      { title: 'Is it safe?', body: 'Yes, see Safety.' },
      { title: 'Can I reuse it?', body: 'Parts are open.', open: true },
    ],
  });
  let faqNode = (await call(key, 'get_page', { page: 'home' })).sections.find(
    (s) => s.id === faq,
  );
  assert.equal(faqNode.kind, 'accordion');
  assert.deepEqual(
    faqNode.items.map((i) => [i.title, Boolean(i.open)]),
    [
      ['Is it safe?', false],
      ['Can I reuse it?', true],
    ],
  );
  assert.ok(faqNode.items.every((i) => /^item-/.test(i.id)));
  assert.equal(faqNode.selectors.items.length, 2);
  assert.equal(
    faqNode.selectors.items[1].summary,
    `[data-layer-id="${faq}"] > div:nth-of-type(1) > div:nth-of-type(1) > details:nth-of-type(2) > summary:nth-of-type(1)`,
  );
  // Reordering keeps each section's id; new sections get one.
  const [faqFirst, faqSecond] = faqNode.items;
  await call(key, 'update_section', {
    page: 'home',
    id: faq,
    changes: {
      items: [
        faqSecond,
        faqFirst,
        { title: 'Who funds it?', body: 'Sponsors.' },
      ],
    },
  });
  faqNode = (await call(key, 'get_page', { page: 'home' })).sections.find(
    (s) => s.id === faq,
  );
  assert.deepEqual(
    faqNode.items.slice(0, 2).map((i) => i.id),
    [faqSecond.id, faqFirst.id],
  );
  assert.equal(faqNode.items.length, 3);
  await rejects(
    call(key, 'update_section', {
      page: 'home',
      id: faq,
      changes: {
        items: Array.from({ length: 31 }, () => ({ title: 'x', body: '' })),
      },
    }),
    /not valid/,
  );
  const { id: plain } = await call(key, 'add_section', {
    page: 'home',
    heading: 'Plain text',
  });
  await rejects(
    call(key, 'update_section', {
      page: 'home',
      id: plain,
      changes: { items: [] },
    }),
    /not valid/,
  );
  await call(key, 'delete_section', { page: 'home', id: plain });

  // Text edits land in the saved content that editors read.
  const field = template.texts[0].fieldId;
  await call(key, 'update_text', {
    page: 'home',
    fieldId: field,
    value: 'Edited by AI',
  });
  const rows = (await (await api('/api/content', null, project)).json()).rows;
  assert.equal(rows.find((r) => r.id === field).value, 'Edited by AI');
  const saved = rows.find((r) => r.id === field);
  assert.equal(saved.author, 'Claude (AI link)');

  const { id: added } = await call(key, 'add_section', {
    page: 'home',
    heading: 'Results',
    body: 'Our first measurements.',
    after: template.id,
  });
  const { id: sub } = await call(key, 'add_section', {
    page: 'home',
    heading: 'Growth curves',
    body: 'Detail.',
    after: added,
    subsection: true,
  });
  home = await call(key, 'get_page', { page: 'home' });
  const order = home.sections.map((s) => s.id);
  assert.equal(order.indexOf(added), order.indexOf(template.id) + 1);
  assert.equal(order.indexOf(sub), order.indexOf(added) + 1);
  assert.equal(home.sections.find((s) => s.id === sub).headingLevel, 3);
  assert.deepEqual(home.sections.find((s) => s.id === sub).selectors, {
    section: `[data-layer-id="${sub}"]`,
    heading: `[data-layer-id="${sub}"] > div:nth-of-type(1) > h3:nth-of-type(1)`,
    body: `[data-layer-id="${sub}"] > div:nth-of-type(1) > div:nth-of-type(1)`,
  });

  await call(key, 'update_section', {
    page: 'home',
    id: added,
    changes: { background: '#eef6ff', indexLabel: 'Results', span: 8 },
  });
  await rejects(
    call(key, 'update_section', {
      page: 'home',
      id: added,
      changes: { background: 'blue' },
    }),
    /#RRGGBB/,
  );
  await rejects(
    call(key, 'update_section', {
      page: 'home',
      id: added,
      changes: { kind: 'image' },
    }),
    /Cannot change: kind/,
  );
  await rejects(
    call(key, 'update_section', {
      page: 'home',
      id: template.id,
      changes: { title: 'x' },
    }),
    /update_text/,
  );
  await call(key, 'move_section', { page: 'home', id: sub });
  home = await call(key, 'get_page', { page: 'home' });
  const moved = home.sections.find((s) => s.id === added);
  assert.equal(moved.background, '#eef6ff');
  assert.equal(moved.span, 8);
  assert.equal(home.sections[0].id, sub);

  await call(key, 'set_page_css', {
    page: 'home',
    css: `[data-layer-id="${added}"] h2 { color: #123456; }`,
  });
  await call(key, 'delete_section', { page: 'home', id: sub });
  await call(key, 'delete_section', { page: 'home', id: template.id });
  home = await call(key, 'get_page', { page: 'home' });
  assert.ok(!home.sections.some((s) => s.id === sub));
  assert.equal(home.sections.find((s) => s.id === template.id).hidden, true);
  assert.match(home.customCss, /#123456/);

  // Pages: create, link to it, delete — links to the deleted page are cleaned up.
  await call(key, 'create_page', {
    title: 'Lab notebook',
    slug: 'lab-notebook',
  });
  await call(key, 'update_section', {
    page: 'home',
    id: added,
    changes: { linkTo: '/lab-notebook', linkLabel: 'Open notebook' },
  });
  await rejects(
    call(key, 'create_page', { title: 'Again', slug: 'lab-notebook' }),
    /already uses/,
  );
  await call(key, 'delete_page', { slug: 'lab-notebook' });
  home = await call(key, 'get_page', { page: 'home' });
  assert.equal(home.sections.find((s) => s.id === added).linkTo, undefined);
  await rejects(
    call(key, 'get_page', { page: 'lab-notebook' }),
    /does not exist/,
  );
  // Template pages can be deleted from a project and restored later.
  await rejects(call(key, 'delete_page', { slug: 'home' }), /home page/);
  const membersText = (
    await call(key, 'get_page', { page: 'members' })
  ).sections.find((s) => s.region === 'main' && s.texts?.length).texts[0];
  assert.match(membersText.fieldId, /^template:members:/);
  await call(key, 'update_text', {
    page: 'members',
    fieldId: membersText.fieldId,
    value: 'Edited members text',
  });
  await call(key, 'update_section', {
    page: 'home',
    id: added,
    changes: { linkTo: '/members', linkLabel: 'Meet the team' },
  });
  await call(key, 'delete_page', { slug: 'members' });
  assert.ok(
    !(await call(key, 'list_pages', {})).pages.some(
      (p) => p.slug === 'members',
    ),
  );
  await rejects(call(key, 'get_page', { page: 'members' }), /does not exist/);
  assert.equal(
    (await call(key, 'get_page', { page: 'home' })).sections.find(
      (s) => s.id === added,
    ).linkTo,
    undefined,
    'links to the deleted template page are removed',
  );
  // A new page cannot take the deleted template page's address.
  assert.equal(
    (await api('/api/pages', { title: 'Members', slug: 'members' }, project))
      .status,
    409,
  );
  // Restore brings back the original template page (edits were discarded).
  assert.equal(
    (await api('/api/pages', { action: 'restore', slug: 'members' }, project))
      .status,
    200,
  );
  assert.equal(
    (await api('/api/pages', { action: 'restore', slug: 'members' }, project))
      .status,
    404,
  );
  const restored = (await call(key, 'get_page', { page: 'members' })).sections
    .find((s) => s.region === 'main' && s.texts?.length)
    .texts.find((t) => t.fieldId === membersText.fieldId);
  assert.equal(restored.value, membersText.value);
  assert.equal(restored.version, 0);
  // The removed-pages list is managed only through the page API.
  const removedRow = (
    await (await api('/api/content', null, project)).json()
  ).rows.find((r) => r.id === 'pages:removed');
  assert.ok(removedRow, 'pages:removed is part of the project content');
  assert.equal(
    (
      await api(
        '/api/content',
        { id: 'pages:removed', value: '["team"]', version: removedRow.version },
        project,
      )
    ).status,
    400,
  );
  // Editors can still save the page afterwards (no dangling links).
  const layoutRow = (
    await (await api('/api/content', null, project)).json()
  ).rows.find((r) => r.id === 'layout:home');
  assert.equal(
    (
      await api(
        '/api/content',
        {
          id: 'layout:home',
          value: layoutRow.value,
          version: layoutRow.version,
        },
        project,
      )
    ).status,
    200,
  );

  // Editors can delete custom pages from Studio too.
  assert.equal(
    (await api('/api/pages', { title: 'Temp', slug: 'temp' }, project)).status,
    201,
  );
  assert.equal(
    (await api('/api/pages', { action: 'delete', slug: 'temp' }, project))
      .status,
    200,
  );
  assert.equal(
    (await api('/api/pages', { action: 'delete', slug: 'temp' }, project))
      .status,
    404,
  );

  // Page-limited links cannot reach other pages or manage pages.
  const scoped = await (
    await api(
      '/api/mcp-links',
      { name: 'Page bot', days: 1, page: 'home' },
      project,
    )
  ).json();
  const scopedKey = new URL(scoped.url).searchParams.get('key');
  assert.deepEqual(
    (await call(scopedKey, 'list_pages', {})).pages.map((p) => p.slug),
    ['home'],
  );
  const other = pages.find((p) => p.slug !== 'home').slug;
  await rejects(call(scopedKey, 'get_page', { page: other }), /can only edit/);
  await rejects(
    call(scopedKey, 'create_page', { title: 'X', slug: 'x-page' }),
    /limited to one page/,
  );

  // Several AIs at once: every write is atomic and version-checked, so
  // parallel edits from two links all land and the page stays valid.
  const second = await (
    await api('/api/mcp-links', { name: 'GPT', days: 1 }, project)
  ).json();
  const secondKey = new URL(second.url).searchParams.get('key');
  const before = (await call(key, 'get_page', { page: 'home' })).sections
    .length;
  const burst = await Promise.all(
    Array.from({ length: 30 }, (_, i) =>
      call(i % 2 ? key : secondKey, 'add_section', {
        page: 'home',
        heading: 'Parallel ' + i,
        body: 'x',
      }),
    ),
  );
  assert.equal(new Set(burst.map((r) => r.id)).size, 30);
  home = await call(key, 'get_page', { page: 'home' });
  assert.equal(home.sections.length, before + 30);
  await Promise.all(
    burst.map((r, i) =>
      call(i % 2 ? secondKey : key, 'update_section', {
        page: 'home',
        id: r.id,
        changes: { name: 'Renamed ' + i },
      }),
    ),
  );
  home = await call(key, 'get_page', { page: 'home' });
  burst.forEach((r, i) =>
    assert.equal(home.sections.find((s) => s.id === r.id).name, 'Renamed ' + i),
  );
  // Whole-value tools refuse to overwrite a newer change when given ifVersion.
  const stale = home.version;
  await call(secondKey, 'set_page_css', {
    page: 'home',
    css: '',
    ifVersion: stale,
  });
  await rejects(
    call(key, 'set_page_css', {
      page: 'home',
      css: 'p{color:#000}',
      ifVersion: stale,
    }),
    /Conflict/,
  );
  const text = (await call(key, 'get_page', { page: 'home' })).sections.find(
    (s) => s.texts?.length,
  ).texts[0];
  await call(secondKey, 'update_text', {
    page: 'home',
    fieldId: text.fieldId,
    value: 'GPT wrote this',
    ifVersion: text.version,
  });
  await rejects(
    call(key, 'update_text', {
      page: 'home',
      fieldId: text.fieldId,
      value: 'Claude wrote this',
      ifVersion: text.version,
    }),
    /Conflict/,
  );
  // A layer locked in Studio blocks AI edits.
  const lockedRow = (
    await (await api('/api/content', null, project)).json()
  ).rows.find((r) => r.id === 'layout:home');
  const lockedLayout = JSON.parse(lockedRow.value);
  lockedLayout.nodes = lockedLayout.nodes.map((n) =>
    n.id === added ? { ...n, locked: true } : n,
  );
  assert.equal(
    (
      await api(
        '/api/content',
        {
          id: 'layout:home',
          value: JSON.stringify(lockedLayout),
          version: lockedRow.version,
        },
        project,
      )
    ).status,
    200,
  );
  await rejects(
    call(key, 'update_section', {
      page: 'home',
      id: added,
      changes: { name: 'no' },
    }),
    /locked/,
  );

  // Previews: the AI renders the saved page in its own browser.
  const preview = await call(key, 'get_preview_url', { page: 'home' });
  const previewPath = new URL(preview.url);
  assert.equal(previewPath.pathname, '/mcp/preview');
  const html = await fetch(origin + previewPath.pathname + previewPath.search);
  assert.equal(html.status, 200);
  assert.match(await html.text(), /<div id="root">/);
  const previewData = await (
    await fetch(origin + '/mcp/preview-data?key=' + key)
  ).json();
  assert.ok(previewData.data['layout:home'].value.includes(added));
  assert.ok(previewData.data['site:template']);
  assert.equal(
    (await fetch(origin + '/mcp/preview-data?key=nope')).status,
    401,
  );
  assert.equal((await fetch(origin + '/mcp/other?key=' + key)).status, 404);
  const scopedData = (
    await (await fetch(origin + '/mcp/preview-data?key=' + scopedKey)).json()
  ).data;
  assert.ok(scopedData['layout:home']);
  assert.ok(
    !Object.keys(scopedData).some(
      (id) => id.startsWith('layout:') && id !== 'layout:home',
    ),
  );

  // Header and footer are shared: a change saved on one page reaches all.
  const chromeRow = async (page) =>
    (await (await api('/api/content', null, project)).json()).rows.find(
      (r) => r.id === 'layout:' + page,
    );
  const homeRow = await chromeRow('home');
  const homeLayout = JSON.parse(homeRow.value);
  const headerNode = {
    id: 'import-header-0',
    kind: 'template',
    title: 'Header',
    body: '',
    src: '',
    caption: '',
    alt: '',
    span: 12,
    align: 'left',
    background: '#123456',
    padding: 0,
    hidden: false,
  };
  homeLayout.nodes = [
    ...homeLayout.nodes.filter((n) => n.id !== 'import-header-0'),
    headerNode,
  ];
  if (!homeLayout.order.includes('import-header-0'))
    homeLayout.order.unshift('import-header-0');
  homeLayout.customCss =
    (homeLayout.customCss || '') +
    ' [data-layer-id="import-header-0"] > div:nth-of-type(1) { color: #ff0000; }' +
    ' .home-only { color: #00ff00; }';
  assert.equal(
    (
      await api(
        '/api/content',
        {
          id: 'layout:home',
          value: JSON.stringify(homeLayout),
          version: homeRow.version,
        },
        project,
      )
    ).status,
    200,
  );
  const membersLayout = JSON.parse((await chromeRow('members')).value);
  assert.equal(
    membersLayout.nodes.find((n) => n.id === 'import-header-0')?.background,
    '#123456',
  );
  assert.match(membersLayout.customCss, /#ff0000/);
  assert.ok(!membersLayout.customCss.includes('home-only'), 'page CSS stays');
  // An AI styling the header on another page updates every page.
  const resultsHeader = (
    await call(key, 'get_page', { page: 'results' })
  ).sections
    .find((s) => s.id === 'import-header-0')
    .elements.find((e) => e.role === 'link');
  await call(key, 'style_element', {
    page: 'results',
    selector: resultsHeader.selector,
    styles: { 'font-weight': '700' },
  });
  const homeAfter = JSON.parse((await chromeRow('home')).value);
  assert.ok(homeAfter.customCss.includes(resultsHeader.selector));
  assert.match(homeAfter.customCss, /home-only/);
  // New pages start with the shared header.
  await call(key, 'create_page', {
    title: 'Shared header',
    slug: 'shared-header',
  });
  assert.equal(
    JSON.parse((await chromeRow('shared-header')).value).nodes.find(
      (n) => n.id === 'import-header-0',
    )?.background,
    '#123456',
  );
  // Pages that drifted apart can be brought back in line from one page.
  const synced = await (
    await api('/api/pages', { action: 'sync-chrome', page: 'home' }, project)
  ).json();
  assert.equal(typeof synced.pages, 'number');
  await call(key, 'delete_page', { slug: 'shared-header' });

  // Revoking a link stops it immediately.
  // Saving and assistant insertion both work past the former 100-section cap.
  await call(key, 'create_page', {
    title: 'Many sections',
    slug: 'many-sections',
  });
  const manyRow = await chromeRow('many-sections');
  const manyLayout = JSON.parse(manyRow.value);
  const extras = Array.from({ length: 150 }, (_, i) =>
    newNode(`section-${i}`, 'text', `Section ${i}`),
  );
  manyLayout.nodes.push(...extras);
  manyLayout.order.push(...extras.map((n) => n.id));
  const savedMany = await api(
    '/api/content',
    {
      id: 'layout:many-sections',
      value: JSON.stringify(manyLayout),
      version: manyRow.version,
    },
    project,
  );
  assert.equal(savedMany.status, 200, await savedMany.text());
  const extraSection = await call(key, 'add_section', {
    page: 'many-sections',
    heading: 'Beyond 150',
    body: 'Still editable',
  });
  const reloadedMany = JSON.parse((await chromeRow('many-sections')).value);
  assert.equal(reloadedMany.nodes.length, manyLayout.nodes.length + 1);
  assert.ok(reloadedMany.nodes.some((n) => n.id === extraSection.id));
  assert.ok(
    (await call(key, 'get_page', { page: 'many-sections' })).sections.some(
      (n) => n.id === extraSection.id,
    ),
  );
  await call(key, 'delete_page', { slug: 'many-sections' });

  await api(
    '/api/mcp-links',
    { action: 'revoke', id: created.link.id },
    project,
  );
  assert.equal((await rpc(key, 'ping', {}, true)).status, 401);
  assert.equal((await rpc(scopedKey, 'ping', {}, true)).status, 200);
} finally {
  await new Promise((resolve) => server.close(resolve));
}
console.log(
  'PASS: MCP links (create/list/revoke, hashed secrets, page scope), protocol handshake, all page tools, validation errors, page create/delete with link cleanup.',
);
