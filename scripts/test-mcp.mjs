import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, stat, readFile, readdir } from 'node:fs/promises';
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
  assert.match(
    init.instructions,
    /get_loading_animation and update_loading_animation/,
  );
  assert.match(init.instructions, /Do not hotlink third-party image URLs/);
  assert.match(init.instructions, /Keep newly added images local to Studio/);
  assert.match(init.instructions, /ENTIRE page/);
  assert.match(init.instructions, /overlapping steps/);
  assert.match(init.instructions, /partial check/);
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
  assert.equal(overview.projectTemplate.appearance.id, 'regelerate');
  const templateInfo = await call(key, 'get_project_template', {});
  assert.equal(templateInfo.contentTemplate.id, 'regelerate');
  assert.equal(templateInfo.appearance.id, 'regelerate');
  assert.equal(templateInfo.appearanceChanged, false);
  assert.ok(!Object.hasOwn(templateInfo, 'css'));
  const inspectionTool = (await rpc(key, 'tools/list', {})).tools.find(
    (t) => t.name === 'get_project_template',
  );
  assert.equal(inspectionTool.annotations.readOnlyHint, true);
  await rejects(
    call(key, 'get_project_template', { projectId: 'another-project' }),
    /determined by this MCP link/,
  );
  await rejects(
    call(key, 'get_project_template', { includeStyles: 'yes' }),
    /boolean/,
  );
  // A switched appearance must be reported accurately, without replacing the
  // content template or mutating any saved values/versions during inspection.
  const appearancePreview = await (
    await api('/api/template-change', {
      action: 'preview',
      id: project,
      templateId: 'luca',
    })
  ).json();
  const appearanceApplied = await (
    await api('/api/template-change', {
      action: 'apply',
      id: project,
      token: appearancePreview.token,
    })
  ).json();
  const beforeRead = (await (await api('/api/content', null, project)).json())
    .rows;
  const switched = await call(key, 'get_project_template', {
    includeStyles: true,
  });
  assert.deepEqual(switched.contentTemplate, templateInfo.contentTemplate);
  assert.equal(switched.appearance.id, 'luca');
  assert.equal(switched.appearance.name, 'Luca');
  assert.equal(switched.appearanceChanged, true);
  assert.match(switched.css, /luca-footer-brand/);
  assert.ok(switched.css.includes('data-template-theme="regelerate"'));
  assert.ok(!switched.css.includes('data-template-theme="luca"'));
  assert.equal(
    (await call(key, 'get_site_overview', {})).projectTemplate.appearance.id,
    'luca',
  );
  const switchedStyles = await call(key, 'get_page_styles', {
    page: 'home',
    includeShared: false,
  });
  assert.equal(switchedStyles.projectTemplate.appearance.id, 'luca');
  assert.equal(switchedStyles.stylesheets[0].css, switched.css);
  assert.deepEqual(
    (await (await api('/api/content', null, project)).json()).rows,
    beforeRead,
  );
  await api('/api/template-change', {
    action: 'rollback',
    id: project,
    changeId: appearanceApplied.rollback.id,
    version: appearanceApplied.version,
  });
  assert.equal(
    (await call(key, 'get_project_template', {})).appearance.id,
    'regelerate',
  );
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

  // Standard MCP can configure the exported entrance animation without source access.
  const headerBefore = (
    await (await api('/api/content', null, project)).json()
  ).rows.find((r) => r.id === 'site:header');
  const loadingBefore = await call(key, 'get_loading_animation', {});
  assert.equal(loadingBefore.canEdit, true);
  assert.equal(loadingBefore.settings.frequency, 'session');
  await rejects(
    call(key, 'update_loading_animation', { settings: { enabled: true } }),
    /ifVersion/,
  );
  const loadingSaved = await call(key, 'update_loading_animation', {
    ifVersion: loadingBefore.version,
    settings: {
      enabled: true,
      frequency: 'first',
      animation: 'custom',
      customCss: '',
      image: '/templates/notebook-purple/favicon.svg',
      duration: 3400,
      timeout: 5000,
    },
  });
  assert.equal(loadingSaved.settings.duration, 3400);
  assert.equal(loadingSaved.settings.frequency, 'first');
  assert.ok(loadingSaved.version > loadingBefore.version);
  assert.deepEqual(
    (await call(key, 'get_site_overview', {})).loadingAnimation.settings,
    loadingSaved.settings,
  );
  const headerAfter = (
    await (await api('/api/content', null, project)).json()
  ).rows.find((r) => r.id === 'site:header');
  const { loading: _oldLoading, ...otherBefore } = JSON.parse(
    headerBefore?.value || '{}',
  );
  const { loading: _newLoading, ...otherAfter } = JSON.parse(headerAfter.value);
  assert.deepEqual(
    otherAfter,
    otherBefore,
    'loading update preserves every other header field',
  );
  await rejects(
    call(key, 'update_loading_animation', {
      ifVersion: loadingBefore.version,
      settings: { enabled: false },
    }),
    /Conflict/,
  );
  for (const settings of [
    { nope: true },
    { duration: 5001 },
    { timeout: 1000 },
    { frequency: 'once' },
    { image: 'javascript:alert(1)' },
    { customCss: '@import "bad";' },
    { enabled: 'true' },
    {},
  ]) {
    await rejects(
      call(key, 'update_loading_animation', {
        ifVersion: loadingSaved.version,
        settings,
      }),
      /Invalid|non-empty/,
    );
  }
  assert.equal(
    (await call(key, 'get_loading_animation', {})).version,
    loadingSaved.version,
  );
  // An editor changing unrelated header settings invalidates the MCP read as well.
  assert.equal(
    (
      await api(
        '/api/content',
        {
          id: 'site:header',
          version: headerAfter.version,
          value: JSON.stringify({
            ...JSON.parse(headerAfter.value),
            name: 'New team name',
          }),
        },
        project,
      )
    ).status,
    200,
  );
  await rejects(
    call(key, 'update_loading_animation', {
      ifVersion: loadingSaved.version,
      settings: { message: 'Hello' },
    }),
    /Conflict/,
  );
  const loadingFresh = await call(key, 'get_loading_animation', {});
  const loadingPatched = await call(key, 'update_loading_animation', {
    ifVersion: loadingFresh.version,
    settings: { message: 'Hello' },
  });
  assert.equal(loadingPatched.settings.image, loadingSaved.settings.image);
  assert.equal(loadingPatched.settings.duration, 3400);
  const finalHeader = (
    await (await api('/api/content', null, project)).json()
  ).rows.find((r) => r.id === 'site:header');
  assert.equal(JSON.parse(finalHeader.value).name, 'New team name');
  console.log(
    'PASS: standard MCP loading settings, first-visit timing, partial patches, header preservation and concurrent-edit conflicts.',
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
  assert.equal(
    tools.find((t) => t.name === 'get_loading_animation').annotations
      .readOnlyHint,
    true,
  );
  assert.deepEqual(
    tools.find((t) => t.name === 'update_loading_animation').inputSchema
      .required,
    ['settings', 'ifVersion'],
  );
  for (const name of [
    'upload_media',
    'start_media_upload',
    'upload_media_chunk',
    'get_media_upload',
    'cancel_media_upload',
    'get_media_upload_url',
    'list_pages',
    'search_project',
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
  assert.ok(home.linkTargets.length);
  assert.ok(
    home.linkTargets.every(
      (target) =>
        target.href === '/#' + target.anchor &&
        target.anchor.startsWith('section-'),
    ),
  );
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

  // Standard MCP can position HTML without rewriting code or changing flow/order.
  const { id: positionedHtml } = await call(key, 'add_section', {
    page: 'home',
    kind: 'html',
    heading: 'Position test',
    html: '<p>Keep this content</p>',
  });
  const beforeMove = await call(key, 'get_page', { page: 'home' });
  await call(key, 'move_section', {
    page: 'home',
    id: positionedHtml,
    offset: { x: -24, y: 48 },
  });
  const afterMove = await call(key, 'get_page', { page: 'home' });
  assert.deepEqual(
    afterMove.sections.map((n) => n.id),
    beforeMove.sections.map((n) => n.id),
  );
  assert.deepEqual(
    afterMove.sections.find((n) => n.id === positionedHtml),
    beforeMove.sections.find((n) => n.id === positionedHtml),
  );
  assert.match(afterMove.customCss, /translate: -24px 48px/);
  assert.ok(
    afterMove.customCss.includes(`[data-layer-id="${positionedHtml}"]`),
  );
  await call(key, 'move_section', {
    page: 'home',
    id: positionedHtml,
    offset: { x: 0, y: 12 },
    scope: 'mobile',
  });
  assert.match(
    (await call(key, 'get_page', { page: 'home' })).customCss,
    /translate: 0px 12px/,
  );
  await rejects(
    call(key, 'move_section', {
      page: 'home',
      id: positionedHtml,
      offset: { x: '24', y: 0 },
    }),
    /finite/,
  );
  await rejects(
    call(key, 'update_section', {
      page: 'home',
      id: positionedHtml,
      changes: { x: 24 },
    }),
    /move_section/,
  );
  await call(key, 'move_section', {
    page: 'home',
    id: positionedHtml,
    offset: { x: 0, y: 0 },
  });
  assert.match(
    (await call(key, 'get_page', { page: 'home' })).customCss,
    /translate: 0px 0px/,
  );
  await call(key, 'delete_section', { page: 'home', id: positionedHtml });

  await call(key, 'style_element', {
    page: 'home',
    selector: h1.selector,
    styles: { width: '400px', 'max-width': '100%', 'box-sizing': 'border-box' },
  });
  const resizedText = (await call(key, 'get_page', { page: 'home' })).customCss;
  assert.match(resizedText, /width: 400px/);
  assert.match(resizedText, /max-width: 100%/);

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
  assert.ok(faqNode.items.every((i) => i.id.startsWith('item-')));
  assert.equal(faqNode.selectors.items.length, 2);
  assert.equal(
    faqNode.selectors.items[1].summary,
    `[data-layer-id="${faq}"] > div:nth-of-type(1) > div:nth-of-type(1) > details:nth-of-type(2) > summary:nth-of-type(1)`,
  );
  const { id: faqImage } = await call(key, 'add_section', {
    page: 'home',
    heading: 'Subsection image',
    kind: 'image',
    src: 'https://example.org/photo.png',
    inside: faq,
    insideItem: faqNode.items[0].id,
  });
  const faqImageNode = (
    await call(key, 'get_page', { page: 'home' })
  ).sections.find((s) => s.id === faqImage);
  assert.equal(faqImageNode.parentId, faq);
  assert.equal(faqImageNode.parentItemId, faqNode.items[0].id);
  await rejects(
    call(key, 'add_section', {
      page: 'home',
      heading: 'Bad target',
      kind: 'image',
      inside: faq,
    }),
    /insideItem/,
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
  await call(key, 'update_section', {
    page: 'home',
    id: faq,
    changes: { items: [faqSecond] },
  });
  assert.ok(
    !(await call(key, 'get_page', { page: 'home' })).sections.some(
      (s) => s.id === faqImage,
    ),
    'Deleting a subsection deletes its nested media',
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

  // MCP and manual insertion share the same non-destructive placement rules.
  const { id: insertionFrame } = await call(key, 'add_section', {
    page: 'home',
    kind: 'section',
    heading: 'Insertion regression',
  });
  const { id: childA } = await call(key, 'add_section', {
    page: 'home',
    kind: 'text',
    heading: 'First child',
    inside: insertionFrame,
  });
  const { id: childB } = await call(key, 'add_section', {
    page: 'home',
    kind: 'text',
    heading: 'Second child',
    inside: insertionFrame,
  });
  const readSavedHome = async () => {
    const { rows } = await (await api('/api/content', null, project)).json();
    return JSON.parse(rows.find((r) => r.id === 'layout:home').value);
  };
  const beforeInsert = await readSavedHome();
  const { id: childBetween } = await call(key, 'add_section', {
    page: 'home',
    kind: 'image',
    inside: insertionFrame,
    after: childA,
  });
  const afterInsert = await readSavedHome();
  assert.deepEqual(
    afterInsert.nodes.filter((n) => n.id !== childBetween),
    beforeInsert.nodes,
  );
  assert.deepEqual(
    afterInsert.order.filter((id) => id !== childBetween),
    beforeInsert.order,
  );
  assert.equal(
    afterInsert.order.indexOf(childBetween),
    afterInsert.order.indexOf(childA) + 1,
  );
  assert.ok(
    afterInsert.order.indexOf(childBetween) < afterInsert.order.indexOf(childB),
  );
  await call(key, 'update_section', {
    page: 'home',
    id: insertionFrame,
    changes: { layoutMode: 'free' },
  });
  await call(key, 'update_section', {
    page: 'home',
    id: childA,
    changes: { minHeight: 1100 },
  });
  const beforeFreeInsert = await readSavedHome();
  const { id: freeChild } = await call(key, 'add_section', {
    page: 'home',
    kind: 'pdf',
    inside: insertionFrame,
  });
  const afterFreeInsert = await readSavedHome();
  assert.deepEqual(
    afterFreeInsert.nodes.filter((n) => n.id !== freeChild),
    beforeFreeInsert.nodes,
  );
  assert.equal(afterFreeInsert.nodes.find((n) => n.id === freeChild).y, 1144);
  assert.equal(
    afterFreeInsert.nodes.find((n) => n.id === freeChild).freeHeight,
    600,
  );
  await call(key, 'delete_section', { page: 'home', id: insertionFrame });

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
    css: `[data-layer-id="${added}"] h2 { color: #123456; } @media (max-width: 760px) { h2 {font-size:3vw} }`,
  });
  const beforeStyles = (await (await api('/api/content', null, project)).json())
    .rows;
  const styledPage = await call(key, 'get_page', {
    page: 'home',
    includeStyles: true,
  });
  const styleRead = await call(key, 'get_page_styles', { page: 'home' });
  assert.deepEqual(styledPage.styles, styleRead);
  assert.equal(styleRead.version, styledPage.version);
  assert.equal(styleRead.customCss, styledPage.customCss);
  assert.deepEqual(styleRead.warnings, []);
  assert.equal(styleRead.stylesheets[0].kind, 'shared');
  assert.equal(
    styleRead.stylesheets[0].css,
    await readFile(
      path.join('selfhost-dist/client', styleRead.stylesheets[0].href.slice(1)),
      'utf8',
    ),
  );
  assert.equal(styleRead.stylesheets.at(-2).kind, 'template');
  assert.equal(styleRead.stylesheets.at(-1).kind, 'page');
  assert.match(styleRead.stylesheets.at(-1).css, /\[data-page-css="home"\]/);
  assert.match(styleRead.stylesheets.at(-1).css, /3vw/);
  assert.equal(styleRead.sections.find((n) => n.id === added).settings.span, 8);
  const editorStyles = await call(key, 'get_page_styles', {
    page: 'home',
    view: 'editor',
    includeShared: false,
  });
  assert.equal(editorStyles.stylesheets.length, 2);
  assert.match(editorStyles.stylesheets.at(-1).css, /@container studioPage/);
  assert.match(editorStyles.stylesheets.at(-1).css, /3cqw/);
  assert.deepEqual(
    (await (await api('/api/content', null, project)).json()).rows,
    beforeStyles,
  );
  assert.equal(
    (await rpc(key, 'tools/list', {})).tools.find(
      (t) => t.name === 'get_page_styles',
    ).annotations.readOnlyHint,
    true,
  );
  await rejects(
    call(key, 'get_page_styles', { page: 'home', path: '../../secret' }),
    /optional boolean/,
  );
  await rejects(
    call(key, 'get_page_styles', { page: 'home', view: 'invalid' }),
    /preview/,
  );
  await rejects(
    call(key, 'get_page_styles', { page: 'missing-page' }),
    /does not exist/,
  );
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
  assert.equal(
    (await call(scopedKey, 'get_loading_animation', {})).canEdit,
    false,
  );
  await rejects(
    call(scopedKey, 'update_loading_animation', {
      ifVersion: loadingPatched.version,
      settings: { enabled: false },
    }),
    /whole-project/,
  );
  assert.equal(
    (await call(scopedKey, 'get_project_template', {})).appearance.id,
    'regelerate',
  );
  assert.deepEqual(
    (await call(scopedKey, 'list_pages', {})).pages.map((p) => p.slug),
    ['home'],
  );
  const other = pages.find((p) => p.slug !== 'home').slug;
  assert.equal(
    (
      await call(scopedKey, 'get_page_styles', {
        page: 'home',
        includeShared: false,
      })
    ).page,
    'home',
  );
  await rejects(
    call(scopedKey, 'get_page_styles', { page: other }),
    /can only edit/,
  );
  await rejects(
    call(scopedKey, 'get_page', { page: other, includeStyles: true }),
    /can only edit/,
  );
  await rejects(call(scopedKey, 'get_page', { page: other }), /can only edit/);
  await rejects(
    call(scopedKey, 'set_page_sidebar', {
      page: other,
      enabled: true,
      ifVersion: 1,
    }),
    /can only edit/,
  );
  await rejects(
    call(scopedKey, 'create_page', { title: 'X', slug: 'x-page' }),
    /limited to one page/,
  );

  // Media is received through MCP, uses normal media URLs, and can be inserted.
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXs8AAAAASUVORK5CYII=',
    'base64',
  );
  const uploaded = await call(scopedKey, 'upload_media', {
    page: 'home',
    name: 'figure.png',
    base64: png.toString('base64'),
  });
  assert.equal(uploaded.complete, true);
  assert.equal(uploaded.kind, 'image');
  assert.match(uploaded.url, /^\/api\/media\/[a-f0-9-]+\.png$/);
  assert.deepEqual(
    await readFile(path.join(dataDir, 'media', uploaded.url.split('/').pop())),
    png,
  );
  const imageSection = await call(scopedKey, 'add_section', {
    page: 'home',
    kind: 'image',
    heading: 'Uploaded figure',
    src: uploaded.url,
    alt: 'A test figure',
  });
  assert.equal(
    (await call(scopedKey, 'get_page', { page: 'home' })).sections.find(
      (n) => n.id === imageSection.id,
    ).src,
    uploaded.url,
  );
  await rejects(
    call(scopedKey, 'upload_media', {
      page: other,
      name: 'figure.png',
      base64: png.toString('base64'),
    }),
    /can only edit/,
  );
  await rejects(
    call(scopedKey, 'upload_media', {
      page: 'home',
      name: 'figure.png',
      base64: Buffer.from('This is not an image file').toString('base64'),
    }),
    /contents do not match/,
  );
  await rejects(
    call(scopedKey, 'upload_media', {
      page: 'home',
      name: 'figure.png',
      base64: 'not base64',
    }),
    /base64/,
  );
  await rejects(
    call(scopedKey, 'start_media_upload', {
      page: 'home',
      name: '../figure.png',
      size: 100,
    }),
    /filename/,
  );
  await rejects(
    call(scopedKey, 'start_media_upload', {
      page: 'home',
      name: 'script.html',
      size: 100,
    }),
    /Unsupported/,
  );
  await rejects(
    call(scopedKey, 'start_media_upload', {
      page: 'home',
      name: 'huge.pdf',
      size: 26 * 1024 * 1024,
    }),
    /25 MiB/,
  );
  await rejects(
    call(scopedKey, 'get_media_upload_url', {
      page: 'home',
      name: 'figure.png',
      size: png.length,
    }),
    /not configured/,
  );
  const bytes = Buffer.alloc(700000, 65);
  Buffer.from('%PDF-1.7\n').copy(bytes);
  const transfer = await call(scopedKey, 'start_media_upload', {
    page: 'home',
    name: 'notebook.pdf',
    size: bytes.length,
  });
  const first = bytes.subarray(0, transfer.chunkBytes).toString('base64');
  const args = {
    page: 'home',
    uploadId: transfer.uploadId,
    offset: 0,
    base64: first,
  };
  const part = await call(scopedKey, 'upload_media_chunk', args);
  assert.equal(part.complete, false);
  assert.equal(part.nextOffset, transfer.chunkBytes);
  assert.deepEqual(await call(scopedKey, 'upload_media_chunk', args), part);
  assert.equal(
    (
      await call(scopedKey, 'get_media_upload', {
        page: 'home',
        uploadId: transfer.uploadId,
      })
    ).nextOffset,
    transfer.chunkBytes,
  );
  await rejects(
    call(key, 'get_media_upload', {
      page: 'home',
      uploadId: transfer.uploadId,
    }),
    /not found/,
  );
  await rejects(
    call(scopedKey, 'upload_media_chunk', {
      ...args,
      offset: transfer.chunkBytes + 1,
      base64: 'QUFBQQ==',
    }),
    /out of order/,
  );
  const last = {
    ...args,
    offset: transfer.chunkBytes,
    base64: bytes.subarray(transfer.chunkBytes).toString('base64'),
  };
  const complete = await call(scopedKey, 'upload_media_chunk', last);
  assert.equal(complete.kind, 'pdf');
  assert.equal(complete.complete, true);
  assert.deepEqual(await call(scopedKey, 'upload_media_chunk', last), complete);
  assert.deepEqual(
    await readFile(path.join(dataDir, 'media', complete.url.split('/').pop())),
    bytes,
  );
  await rejects(
    call(scopedKey, 'cancel_media_upload', {
      page: 'home',
      uploadId: transfer.uploadId,
    }),
    /complete/,
  );
  const unfinished = await call(scopedKey, 'start_media_upload', {
    page: 'home',
    name: 'unfinished.pdf',
    size: 100,
  });
  await call(scopedKey, 'upload_media_chunk', {
    page: 'home',
    uploadId: unfinished.uploadId,
    offset: 0,
    base64: bytes.subarray(0, 32).toString('base64'),
  });
  await call(scopedKey, 'cancel_media_upload', {
    page: 'home',
    uploadId: unfinished.uploadId,
  });
  assert.equal((await readdir(path.join(dataDir, 'mcp-uploads'))).length, 0);
  await rejects(
    call(scopedKey, 'get_media_upload', {
      page: 'home',
      uploadId: unfinished.uploadId,
    }),
    /not found/,
  );
  // Batch calls are awaited in order, rather than serializing unresolved Promises.
  const batchResponse = await fetch(origin + '/mcp?key=' + scopedKey, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify([
      {
        jsonrpc: '2.0',
        id: 10001,
        method: 'tools/call',
        params: {
          name: 'upload_media',
          arguments: {
            page: 'home',
            name: 'batch.png',
            base64: png.toString('base64'),
          },
        },
      },
      { jsonrpc: '2.0', id: 10002, method: 'ping' },
    ]),
  });
  const batch = await batchResponse.json();
  assert.equal(JSON.parse(batch[0].result.content[0].text).complete, true);
  assert.equal(batch[1].id, 10002);

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
  assert.equal(preview.inspection.viewports.desktop.width, 1440);
  assert.equal(preview.inspection.viewports.mobile.width, 390);
  assert.ok(
    preview.inspection.checklist.some((step) => /real bottom/.test(step)),
  );
  assert.ok(
    preview.inspection.checklist.some((step) =>
      /nested scroll containers/.test(step),
    ),
  );
  assert.ok(
    preview.inspection.checklist.some((step) => /lazy images/.test(step)),
  );
  assert.ok(
    preview.inspection.checklist.some((step) => /normal motion/.test(step)),
  );
  assert.match(preview.inspection.completion, /full or partial coverage/);
  assert.match(preview.renderingScope, /overrides are not rendered/);
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
  const custom = await call(key, 'add_section', {
    page: 'many-sections',
    heading: 'Animation',
    kind: 'html',
    html: '<p>Custom animation</p>',
    css: 'p {color:blue}',
    javascript: 'document.body.dataset.ready="yes"',
  });
  await call(key, 'update_section', {
    page: 'many-sections',
    id: custom.id,
    changes: { javascript: 'document.body.dataset.ready="updated"' },
  });
  const savedCustom = JSON.parse(
    (await chromeRow('many-sections')).value,
  ).nodes.find((node) => node.id === custom.id);
  assert.equal(savedCustom.kind, 'html');
  const isolatedStyles = await call(key, 'get_page_styles', {
    page: 'many-sections',
    includeShared: false,
  });
  assert.equal(
    isolatedStyles.isolatedHtmlStyles.find((n) => n.id === custom.id).css,
    'p {color:blue}',
  );
  assert.equal(savedCustom.javascript, 'document.body.dataset.ready="updated"');
  await rejects(
    call(key, 'update_section', {
      page: 'many-sections',
      id: custom.id,
      changes: { html: { invalid: true } },
    }),
    /invalid|layout|value/i,
  );
  // Real UTF-8 file transport avoids regenerating large encoded component payloads.
  const codeTarget = {
    page: 'many-sections',
    id: custom.id,
    field: 'javascript',
  };
  const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
  const codeRead = () => call(key, 'get_section_code', codeTarget);
  const writeArgs = async () => {
    const read = await codeRead();
    return {
      ...codeTarget,
      ifVersion: read.version,
      ifHash: read.sha256,
      reviewedForUpload: true,
    };
  };
  const largeCode = '/*' + 'é'.repeat(65534) + '*/'; // Exactly 128 KiB, not 128K characters.
  assert.equal(Buffer.byteLength(largeCode), 131072);
  const issueCode = async (bytes, extra = {}) =>
    call(key, 'get_section_code_upload_url', {
      ...(await writeArgs()),
      size: Buffer.byteLength(bytes),
      sha256: digest(bytes),
      ...extra,
    });
  const postCode = (ticket, bytes) =>
    fetch(origin + new URL(ticket.url).pathname + new URL(ticket.url).search, {
      method: 'POST',
      headers: ticket.headers,
      body: bytes,
    });
  await rejects(
    issueCode(largeCode, { reviewedForUpload: false }),
    /temporary test|production artifact/i,
  );
  await rejects(issueCode(largeCode + 'x'), /128 KiB/);
  await rejects(call(scopedKey, 'get_section_code', codeTarget), /only edit/);
  await rejects(
    call(key, 'get_section_code', { ...codeTarget, field: 'body' }),
    /field must/,
  );
  const transferCode = await issueCode(largeCode);
  assert.ok(
    !transferCode.url.includes(key),
    'Scoped ticket must not expose the reusable MCP key',
  );
  const beforeUpload = await codeRead();
  const corrupt = await postCode(transferCode, 'x'.repeat(131072));
  assert.equal(corrupt.status, 400);
  assert.match((await corrupt.json()).error, /SHA-256/);
  assert.deepEqual(
    await codeRead(),
    beforeUpload,
    'Corrupt upload must preserve the original field and version',
  );
  const uploadedCode = await postCode(transferCode, largeCode);
  assert.equal(uploadedCode.status, 200, await uploadedCode.clone().text());
  const receipt = await uploadedCode.json();
  assert.equal(receipt.bytes, 131072);
  assert.equal(receipt.sha256, digest(largeCode));
  assert.equal((await codeRead()).content, largeCode);
  assert.equal(
    (await (await postCode(transferCode, largeCode)).json()).alreadyApplied,
    true,
  );
  assert.equal((await codeRead()).version, receipt.version);
  const metadata = await call(key, 'get_section_code', {
    ...codeTarget,
    includeContent: false,
  });
  assert.equal(metadata.content, undefined);
  assert.equal(metadata.bytes, 131072);
  await rejects(
    call(key, 'replace_section_text', {
      ...(await writeArgs()),
      find: 'é',
      replace: 'a',
    }),
    /exactly once/,
  );
  await rejects(
    call(key, 'replace_section_text', {
      ...(await writeArgs()),
      find: '/*',
      replace: '/*x',
    }),
    /128 KiB/,
  );
  const patched = await call(key, 'replace_section_text', {
    ...(await writeArgs()),
    find: '/*',
    replace: '//',
  });
  assert.equal(patched.bytes, 131072);
  assert.equal((await codeRead()).content, '//' + largeCode.slice(2));
  const staleTicket = await issueCode('console.log("reviewed")');
  await call(key, 'update_section', {
    page: 'many-sections',
    id: custom.id,
    changes: { name: 'Concurrent editor change' },
  });
  const stalePost = await postCode(staleTicket, 'console.log("reviewed")');
  assert.equal(stalePost.status, 409);
  assert.match((await stalePost.json()).error, /changed/);
  const invalidUtf8 = Buffer.from([0xff, 0xfe]);
  const utf8Ticket = await issueCode(invalidUtf8);
  assert.equal((await postCode(utf8Ticket, invalidUtf8)).status, 400);
  const lockTicket = await issueCode('void 0');
  // Lock via the actual editor API, not via a test-only MCP path.
  const lockRow = await chromeRow('many-sections');
  const codeLayout = JSON.parse(lockRow.value);
  codeLayout.nodes.find((n) => n.id === custom.id).locked = true;
  assert.equal(
    (
      await api(
        '/api/content',
        {
          id: lockRow.id,
          value: JSON.stringify(codeLayout),
          version: lockRow.version,
        },
        project,
      )
    ).status,
    200,
  );
  assert.equal((await postCode(lockTicket, 'void 0')).status, 423);
  // New larger layouts must also round-trip through the normal editor save.
  const updatedRow = await chromeRow('many-sections');
  const roundtrip = JSON.parse(updatedRow.value);
  assert.equal(
    roundtrip.nodes.find((n) => n.id === custom.id).html,
    savedCustom.html,
  );
  assert.equal(
    roundtrip.nodes.find((n) => n.id === custom.id).css,
    savedCustom.css,
  );
  assert.equal(
    roundtrip.nodes.find((n) => n.id === custom.id).javascript,
    '//' + largeCode.slice(2),
  );
  console.log(
    'PASS: 128 KiB component upload, exact UTF-8/checksum, scope, agent review, conflict/lock protection, unique patches and retry receipts.',
  );
  await call(key, 'delete_page', { slug: 'many-sections' });

  // Changing Blank's appearance to Luca must not prevent enabling its index.
  const blankProject = (
    await (
      await api('/api/projects', {
        action: 'create',
        name: 'Blank restyled with Luca',
        templateId: 'blank',
      })
    ).json()
  ).id;
  const blankLink = await (
    await api(
      '/api/mcp-links',
      { name: 'Blank index', days: 7, page: 'home' },
      blankProject,
    )
  ).json();
  const blankKey = new URL(blankLink.url).searchParams.get('key');
  const blankPreview = await (
    await api('/api/template-change', {
      action: 'preview',
      id: blankProject,
      templateId: 'luca',
    })
  ).json();
  assert.equal(
    (
      await api('/api/template-change', {
        action: 'apply',
        id: blankProject,
        token: blankPreview.token,
      })
    ).status,
    200,
  );
  await call(blankKey, 'add_section', {
    page: 'home',
    kind: 'text',
    heading: 'Existing results',
    body: 'Keep this scientific content.',
  });
  await call(blankKey, 'set_page_css', {
    page: 'home',
    css: 'h2 { color: #123456; }',
  });
  const blankInfo = await call(blankKey, 'get_project_template', {});
  assert.equal(blankInfo.contentTemplate.id, 'blank');
  assert.equal(blankInfo.appearance.id, 'luca');
  const blankRows = () =>
    api('/api/content', null, blankProject)
      .then((r) => r.json())
      .then((r) => r.rows);
  for (const enabled of [false, true]) {
    const before = await blankRows();
    const page = await call(blankKey, 'get_page', { page: 'home' });
    const changed = await call(blankKey, 'set_page_sidebar', {
      page: 'home',
      enabled,
      ifVersion: page.version,
    });
    const after = await blankRows();
    const previous = before.find((r) => r.id === 'layout:home');
    const current = after.find((r) => r.id === 'layout:home');
    assert.deepEqual(JSON.parse(current.value), {
      ...JSON.parse(previous.value),
      sidebar: enabled,
    });
    assert.deepEqual(
      after.filter((r) => r.id !== 'layout:home'),
      before.filter((r) => r.id !== 'layout:home'),
    );
    assert.equal(changed.version, current.version);
    assert.equal(
      (await call(blankKey, 'get_page', { page: 'home' })).sidebar,
      enabled,
    );
    await rejects(
      call(blankKey, 'set_page_sidebar', {
        page: 'home',
        enabled: !enabled,
        ifVersion: page.version,
      }),
      /Conflict/,
    );
    await call(blankKey, 'set_page_sidebar', {
      page: 'home',
      enabled,
      ifVersion: current.version,
    });
    assert.deepEqual(
      await blankRows(),
      after,
      'repeating the same setting does not create a version',
    );
  }
  const validVersion = (await call(blankKey, 'get_page', { page: 'home' }))
    .version;
  await rejects(
    call(blankKey, 'set_page_sidebar', {
      page: 'home',
      enabled: 'true',
      ifVersion: validVersion,
    }),
    /boolean/,
  );
  await rejects(
    call(blankKey, 'set_page_sidebar', { page: 'home', enabled: true }),
    /ifVersion/,
  );
  await rejects(
    call(blankKey, 'set_page_sidebar', {
      page: 'home',
      enabled: true,
      ifVersion: validVersion,
      templateId: 'luca',
    }),
    /Provide/,
  );
  assert.equal(
    (await call(blankKey, 'get_project_template', {})).contentTemplate.id,
    'blank',
  );

  // Source privileges need a fresh authenticated, user-confirmed project grant.
  {
    assert.ok(
      !(await rpc(key, 'tools/list', {})).tools.some(
        (t) => t.name === 'read_source_file',
      ),
    );
    assert.equal(
      (
        await api(
          '/api/mcp-links',
          { name: 'Dev', days: 1, mode: 'developer', confirmDeveloper: true },
          project,
        )
      ).status,
      403,
    );
    const grant = await (
      await api('/api/mcp-links', { action: 'prepare-developer' }, project)
    ).json();
    const devRequest = {
      name: 'Dev',
      days: 1,
      mode: 'developer',
      confirmDeveloper: true,
      confirmation: grant.confirmation,
    };
    assert.equal(
      (await api('/api/mcp-links', devRequest, project, bobJwt)).status,
      403,
    );
    assert.equal(
      (await api('/api/mcp-links', devRequest, blankProject)).status,
      403,
    );
    assert.equal(
      (await api('/api/mcp-links', { ...devRequest, page: 'home' }, project))
        .status,
      400,
    );
    const devResponse = await api('/api/mcp-links', devRequest, project);
    assert.equal(devResponse.status, 201);
    const dev = await devResponse.json();
    assert.equal(dev.link.mode, 'developer');
    assert.ok(dev.link.approvedAt);
    assert.equal(
      (await api('/api/mcp-links', devRequest, project)).status,
      403,
      'grant is single use',
    );
    const devKey = new URL(dev.url).searchParams.get('key');
    for (let attempt = 0; attempt < 2; attempt++) {
      const listing = await call(devKey, 'list_source_files', {});
      for (const filePath of [
        'app/[slug]/page.tsx',
        'app/site-header.tsx',
        'app/site-search.ts',
        '.gitlab-ci.yml',
      ]) {
        assert.ok(
          listing.files.some((file) => file.path === filePath),
          filePath,
        );
        const listedFile = await call(devKey, 'read_source_file', {
          path: filePath,
        });
        assert.equal(listedFile.exists, true);
      }
      assert.equal(
        listing.files.find((file) => file.path === 'app/[slug]/page.tsx')
          .editable,
        false,
      );
      assert.equal(
        listing.files.find((file) => file.path === 'app/site-header.tsx')
          .editable,
        true,
      );
    }
    const devInit = await rpc(devKey, 'initialize', {});
    assert.match(devInit.instructions, /Do not create or start a local proxy/);
    assert.match(devInit.instructions, /Do not hotlink third-party image URLs/);
    assert.match(devInit.instructions, /acquire_source_lock/);
    assert.ok(
      (await rpc(devKey, 'tools/list', {})).tools.some(
        (t) => t.name === 'write_source_file',
      ),
    );
    const source = await call(devKey, 'read_source_file', {
      path: 'app/page-index.css',
    });
    assert.equal(source.editable, true);
    const edit = {
      path: source.path,
      ifVersion: source.version,
      ifBaseHash: source.baseHash,
      content: '/* source workspace test */\n' + source.content,
    };
    await rejects(
      call(devKey, 'write_source_file', edit),
      /valid source-file lock/,
    );
    const lease = await call(devKey, 'acquire_source_lock', {
      path: source.path,
      editorName: 'Ada CSS task',
    });
    edit.lockToken = lease.lockToken;
    await rejects(
      call(devKey, 'acquire_source_lock', { path: source.path }),
      /already reserved/,
    );
    const status = await call(devKey, 'get_source_status', {
      path: source.path,
    });
    assert.equal(status.lock.owner.editorName, 'Ada CSS task');
    assert.equal(status.lock.owner.linkName, 'Dev');
    assert.ok(!JSON.stringify(status).includes(lease.lockToken));
    const otherGrant = await (
      await api(
        '/api/mcp-links',
        { action: 'prepare-developer' },
        project,
        bobJwt,
      )
    ).json();
    const otherDev = await (
      await api(
        '/api/mcp-links',
        {
          name: 'Bob dev',
          days: 1,
          mode: 'developer',
          confirmDeveloper: true,
          confirmation: otherGrant.confirmation,
        },
        project,
        bobJwt,
      )
    ).json();
    const otherKey = new URL(otherDev.url).searchParams.get('key');
    await rejects(
      call(otherKey, 'write_source_file', edit),
      /valid source-file lock/,
    );
    await rejects(
      call(otherKey, 'release_source_lock', {
        path: source.path,
        lockToken: lease.lockToken,
      }),
      /valid source-file lock/,
    );
    assert.equal(
      (await call(otherKey, 'get_source_status', { path: source.path })).lock
        .ownedByThisLink,
      false,
    );
    await call(devKey, 'renew_source_lock', {
      path: source.path,
      lockToken: lease.lockToken,
      ttlSeconds: 60,
    });
    const previewBefore = await (
      await api('/api/source-preview', null, project)
    ).json();
    assert.equal(previewBefore.files, undefined);
    const written = await call(devKey, 'write_source_file', edit);
    const previewResponse = await api(
      '/api/source-preview?files=1',
      null,
      project,
    );
    assert.equal(previewResponse.status, 200);
    const sourcePreview = await previewResponse.json();
    assert.notEqual(sourcePreview.revision, previewBefore.revision);
    assert.equal(sourcePreview.files[edit.path], edit.content);
    assert.ok(sourcePreview.files['server/source-preview-entry.tsx']);
    assert.ok(sourcePreview.compiler.dependencies.includes('react'));
    assert.equal(sourcePreview.files['server/app.mjs'], undefined);
    assert.equal(
      (await api('/api/source-preview?files=1', null, project, 'invalid'))
        .status,
      401,
    );
    assert.equal(
      (await api('/api/source-preview?files=1', null, 'missing-project'))
        .status,
      404,
    );
    assert.equal(
      (await api('/api/source-preview', { files: true }, project)).status,
      404,
    );
    await rejects(call(devKey, 'write_source_file', edit), /conflict/);
    await rejects(
      call(devKey, 'read_source_file', { path: '../mcp-link.key' }),
      /relative path/,
    );
    await rejects(
      call(devKey, 'write_source_file', { ...edit, path: 'package.json' }),
      /Only wiki/,
    );
    assert.equal(
      (await call(devKey, 'read_source_file', { path: edit.path })).version,
      written.version,
    );
    await rejects(
      call(otherKey, 'restore_source_file', {
        path: edit.path,
        ifVersion: written.version,
        ifBaseHash: written.baseHash,
        targetVersion: 0,
      }),
      /valid source-file lock/,
    );
    const restored = await call(devKey, 'restore_source_file', {
      path: edit.path,
      lockToken: lease.lockToken,
      ifVersion: written.version,
      ifBaseHash: written.baseHash,
      targetVersion: 0,
    });
    assert.equal(restored.modified, false);
    await api('/api/mcp-links', { action: 'revoke', id: dev.link.id }, project);
    assert.equal(
      (await call(otherKey, 'get_source_status', { path: source.path })).lock
        .status,
      'unlocked',
    );
    const bobLease = await call(otherKey, 'acquire_source_lock', {
      path: source.path,
    });
    await call(otherKey, 'release_source_lock', {
      path: source.path,
      lockToken: bobLease.lockToken,
    });
    assert.equal((await rpc(devKey, 'tools/list', {}, true)).status, 401);
  }

  // Standard links may add independent images to text and arrange overlap.
  const imageText = await call(key, 'add_section', {
    page: 'home',
    kind: 'text',
    heading: 'Image container',
    body: 'Retain this text.',
  });
  const imageA = await call(key, 'add_section', {
    page: 'home',
    kind: 'image',
    heading: 'First image',
    src: 'https://example.org/a.png',
    inside: imageText.id,
  });
  const imageB = await call(key, 'add_section', {
    page: 'home',
    kind: 'image',
    heading: 'Second image',
    src: 'https://example.org/b.png',
    inside: imageText.id,
  });
  await call(key, 'update_section', {
    page: 'home',
    id: imageA.id,
    changes: { zIndex: 4 },
  });
  await call(key, 'update_section', {
    page: 'home',
    id: imageB.id,
    changes: { zIndex: -1 },
  });
  const imagePage = await call(key, 'get_page', { page: 'home' });
  assert.equal(imagePage.sections.find((s) => s.id === imageA.id).zIndex, 4);
  assert.equal(
    imagePage.sections.find((s) => s.id === imageB.id).parentId,
    imageText.id,
  );
  const imageSelector = imagePage.sections.find((s) => s.id === imageA.id)
    .selectors.image;
  assert.match(imageSelector, /img:nth-of-type/);
  await call(key, 'style_element', {
    page: 'home',
    selector: imageSelector,
    styles: {
      width: '420px',
      'max-width': 'none',
      height: 'auto',
      'max-height': 'none',
    },
  });

  await rejects(
    call(key, 'update_section', {
      page: 'home',
      id: imageB.id,
      changes: { zIndex: 0.5 },
    }),
    /not valid/,
  );
  const revCode = await call(key, 'add_section', {
    page: 'home',
    heading: 'Revocation target',
    kind: 'html',
  });
  const revTarget = { page: 'home', id: revCode.id, field: 'javascript' };
  const revRead = await call(key, 'get_section_code', revTarget);
  const revTicket = await call(key, 'get_section_code_upload_url', {
    ...revTarget,
    ifVersion: revRead.version,
    ifHash: revRead.sha256,
    reviewedForUpload: true,
    size: 6,
    sha256: digest('void 0'),
  });
  const revokedUpload = await call(key, 'start_media_upload', {
    page: 'home',
    name: 'revoked.png',
    size: 100,
  });
  await api(
    '/api/mcp-links',
    { action: 'revoke', id: created.link.id },
    project,
  );
  assert.equal((await rpc(key, 'ping', {}, true)).status, 401);
  assert.equal((await postCode(revTicket, 'void 0')).status, 401);
  assert.equal(
    (
      await rpc(
        key,
        'tools/call',
        {
          name: 'upload_media_chunk',
          arguments: {
            page: 'home',
            uploadId: revokedUpload.uploadId,
            offset: 0,
            base64: png.toString('base64'),
          },
        },
        true,
      )
    ).status,
    401,
  );
  assert.equal((await rpc(scopedKey, 'ping', {}, true)).status, 200);
} finally {
  await new Promise((resolve) => server.close(resolve));
}
console.log(
  'PASS: MCP links (create/list/revoke, hashed secrets, page scope), protocol handshake, all page tools, media uploads and insertion, invalid bytes, chunk retries/cancellation/scope, awaited batch calls, validation errors, page create/delete with link cleanup.',
);
