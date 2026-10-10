// Model Context Protocol endpoint (Streamable HTTP, JSON responses) so an
// external AI can edit a project through a revocable share link. Every edit
// uses the same validation and optimistic versioning as the Studio editor,
// and open editors receive it immediately through the live channel.
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
} from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { allowedPageField } from './ai-page.mjs';
import {
  cssError,
  emptyLayout,
  materialize,
  moveBefore,
  newNode,
  nodeLocked,
  parseCustomPages,
  parseMenu,
  resolveMenu,
  validMenu,
  movePage,
  newGroupId,
  SITE_MENU,
  patchNodes,
  removeNodes,
  pageLayers,
  outlineLayer,
  customSelectors,
  applySelectionStyle,
} from './shared.mjs';

const protocols = ['2025-06-18', '2025-03-26', '2024-11-05'];
const hash = (token) => createHash('sha256').update(token).digest('hex');
const slugPattern = /^[a-z0-9][a-z0-9-]{0,59}$/;
const mediaKinds = ['image', 'video', 'audio', 'pdf', 'model', 'embed'];
const editableKeys = new Set([
  'title',
  'body',
  'name',
  'hidden',
  'indexLabel',
  'indexHidden',
  'headingLevel',
  'span',
  'tabletSpan',
  'mobileSpan',
  'align',
  'background',
  'textColor',
  'borderColor',
  'borderWidth',
  'radius',
  'opacity',
  'shadow',
  'padding',
  'paddingX',
  'paddingY',
  'marginTop',
  'marginBottom',
  'minHeight',
  'fontFamily',
  'fontSize',
  'headingSize',
  'fontWeight',
  'lineHeight',
  'letterSpacing',
  'src',
  'alt',
  'caption',
  'objectFit',
  'linkTo',
  'linkLabel',
  'layoutMode',
  'items',
  'references',
]);
// Collapsible sections from an AI: keep known ids, give new sections one.
function accordionItems(items) {
  if (!Array.isArray(items))
    throw Object.assign(
      Error('`items` must be a list of { title, body, open? }.'),
      { status: 400 },
    );
  return items.map((item) => ({
    id:
      typeof item?.id === 'string' && /^[a-zA-Z0-9-]{1,40}$/.test(item.id)
        ? item.id
        : 'item-' + randomUUID().slice(0, 8),
    title: String(item?.title ?? '').slice(0, 200),
    body: String(item?.body ?? '').slice(0, 5000),
    ...(item?.open === true ? { open: true } : {}),
  }));
}
const days = [1, 7, 30];

// What each iGEM wiki page usually contains, so an AI can act without a
// long briefing. Teams should still follow the current iGEM requirements.
const pageGuide = {
  home: 'Landing page: a clear one-paragraph summary of the project, the problem it addresses, and signposts to the key pages.',
  description:
    'Project description: the problem and why it matters, background with references, the team’s idea and goals.',
  design:
    'Design: how the solution works — constructs, parts, circuits or chassis choices — and the reasoning behind each choice.',
  engineering:
    'Engineering: design–build–test–learn cycles, showing what was tried, what was learned and how the design changed.',
  results:
    'Results: experimental results with figures, data and interpretation, including negative or inconclusive results.',
  implementation:
    'Implementation: how the project would be used in the real world, by whom, and the practical, safety and regulatory challenges.',
  contribution:
    'Contribution: what future teams can reuse — characterised parts, data, tools, protocols or lessons.',
  experiments: 'Experiments: an overview of the experimental work and methods.',
  protocols: 'Protocols: step-by-step methods others could repeat.',
  parts:
    'Parts: the BioBricks/parts used or created, with Registry links and characterisation.',
  notebook: 'Notebook: dated lab notebook entries.',
  safety:
    'Safety: biosafety and biosecurity considerations, risk assessment and how risks were managed.',
  model:
    'Model: the modelling approach, assumptions, parameters, results and how the model informed the wet-lab design.',
  software:
    'Software: tools the team built, how to use them, and where the code lives.',
  'human-practices':
    'Human Practices: who the team spoke to (stakeholders, experts, public) and how that feedback shaped the project.',
  education:
    'Education: education and public engagement activities and their outcomes.',
  sustainability:
    'Sustainability: the project’s sustainable-development impact (for example, relevant UN SDGs).',
  members: 'Team members: people and roles.',
  attributions:
    'Attributions: who did what, including help from people outside the team.',
  sponsors: 'Sponsors: organisations that supported the team.',
};
const baseRules = `You are editing an iGEM team wiki through Prion Studio.
Start every task with get_site_overview: it gives the team's brief, your task, the menu and each page's purpose and status. Then get_page before changing a page.
Rules:
- get_page lists every template section's "elements": each element's role (heading level, paragraph, link, button, image…), its text, the fieldIds that hold that text, links and images, and an exact CSS selector. Sections the team added carry "selectors" too.
- Template sections (kind "template") keep their own text: change it with update_text using an element's fieldId. Add new content with add_section (subsection=true for an H3). Headings appear in the page's side index automatically.
- Collapsible sections (kind "accordion") hold an ordered list of items { id, title, body, open? }. Add them with add_section kind "accordion" and items; change them with update_section { items: [...] }, keeping existing ids. Each section's summary and text have selectors in get_page.
- To restyle one element use style_element with its selector; use set_page_css only for larger stylesheet changes, keeping the existing customCss.
- Deleting a template section hides it; deleting a custom section removes it. Sections locked in Studio cannot be changed.
- Edits save immediately and appear live to teammates, who may be editing too. Section edits only change the properties you send. update_text and set_page_css replace whole values: pass ifVersion from get_page.
- The header menu is edited with move_page_in_menu or set_menu. New pages are not in the menu until you place them.
- Keep scientific content accurate. Never invent results, data, names or citations; if information is missing, write a clear placeholder such as "[TODO: add growth curve data]" and say so in your reply.
- Use get_preview_url to look at a page if you have a browser tool.`;

export function createMcp({
  db,
  projects,
  projectContext,
  checkLayout,
  syncChrome,
  createCustomPage,
  deletePage,
  live,
  fail,
  readJSON,
  publicOrigin,
  clientDir,
  file,
  mediaReadURL,
  dataDir,
}) {
  db.exec(
    'CREATE TABLE IF NOT EXISTS mcp_links (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, page TEXT, name TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE, created_by TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, revoked_at INTEGER, last_used_at INTEGER)',
  );
  const columns = db.prepare('PRAGMA table_info(mcp_links)').all();
  for (const [column, type] of [
    ['task', 'TEXT'],
    ['token_enc', 'TEXT'],
    ['created_by_id', 'TEXT'],
  ])
    if (!columns.some((c) => c.name === column))
      db.exec(`ALTER TABLE mcp_links ADD COLUMN ${column} ${type}`);
  // Creators can copy their own link again, so its key is kept encrypted with
  // a server-only key file (a copied database alone does not reveal links).
  const keyFile = dataDir ? path.join(dataDir, 'mcp-link.key') : null;
  let secret = null;
  if (keyFile) {
    if (!existsSync(keyFile))
      writeFileSync(keyFile, randomBytes(32), { mode: 0o600 });
    secret = readFileSync(keyFile);
  }
  function seal(token) {
    if (!secret) return null;
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', secret, iv);
    const body = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64');
  }
  function unseal(sealed) {
    if (!secret || !sealed) return null;
    try {
      const raw = Buffer.from(sealed, 'base64');
      const decipher = createDecipheriv(
        'aes-256-gcm',
        secret,
        raw.subarray(0, 12),
      );
      decipher.setAuthTag(raw.subarray(12, 28));
      return Buffer.concat([
        decipher.update(raw.subarray(28)),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      return null;
    }
  }
  const owns = (row, user) =>
    row.created_by_id
      ? row.created_by_id === user.userId
      : row.created_by === user.displayName;
  const byHash = db.prepare(
    'SELECT * FROM mcp_links WHERE token_hash=? AND revoked_at IS NULL AND expires_at>?',
  );
  const touch = db.prepare('UPDATE mcp_links SET last_used_at=? WHERE id=?');
  const usage = new Map();
  function limited(id) {
    const now = Date.now(),
      window = usage.get(id);
    if (!window || now - window.start > 60000) {
      usage.set(id, { start: now, count: 1 });
      return false;
    }
    return ++window.count > 240;
  }

  const activeRows = (projectId) =>
    db
      .prepare(
        'SELECT * FROM mcp_links WHERE project_id=? AND revoked_at IS NULL AND expires_at>? ORDER BY created_at DESC',
      )
      .all(projectId, Date.now());
  const links = {
    // Everyone sees the team's links; only the creator can copy one again.
    list(projectId, user) {
      return activeRows(projectId).map((row) => ({
        id: row.id,
        page: row.page,
        name: row.name,
        createdBy: row.created_by,
        createdAt: row.created_at,
        expiresAt: row.expires_at,
        lastUsedAt: row.last_used_at,
        mine: owns(row, user),
        canCopy: owns(row, user) && Boolean(unseal(row.token_enc)),
      }));
    },
    reveal(projectId, user, id) {
      const row = activeRows(projectId).find((r) => r.id === String(id));
      if (!row) throw fail(404, 'This link has expired or was revoked.');
      if (!owns(row, user))
        throw fail(403, 'Only the person who created a link can copy it.');
      const token = unseal(row.token_enc);
      if (!token)
        throw fail(
          410,
          'This link was created before links could be copied again. Create a new one.',
        );
      return { url: publicOrigin + '/mcp?key=' + token };
    },
    create(projectId, user, body) {
      const name = typeof body?.name === 'string' ? body.name.trim() : '';
      if (!name || name.length > 60)
        throw fail(400, 'Give the link a name up to 60 characters.');
      const page = body.page ?? null;
      if (page !== null) {
        if (typeof page !== 'string' || !slugPattern.test(page))
          throw fail(400, 'Choose a valid page.');
        if (!pageList(projectContext(projectId)).some((p) => p.slug === page))
          throw fail(404, 'That page does not exist.');
      }
      const task =
        typeof body.task === 'string' && body.task.trim()
          ? body.task.trim()
          : null;
      if (task && task.length > 2000)
        throw fail(400, 'Keep the task under 2000 characters.');
      if (!days.includes(body.days))
        throw fail(400, 'Choose an expiry of 1, 7 or 30 days.');
      if (activeRows(projectId).length >= 20)
        throw fail(400, 'Revoke an existing AI link before creating another.');
      const token = randomBytes(32).toString('base64url'),
        now = Date.now();
      const link = {
        id: randomUUID(),
        page,
        name,
        task,
        createdBy: user.displayName,
        createdAt: now,
        expiresAt: now + body.days * 86400000,
        lastUsedAt: null,
      };
      db.prepare(
        'INSERT INTO mcp_links (id,project_id,page,name,token_hash,created_by,created_at,expires_at,task,token_enc,created_by_id) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
      ).run(
        link.id,
        projectId,
        page,
        name,
        hash(token),
        link.createdBy,
        now,
        link.expiresAt,
        task,
        seal(token),
        user.userId,
      );
      return {
        link: { ...link, mine: true, canCopy: Boolean(secret) },
        url: publicOrigin + '/mcp?key=' + token,
      };
    },
    revoke(projectId, id) {
      const result = db
        .prepare(
          'UPDATE mcp_links SET revoked_at=? WHERE id=? AND project_id=? AND revoked_at IS NULL',
        )
        .run(Date.now(), String(id), projectId);
      if (!result.changes) throw fail(404, 'This link was already revoked.');
    },
  };

  function pageList(project) {
    let custom = [];
    try {
      custom = parseCustomPages(project.registry());
    } catch {}
    return [
      { slug: 'home', title: 'Home', custom: false },
      ...project.corePages.map((p) => ({
        slug: p.slug,
        title: p.title,
        custom: false,
      })),
      ...custom.map((p) => ({ slug: p.slug, title: p.title, custom: true })),
    ].map((p) => ({
      ...p,
      title: project.select.get(p.slug + ':title')?.value || p.title,
    }));
  }
  // The project's content as the site sees it (defaults plus saved rows).
  function projectData(project) {
    const data = {};
    for (const [id, value] of Object.entries(project.defaults()))
      data[id] = { value: project.select.get(id)?.value ?? value };
    return data;
  }
  // Template layers exactly as the page renders them (menu, sidebar, team pages).
  const pageView = (project, page) => pageLayers(projectData(project), page);
  const templateLayers = (project, page) => pageView(project, page).layers;
  function fieldIds(ast, found = []) {
    if (ast && typeof ast === 'object') {
      if ('f' in ast) found.push(ast.f);
      else ast.c?.forEach((child) => fieldIds(child, found));
    }
    return found;
  }
  function fieldValue(project, id) {
    return project.select.get(id)?.value ?? project.defaults()[id] ?? '';
  }
  function readLayout(project, page) {
    const id = 'layout:' + page,
      row = project.select.get(id);
    const source =
      row?.value ?? project.defaults()[id] ?? JSON.stringify(emptyLayout);
    return {
      id,
      version: row?.version || 0,
      layout: materialize(
        JSON.parse(source),
        templateLayers(project, page).map(
          ({ id, label, defaults, linkPath }) => ({
            id,
            label,
            defaults,
            linkPath,
          }),
        ),
      ),
    };
  }

  // Read-only site data for the preview page, limited like the link itself.
  async function previewData(link) {
    const project = projectContext(link.project_id);
    const data = {};
    for (const [id, value] of Object.entries(project.defaults())) {
      if (
        link.page &&
        /^(layout|template|wiki):/.test(id) &&
        id !== 'layout:' + link.page &&
        !allowedPageField(link.page, id)
      )
        continue;
      const row = project.select.get(id);
      data[id] = {
        value: row?.value ?? value,
        version: row?.version || 0,
        author: '',
      };
    }
    // Uploaded media sits behind Access; swap in short-lived direct links.
    if (mediaReadURL) {
      const keys = new Set();
      for (const row of Object.values(data))
        for (const match of row.value.matchAll(
          /\/api\/media\/([a-f0-9-]{36}\.[a-z0-9]+)/g,
        ))
          keys.add(match[1]);
      const urls = new Map();
      for (const key of keys)
        try {
          urls.set(key, await mediaReadURL(key, { userId: 'ai-' + link.id }));
        } catch {}
      for (const row of Object.values(data))
        row.value = row.value.replace(
          /\/api\/media\/([a-f0-9-]{36}\.[a-z0-9]+)/g,
          (whole, key) =>
            urls.has(key) ? JSON.stringify(urls.get(key)).slice(1, -1) : whole,
        );
    }
    return data;
  }

  function session(link, token) {
    const project = projectContext(link.project_id);
    const author = link.name + ' (AI link)';
    const agentId = 'ai-' + link.id;
    function seen(page, layerId, label) {
      live.agent(project.id, {
        id: agentId,
        name: link.name + ' (AI)',
        page,
        layerId,
        label,
      });
    }
    function page(slug) {
      if (typeof slug !== 'string' || !slugPattern.test(slug))
        throw fail(400, 'Give a page slug from list_pages.');
      if (link.page && slug !== link.page)
        throw fail(403, `This link can only edit the "${link.page}" page.`);
      if (!pageList(project).some((p) => p.slug === slug))
        throw fail(404, `Page "${slug}" does not exist. Call list_pages.`);
      return slug;
    }
    function node(layout, id) {
      const found = layout.nodes.find((n) => n.id === id);
      if (!found)
        throw fail(404, `No section "${id}" on this page. Call get_page.`);
      return found;
    }
    // Read, change and save with the editor's optimistic versioning.
    function writeLayout(slug, change) {
      for (let attempt = 0; attempt < 4; attempt++) {
        const { id, version, layout } = readLayout(project, slug);
        const next = change(layout);
        try {
          checkLayout(project, next);
        } catch (error) {
          if (error.message !== 'Invalid layout') throw error;
          throw fail(
            400,
            'Those values are not valid. Colours must be #RRGGBB, numbers must be in range, media needs an https URL and embeds need a YouTube, Vimeo or iGEM video embed link.',
          );
        }
        const cssProblem = cssError(next.customCss || '');
        if (cssProblem) throw fail(400, cssProblem);
        const value = JSON.stringify(next);
        if (value === JSON.stringify(layout)) return next;
        if (JSON.stringify({ ...next, customCss: '' }).length > 200000)
          throw fail(400, 'The page is too large.');
        const result = version
          ? project.update.run(value, author, id, version)
          : project.insert.run(id, value, author);
        if (result.changes) {
          const synced = syncChrome(project, id, layout, next, author);
          live.changed(project.id, [id, ...synced], '');
          return next;
        }
      }
      throw fail(409, 'The page kept changing. Call get_page and retry.');
    }
    function topLevel(layout, id) {
      let current = layout.nodes.find((n) => n.id === id);
      // On team pages, sections are placed within the content column.
      while (current?.parentId && current.parentId !== 'custom-content')
        current = layout.nodes.find((n) => n.id === current.parentId);
      return current?.id;
    }
    function describe(project, slug, layout, version) {
      const { layers, context } = pageView(project, slug);
      return {
        page: slug,
        title: pageList(project).find((p) => p.slug === slug)?.title,
        version,
        width: layout.width,
        gap: layout.gap,
        customCss: layout.customCss || '',
        sections: layout.order.map((id) => {
          const n = layout.nodes.find((item) => item.id === id);
          if (n.kind !== 'template')
            return { ...n, selectors: customSelectors(n) };
          const { title: _title, body: _body, ...rest } = n;
          const layer = layers.find((l) => l.id === id);
          // What each element is, its editable text and its CSS selector.
          const elements = layer
            ? outlineLayer(
                layer,
                context,
                (fieldId) => fieldValue(project, fieldId),
                n,
              )
            : [];
          // Only text that is actually shown (a saved menu replaces the
          // template's own menu labels, for example).
          const shown = new Set(elements.flatMap((e) => e.fieldIds || []));
          return {
            ...rest,
            region: layer?.region,
            selector: `[data-layer-id="${id}"]`,
            elements,
            texts: fieldIds(layer?.ast)
              .filter((fieldId) => shown.has(fieldId))
              .map((fieldId) => ({
                fieldId,
                value: fieldValue(project, fieldId),
                version: project.select.get(fieldId)?.version || 0,
              })),
          };
        }),
      };
    }
    // Current content as the client sees it (defaults plus saved rows).
    function siteData() {
      const data = {};
      for (const [id, value] of Object.entries(project.defaults()))
        data[id] = { value: project.select.get(id)?.value ?? value };
      return data;
    }
    const projectName = () =>
      projects.list().projects.find((p) => p.id === link.project_id)?.name ||
      'this project';
    const brief = () => (project.select.get('ai:brief')?.value || '').trim();
    function pageStatus(slug) {
      const layout = readLayout(project, slug).layout;
      const fields = templateLayers(project, slug)
        .filter((l) => l.region === 'main')
        .flatMap((l) => fieldIds(l.ast));
      const defaults = project.defaults();
      const edited = fields.filter((id) => {
        const row = project.select.get(id);
        return row && row.value !== defaults[id];
      }).length;
      const custom = layout.nodes.filter((n) => n.kind !== 'template').length;
      return {
        // Template text never edited and nothing added: placeholder content.
        status:
          !edited && !custom
            ? 'untouched template content'
            : 'edited by the team',
        customSections: custom,
        templateTexts: fields.length,
        editedTemplateTexts: edited,
      };
    }
    function saveMenu(next, ifVersion) {
      if (!validMenu(next))
        throw fail(
          400,
          'Invalid menu: up to 12 groups with unique names (max 40 characters), each page at most once, and not "home".',
        );
      const row = project.select.get(SITE_MENU);
      if (ifVersion !== undefined && (row?.version || 0) !== ifVersion)
        throw fail(
          409,
          'Conflict: the menu changed. Call get_site_overview and retry.',
        );
      const value = JSON.stringify(next);
      const result = row
        ? project.update.run(value, author, SITE_MENU, row.version)
        : project.insert.run(SITE_MENU, value, author);
      if (!result.changes)
        throw fail(
          409,
          'Conflict: the menu changed. Call get_site_overview and retry.',
        );
      live.changed(project.id, [SITE_MENU], '');
    }
    const scopedOnly = () => {
      if (link.page)
        throw fail(
          403,
          'This link is limited to one page and cannot manage pages.',
        );
    };

    const tools = {
      get_site_overview: {
        description:
          'Call this first. Returns the project name, the team’s brief for AI assistants, your task, what you may edit, the header menu (groups of pages), every page with its purpose on an iGEM wiki and whether it still has untouched template content, and the recommended workflow.',
        inputSchema: { type: 'object', properties: {} },
        run() {
          const data = siteData();
          const { groups, unplaced } = resolveMenu(data);
          const menuRow = project.select.get(SITE_MENU);
          const menuGroup = new Map(
            groups.flatMap((g) => g.pages.map((p) => [p.slug, g.label])),
          );
          const pages = pageList(project).filter(
            (p) => !link.page || p.slug === link.page,
          );
          seen(link.page || 'home');
          return {
            project: projectName(),
            template: project.templateId || 'classic',
            teamBrief:
              brief() ||
              'No brief yet. Ask the user for the project facts you need (organism, goal, results, team) rather than guessing.',
            yourTask:
              link.task || 'No specific task: follow the user’s instructions.',
            scope: link.page
              ? `You may edit only the "${link.page}" page and cannot change the menu or pages.`
              : 'You may edit every page, the header menu, and add or delete pages.',
            menu: {
              version: menuRow?.version || 0,
              groups: groups.map((g) => ({
                group: g.label,
                pages: g.pages.map((p) => p.slug),
              })),
              notInMenu: unplaced.map((p) => p.slug),
            },
            pages: pages.map((p) => ({
              slug: p.slug,
              title: p.title,
              custom: p.custom,
              menuGroup:
                p.slug === 'home' ? '(home)' : menuGroup.get(p.slug) || null,
              purpose:
                pageGuide[p.slug] ||
                (p.custom ? 'A page the team created.' : 'A template page.'),
              ...pageStatus(p.slug),
            })),
            workflow: [
              'Read the brief and your task; ask the user if essential facts are missing.',
              'get_page for each page you will change.',
              'Replace template placeholder text with update_text; add new sections with add_section.',
              'Keep headings short and informative: they form the page index.',
              'Check the result with get_preview_url if you can open a browser.',
              'Summarise what you changed and any [TODO] placeholders left for the team.',
            ],
          };
        },
      },
      move_page_in_menu: {
        description:
          'Place a page in a header menu group (by group name; a new name creates the group) at an optional position (0 = first), or remove it from the menu with group null.',
        inputSchema: {
          type: 'object',
          properties: {
            slug: { type: 'string' },
            group: { type: ['string', 'null'] },
            position: { type: 'integer' },
          },
          required: ['slug', 'group'],
        },
        run({ slug, group, position }) {
          scopedOnly();
          if (
            slug === 'home' ||
            !pageList(project).some((p) => p.slug === slug)
          )
            throw fail(404, `Page "${slug}" cannot be placed in the menu.`);
          let menu = parseMenu(siteData()).menu;
          let target = null;
          if (group !== null && group !== undefined) {
            const label = String(group).trim().slice(0, 40);
            target = menu.groups.find(
              (g) => g.label.toLowerCase() === label.toLowerCase(),
            );
            if (!target) {
              target = { id: newGroupId(menu), label, pages: [] };
              menu = { groups: [...menu.groups, target] };
            }
          }
          saveMenu(
            movePage(menu, slug, target?.id ?? null, position ?? Infinity),
          );
          return { ok: true, slug, group: target?.label ?? null };
        },
      },
      set_menu: {
        description:
          'Replace the whole header menu: an ordered list of groups, each with a label and ordered page slugs. Pages left out are not in the menu. Pass ifVersion (menu.version from get_site_overview).',
        inputSchema: {
          type: 'object',
          properties: {
            groups: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  label: { type: 'string' },
                  pages: { type: 'array', items: { type: 'string' } },
                },
                required: ['label', 'pages'],
              },
            },
            ifVersion: { type: 'integer' },
          },
          required: ['groups'],
        },
        run({ groups, ifVersion }) {
          scopedOnly();
          if (!Array.isArray(groups))
            throw fail(400, '`groups` must be a list.');
          const known = new Set(pageList(project).map((p) => p.slug));
          const unknown = groups
            .flatMap((g) => g?.pages || [])
            .filter((slug) => !known.has(slug));
          if (unknown.length)
            throw fail(400, 'Unknown pages: ' + unknown.join(', '));
          saveMenu(
            {
              groups: groups.map((g, i) => ({
                id: 'group-' + (i + 1),
                label: String(g.label ?? '').trim(),
                pages: g.pages,
              })),
            },
            ifVersion,
          );
          return { ok: true };
        },
      },
      get_preview_url: {
        description:
          'Get a private, read-only URL that renders the saved page exactly as visitors see it. Open it with your own browser tool (for example Playwright or Chrome) to take a screenshot, then re-open it after edits. Use a 1440px wide viewport for desktop and 390px for mobile; emulate prefers-reduced-motion: reduce for clean full-page screenshots.',
        inputSchema: {
          type: 'object',
          properties: { page: { type: 'string', description: 'Page slug' } },
          required: ['page'],
        },
        run({ page: slug }) {
          slug = page(slug);
          return {
            url:
              publicOrigin +
              '/mcp/preview?page=' +
              encodeURIComponent(slug) +
              '&key=' +
              encodeURIComponent(token),
            note: "This server cannot take screenshots itself. Render the URL in your browser tool. The URL contains this link's secret key: do not share it.",
          };
        },
      },
      list_pages: {
        description:
          'List the pages of this wiki (slug and title). Page-limited links list only their page.',
        inputSchema: { type: 'object', properties: {} },
        run() {
          const pages = pageList(project).filter(
            (p) => !link.page || p.slug === link.page,
          );
          return { pages, scope: link.page ? 'page' : 'project' };
        },
      },
      get_page: {
        description:
          'Read a page: its sections in order (ids, kinds, headings, text, styles) and, for template sections, their editable text fields.',
        inputSchema: {
          type: 'object',
          properties: { page: { type: 'string', description: 'Page slug' } },
          required: ['page'],
        },
        run({ page: slug }) {
          slug = page(slug);
          const { layout, version } = readLayout(project, slug);
          seen(slug);
          return {
            purpose:
              pageGuide[slug] ||
              (pageList(project).find((p) => p.slug === slug)?.custom
                ? 'A page the team created.'
                : 'A template page.'),
            ...pageStatus(slug),
            ...describe(project, slug, layout, version),
          };
        },
      },
      update_text: {
        description:
          "Replace one text field of a template section (fieldId from get_page's texts). Plain text only.",
        inputSchema: {
          type: 'object',
          properties: {
            page: { type: 'string' },
            fieldId: { type: 'string' },
            value: { type: 'string' },
            ifVersion: {
              type: 'integer',
              description:
                "The text's version from get_page. If someone changed it since, nothing is written and you get a conflict.",
            },
          },
          required: ['page', 'fieldId', 'value'],
        },
        run({ page: slug, fieldId, value, ifVersion }) {
          slug = page(slug);
          if (
            typeof fieldId !== 'string' ||
            !allowedPageField(slug, fieldId) ||
            !Object.hasOwn(project.defaults(), fieldId)
          )
            throw fail(400, 'That text field does not belong to this page.');
          if (typeof value !== 'string' || value.length > 2000)
            throw fail(400, 'Text must be at most 2000 characters.');
          const layer = templateLayers(project, slug).find((l) =>
            fieldIds(l.ast).includes(fieldId),
          );
          const { layout } = readLayout(project, slug);
          if (layer && nodeLocked(layout, layer.id))
            throw fail(423, 'That section is locked in Studio.');
          for (let attempt = 0; attempt < 4; attempt++) {
            const row = project.select.get(fieldId);
            if (ifVersion !== undefined && (row?.version || 0) !== ifVersion)
              throw fail(
                409,
                'Conflict: this text changed since you read it. Call get_page, then retry with the new version.',
              );
            const result = row
              ? project.update.run(value, author, fieldId, row.version)
              : project.insert.run(fieldId, value, author);
            if (result.changes) {
              live.changed(project.id, [fieldId], '');
              seen(slug, layer?.id, layer?.label);
              return { ok: true, fieldId, value };
            }
          }
          throw fail(409, 'The text kept changing. Retry.');
        },
      },
      add_section: {
        description:
          'Add a section. Default is a heading + paragraph text block placed after `after` (a section id) or at the end. subsection=true makes an H3 subsection. Use kind image/video/embed/button with src or linkTo. Use kind equation with LaTeX math source in body (no document preamble). Use kind references with references [{id,text,url}] and cite using [@SECTION_ID/ENTRY_ID] in page text. Use kind "accordion" with `items` for collapsible sections (FAQ-style): readers can open several at once, and opening one never changes the address or scrolls the page.',
        inputSchema: {
          type: 'object',
          properties: {
            page: { type: 'string' },
            heading: { type: 'string' },
            body: { type: 'string' },
            kind: {
              type: 'string',
              enum: [
                'text',
                'image',
                'video',
                'audio',
                'pdf',
                'embed',
                'button',
                'section',
                'accordion',
                'equation',
                'references',
              ],
            },
            references: {
              type: 'array',
              description:
                'For references blocks: entries with stable id, text and optional https URL. Cite using [@SECTION_ID/ENTRY_ID] in page text.',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  text: { type: 'string' },
                  url: { type: 'string' },
                },
                required: ['id', 'text', 'url'],
              },
            },
            items: {
              type: 'array',
              description:
                'For kind "accordion": the collapsible sections in order. open=true shows one expanded when the page loads.',
              items: {
                type: 'object',
                properties: {
                  title: { type: 'string' },
                  body: { type: 'string' },
                  open: { type: 'boolean' },
                },
                required: ['title', 'body'],
              },
            },
            after: {
              type: 'string',
              description: 'Section id to insert after',
            },
            inside: {
              type: 'string',
              description: 'Frame (kind "section") id to place this inside',
            },
            subsection: { type: 'boolean' },
            src: { type: 'string', description: 'HTTPS media URL' },
            alt: { type: 'string' },
            caption: { type: 'string' },
            linkTo: { type: 'string' },
            linkLabel: { type: 'string' },
          },
          required: ['page', 'heading'],
        },
        run(input) {
          const slug = page(input.page);
          const kind = input.kind || 'text';
          if (
            ![
              'text',
              'button',
              'section',
              'accordion',
              'equation',
              'references',
              ...mediaKinds,
            ].includes(kind)
          )
            throw fail(400, 'Unsupported section kind.');
          const heading = String(input.heading ?? '').slice(0, 300);
          const id = randomUUID();
          let label = heading;
          writeLayout(slug, (layout) => {
            const n = {
              ...newNode(id, kind, heading),
              name: (heading || kind).slice(0, 100),
              padding: kind === 'section' ? 24 : 8,
              body: String(input.body ?? '').slice(0, 12000),
              ...(input.subsection ? { headingLevel: 3 } : {}),
              ...(input.src ? { src: String(input.src) } : {}),
              ...(input.alt ? { alt: String(input.alt).slice(0, 1000) } : {}),
              ...(input.caption
                ? { caption: String(input.caption).slice(0, 2000) }
                : {}),
              ...(input.linkTo ? { linkTo: String(input.linkTo) } : {}),
              ...(input.linkLabel
                ? { linkLabel: String(input.linkLabel).slice(0, 150) }
                : {}),
              ...(kind === 'section' ? { layoutMode: 'flow' } : {}),
              ...(kind === 'references'
                ? { references: input.references || [] }
                : {}),
              ...(kind === 'accordion'
                ? { items: accordionItems(input.items ?? []) }
                : {}),
            };
            const order = [...layout.order];
            if (input.inside) {
              const parent = node(layout, input.inside);
              if (!['section', 'template'].includes(parent.kind))
                throw fail(
                  400,
                  '`inside` must be a frame or template section.',
                );
              if (nodeLocked(layout, parent.id))
                throw fail(423, 'That section is locked in Studio.');
              n.parentId = parent.id;
              if (parent.layoutMode === 'free')
                Object.assign(n, {
                  x: 5,
                  y:
                    20 +
                    layout.nodes.filter((c) => c.parentId === parent.id)
                      .length *
                      24,
                  freeWidth: 60,
                  freeHeight: 120,
                });
              order.push(id);
            } else {
              if (layout.nodes.some((c) => c.id === 'custom-content'))
                n.parentId = 'custom-content';
              const anchor = input.after
                ? topLevel(layout, node(layout, input.after).id)
                : undefined;
              const index = anchor ? order.indexOf(anchor) + 1 : order.length;
              order.splice(index, 0, id);
            }
            label = n.name;
            return { ...layout, nodes: [...layout.nodes, n], order };
          });
          seen(slug, id, label);
          return { ok: true, id };
        },
      },
      update_section: {
        description:
          'Change properties of a section: title, body, items (the full list of collapsible sections for an accordion; keep each existing id to keep it stable), name, hidden, headingLevel (2 or 3), indexLabel, indexHidden, span (1-12), align, colours (#RRGGBB), spacing, font sizes, src/alt/caption, linkTo/linkLabel. Use null to clear a property.',
        inputSchema: {
          type: 'object',
          properties: {
            page: { type: 'string' },
            id: { type: 'string' },
            changes: { type: 'object' },
          },
          required: ['page', 'id', 'changes'],
        },
        run({ page: slug, id, changes }) {
          slug = page(slug);
          if (!changes || typeof changes !== 'object' || Array.isArray(changes))
            throw fail(400, '`changes` must be an object.');
          const bad = Object.keys(changes).filter((k) => !editableKeys.has(k));
          if (bad.length) throw fail(400, 'Cannot change: ' + bad.join(', '));
          let label = '';
          writeLayout(slug, (layout) => {
            const target = node(layout, id);
            if (nodeLocked(layout, id))
              throw fail(423, 'That section is locked in Studio.');
            if (
              target.kind === 'template' &&
              ('title' in changes || 'body' in changes)
            )
              throw fail(
                400,
                'Template section text is edited with update_text (see its texts in get_page).',
              );
            label = target.name || target.title || target.kind;
            const next = patchNodes(layout, [id], {});
            next.nodes = next.nodes.map((n) => {
              if (n.id !== id) return n;
              const copy = { ...n };
              for (const [key, value] of Object.entries(changes))
                if (key === 'items' && value !== null)
                  copy.items = accordionItems(value);
                else if (value === null && key === 'span') copy.span = 12;
                else if (value === null) delete copy[key];
                else copy[key] = value;
              return copy;
            });
            return next;
          });
          seen(slug, id, label);
          return { ok: true, id };
        },
      },
      move_section: {
        description:
          'Move a section to just after another section with the same parent, or to the top when `after` is omitted.',
        inputSchema: {
          type: 'object',
          properties: {
            page: { type: 'string' },
            id: { type: 'string' },
            after: { type: 'string' },
          },
          required: ['page', 'id'],
        },
        run({ page: slug, id, after }) {
          slug = page(slug);
          writeLayout(slug, (layout) => {
            const target = node(layout, id);
            if (nodeLocked(layout, id))
              throw fail(423, 'That section is locked in Studio.');
            const siblings = layout.order.filter(
              (other) =>
                other !== id &&
                layout.nodes.find((n) => n.id === other)?.parentId ===
                  target.parentId,
            );
            if (after && !siblings.includes(after))
              throw fail(
                400,
                '`after` must be a section with the same parent.',
              );
            const next = after
              ? siblings[siblings.indexOf(after) + 1]
              : siblings[0];
            return moveBefore(layout, [id], next ?? null);
          });
          seen(slug, id);
          return { ok: true, id };
        },
      },
      delete_section: {
        description:
          'Delete a custom section (and anything inside it). Template sections are hidden instead so they can be restored in Studio.',
        inputSchema: {
          type: 'object',
          properties: { page: { type: 'string' }, id: { type: 'string' } },
          required: ['page', 'id'],
        },
        run({ page: slug, id }) {
          slug = page(slug);
          writeLayout(slug, (layout) => {
            node(layout, id);
            const next = removeNodes(layout, [id]);
            if (JSON.stringify(next) === JSON.stringify(layout))
              throw fail(
                423,
                'That section (or something inside it) is locked.',
              );
            return next;
          });
          seen(slug);
          return { ok: true, id };
        },
      },
      style_element: {
        description:
          "Style one element without rewriting the page CSS. `selector` must come from get_page (an element's selector, a section's selector or selectors.heading/body). `styles` maps CSS properties to values; allowed properties: font-family, font-size, font-weight, font-style, color, text-align, line-height, letter-spacing, background-color, border-radius, padding, object-fit, display, rotate, translate. `scope` limits the change to tablet (≤1000px) or mobile (≤760px) screens.",
        inputSchema: {
          type: 'object',
          properties: {
            page: { type: 'string' },
            selector: { type: 'string' },
            styles: { type: 'object' },
            scope: { type: 'string', enum: ['all', 'tablet', 'mobile'] },
          },
          required: ['page', 'selector', 'styles'],
        },
        run({ page: slug, selector, styles, scope = 'all' }) {
          slug = page(slug);
          if (!styles || typeof styles !== 'object' || Array.isArray(styles))
            throw fail(400, '`styles` must map CSS properties to values.');
          const layerId = /^\[data-layer-id="([a-zA-Z0-9-]+)"\]/.exec(
            String(selector),
          )?.[1];
          writeLayout(slug, (layout) => {
            if (!layerId || !layout.nodes.some((n) => n.id === layerId))
              throw fail(
                400,
                'Use a selector from get_page for a section on this page.',
              );
            if (nodeLocked(layout, layerId))
              throw fail(423, 'That section is locked in Studio.');
            let css = layout.customCss || '';
            for (const [property, value] of Object.entries(styles))
              try {
                css = applySelectionStyle(
                  css,
                  String(selector),
                  property,
                  String(value),
                  scope,
                );
              } catch (error) {
                throw fail(400, `${property}: ${error.message}`);
              }
            return { ...layout, customCss: css };
          });
          seen(slug, layerId);
          return { ok: true, selector };
        },
      },
      set_page_css: {
        description:
          'Replace the page\'s custom CSS. Selectors are scoped to the page; target sections with [data-layer-id="<id>"].',
        inputSchema: {
          type: 'object',
          properties: {
            page: { type: 'string' },
            css: { type: 'string' },
            ifVersion: {
              type: 'integer',
              description:
                'The page version from get_page. If the page changed since, nothing is written and you get a conflict.',
            },
          },
          required: ['page', 'css'],
        },
        run({ page: slug, css, ifVersion }) {
          slug = page(slug);
          if (typeof css !== 'string') throw fail(400, '`css` must be text.');
          if (
            ifVersion !== undefined &&
            readLayout(project, slug).version !== ifVersion
          )
            throw fail(
              409,
              'Conflict: the page changed since you read it. Call get_page, merge your CSS with the current customCss, then retry.',
            );
          writeLayout(slug, (layout) => ({ ...layout, customCss: css }));
          seen(slug);
          return { ok: true };
        },
      },
      create_page: {
        description:
          'Create a new page with a title and a unique lowercase address (letters, numbers, hyphens). Give menuGroup (a group name) to add it to the header menu; otherwise it is not linked from the menu.',
        inputSchema: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            slug: { type: 'string' },
            menuGroup: { type: 'string' },
          },
          required: ['title', 'slug'],
        },
        run({ title, slug, menuGroup }) {
          scopedOnly();
          const result = createCustomPage(project, { title, slug }, author);
          live.changed(project.id, result.ids, '');
          if (menuGroup)
            tools.move_page_in_menu.run({ slug, group: menuGroup });
          seen(slug);
          return {
            ok: true,
            page: { slug: result.page.slug, title: result.page.title },
          };
        },
      },
      delete_page: {
        description:
          'Delete a page. Pages the team created are removed with their content; template pages are removed from this project (their edits are discarded, and a person can restore the original in Studio). The home page cannot be deleted. Links pointing to the page are removed.',
        inputSchema: {
          type: 'object',
          properties: { slug: { type: 'string' } },
          required: ['slug'],
        },
        run({ slug }) {
          scopedOnly();
          const result = deletePage(project, slug, author);
          live.changed(project.id, result.ids, '');
          return {
            ok: true,
            removedLinksIn: result.ids.filter((id) => id !== 'pages:custom'),
          };
        },
      },
    };
    const instructions = [
      baseRules,
      `Project: ${projectName()}.`,
      link.page
        ? `This link can edit only the "${link.page}" page.`
        : 'This link can edit every page and the menu.',
      brief() && 'Team brief for AI assistants:\n' + brief().slice(0, 4000),
      link.task && 'Your task:\n' + link.task,
    ]
      .filter(Boolean)
      .join('\n\n');
    const prompts = {
      improve_page: {
        description: 'Improve one wiki page using the team brief.',
        arguments: [
          {
            name: 'page',
            description: 'Page slug, e.g. description',
            required: true,
          },
          { name: 'goal', description: 'What to improve (optional)' },
        ],
        text: ({ page: slug = 'home', goal }) =>
          `Improve the "${slug}" page of our iGEM wiki. Call get_site_overview, then get_page for "${slug}". ${goal ? 'Goal: ' + goal + '. ' : ''}Replace template placeholder text with content that fits the page's purpose and our brief, keep headings short, and list any facts you still need as [TODO] notes.`,
      },
      write_from_notes: {
        description: 'Turn the team’s notes into a finished page section.',
        arguments: [
          { name: 'page', description: 'Page slug', required: true },
          {
            name: 'notes',
            description: 'Notes, results or bullet points',
            required: true,
          },
        ],
        text: ({ page: slug = 'home', notes = '' }) =>
          `Using only these notes, write clear wiki content for the "${slug}" page. Call get_site_overview and get_page first, then add or update sections. Do not add facts that are not in the notes or the brief.\n\nNotes:\n${notes}`,
      },
      review_wiki: {
        description: 'Review the whole wiki for gaps; no edits.',
        arguments: [],
        text: () =>
          'Review our iGEM wiki without editing anything. Call get_site_overview, then get_page for pages that are not untouched template content. For each page, list what is missing for its purpose, placeholder text still present, unclear headings, and menu problems. Finish with a prioritised to-do list.',
      },
    };
    return { tools, instructions, prompts };
  }

  function rpcResult(id, result) {
    return { jsonrpc: '2.0', id, result };
  }
  function rpcError(id, code, message) {
    return { jsonrpc: '2.0', id: id ?? null, error: { code, message } };
  }
  function answer(message, { tools, instructions, prompts }) {
    if (
      !message ||
      message.jsonrpc !== '2.0' ||
      typeof message.method !== 'string'
    )
      return rpcError(message?.id, -32600, 'Invalid request');
    const { id, method, params } = message;
    const notification = id === undefined;
    if (notification) return null;
    if (method === 'initialize') {
      const requested = params?.protocolVersion;
      return rpcResult(id, {
        protocolVersion: protocols.includes(requested)
          ? requested
          : protocols[0],
        capabilities: {
          tools: { listChanged: false },
          prompts: { listChanged: false },
        },
        serverInfo: {
          name: 'prion-studio',
          title: 'Prion Studio wiki',
          version: '1.0.0',
        },
        instructions,
      });
    }
    if (method === 'ping') return rpcResult(id, {});
    if (method === 'prompts/list')
      return rpcResult(id, {
        prompts: Object.entries(prompts).map(([name, prompt]) => ({
          name,
          description: prompt.description,
          arguments: prompt.arguments,
        })),
      });
    if (method === 'prompts/get') {
      const prompt = prompts[params?.name];
      if (!prompt)
        return rpcError(id, -32602, 'Unknown prompt: ' + params?.name);
      return rpcResult(id, {
        description: prompt.description,
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: prompt.text(params.arguments || {}),
            },
          },
        ],
      });
    }
    if (method === 'tools/list')
      return rpcResult(id, {
        tools: Object.entries(tools).map(([name, tool]) => ({
          name,
          description: tool.description,
          inputSchema: tool.inputSchema,
        })),
      });
    if (method === 'tools/call') {
      const tool = tools[params?.name];
      if (!tool) return rpcError(id, -32602, 'Unknown tool: ' + params?.name);
      try {
        const output = tool.run(params.arguments || {});
        return rpcResult(id, {
          content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
        });
      } catch (error) {
        // Tool failures are reported to the model so it can correct itself.
        return rpcResult(id, {
          isError: true,
          content: [
            {
              type: 'text',
              text: error?.status
                ? error.message
                : 'The edit could not be completed.',
            },
          ],
        });
      }
    }
    return rpcError(id, -32601, 'Method not found: ' + method);
  }

  async function handle(req, res, url) {
    const headers = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers':
        'Content-Type, Authorization, Mcp-Session-Id, Mcp-Protocol-Version',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    };
    const reply = (status, body) => {
      res.writeHead(status, {
        ...headers,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      });
      res.end(body === undefined ? undefined : JSON.stringify(body));
    };
    if (req.method === 'OPTIONS') return reply(204);
    const bearer = /^Bearer\s+(\S+)$/i.exec(
      req.headers.authorization || '',
    )?.[1];
    const token = url.searchParams.get('key') || bearer || '';
    const link = token && byHash.get(hash(token), Date.now());
    if (!link || !projects.has(link.project_id))
      return reply(401, {
        error:
          'This AI link is invalid, expired or revoked. Ask your team for a new link.',
      });
    if (limited(link.id))
      return reply(429, { error: 'Too many requests. Slow down and retry.' });
    if (url.pathname === '/mcp/preview' && ['GET', 'HEAD'].includes(req.method))
      return await file(
        req,
        res,
        path.join(clientDir, 'preview.html'),
        'text/html; charset=utf-8',
      );
    if (url.pathname === '/mcp/preview-data' && req.method === 'GET')
      return reply(200, { data: await previewData(link) });
    if (url.pathname !== '/mcp') return reply(404, { error: 'Not found' });
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST, OPTIONS');
      return reply(405, { error: 'Use POST for MCP requests.' });
    }
    touch.run(Date.now(), link.id);
    let message;
    try {
      message = await readJSON(req);
    } catch (error) {
      return reply(
        error.status === 413 ? 413 : 400,
        rpcError(null, -32700, 'Parse error'),
      );
    }
    const current = session(link, token);
    if (Array.isArray(message)) {
      const answers = message.map((m) => answer(m, current)).filter(Boolean);
      return answers.length ? reply(200, answers) : reply(202);
    }
    const response = answer(message, current);
    return response ? reply(200, response) : reply(202);
  }

  return { handle, links };
}
