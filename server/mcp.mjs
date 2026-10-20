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
import { createMcpMedia } from './mcp-media.mjs';
import {
  createSectionCodeUploads,
  sectionCodeBytes,
  sectionCodeFields,
  codeUploadReview,
  codeHash,
  checkSectionCode,
} from './mcp-section-code.mjs';
import { sourceNotice } from './project-source.mjs';
import {
  HEADER_FIELD,
  validHeader,
  defaultLoading,
  validLoading,
  sectionLinkTargets,
  cssError,
  emptyLayout,
  materialize,
  moveBefore,
  insertNode,
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
  templates,
  templateCss,
  compileCustomCss,
  normalizePdfPlacementCss,
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
  'shape',
  'x',
  'y',
  'freeWidth',
  'freeHeight',
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
  'zIndex',
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
  'html',
  'css',
  'javascript',
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
const previewChecklist = [
  'Open the private preview URL directly with your browser tool. Do not create a local proxy or copy the site into a local reconstruction. If you cannot use a browser, say that visual preview was not verified; reading HTML or get_page is not a visual check.',
  'Read get_page to identify the expected visible sections. Start at the top with a desktop viewport around 1440 × 900. Wait for fonts and visible images to finish loading and layout to settle; report failed loads instead of treating placeholders as the finished design.',
  'Inspect the ENTIRE page: scroll the actual page scroll container downward in overlapping steps of about 70–80% of the viewport height. Inspect each viewport, including all sections, sponsor rows and the footer. Do not stop after the hero or the first screenshot. Scroll-triggered content and lazy images may appear only after you reach them.',
  'Verify you reached the real bottom: the scroll position stops advancing and the final visible section/footer is present. Allow newly loaded content to settle, check the page height again, and continue if it grew. Compare what you saw with the visible section order from get_page. Explain any missing, inaccessible or unloaded sections.',
  'After scrolling through the page, capture a full-page screenshot if supported. If the browser clips or truncates it, capture overlapping viewport screenshots from top to bottom. A screenshot of the current viewport alone is only a partial preview. Inspect the images; do not assume that taking a full-page screenshot proves every section rendered.',
  'Check nested scroll containers separately: a full-page screenshot does not include all content inside a PDF reader, iframe, carousel or overflow panel. Inspect the relevant controls and states, and scroll the inner container where needed. Expand relevant accordions/tabs; do not claim hidden or unread document pages were checked.',
  'Repeat the top-to-bottom check at a mobile viewport around 390 × 844. Check horizontal overflow, clipped content, sticky navigation, sidebar collapse, overlapping elements and the footer. Keep captures at a readable scale rather than zooming the whole page out to fit.',
  'Reduced motion can help capture a stable screenshot, but also test normal motion when the task concerns animation, scrolling or flicker. A reduced-motion screenshot alone cannot validate an animation fix.',
  'After saving edits, reload the preview and repeat the relevant checks, including the full-page pass for changes affecting layout or shared styles. Report the viewport sizes, sections/states actually inspected, whether the bottom was reached, and anything not verified. Never describe a partial check as a full-page review.',
];
const baseRules = `You are editing an iGEM team wiki through Prion Studio.
Start every task with get_site_overview: it gives the team's brief, your task, the menu and each page's purpose and status. Then get_page before changing a page.
Rules:
- Connect directly using the configured MCP connector and its advertised tools. Do not create or start a local proxy, relay, tunnel, localhost bridge or replacement MCP server to reach this service, preview it, or upload files. Never copy the private MCP URL/key into proxy scripts, logs, page code or source files. If the client cannot connect directly, report that limitation and ask the user to configure the direct connector; do not improvise a proxy. Use get_preview_url for browser viewing and the native upload/source tools for files. This rule applies in Standard and Developer modes.
- get_project_template reads the current appearance and original content template without changing either. Pass includeStyles=true to inspect the rendered template CSS; get_page contains saved page content and custom CSS. Change template can change appearance while retaining the original content template.
- Before styling a page, call get_page_styles for that page. It reads the deployed shared styles, combined template/appearance CSS, original and scoped page CSS, section style settings, and isolated custom HTML CSS together. Sources are in stylesheet order, but specificity, !important and inline styles still determine precedence. view="editor" shows canvas CSS transformations; preview is the default. Use includeShared=false for smaller follow-up reads. This tool never edits anything.
- The active design is projectTemplate.appearance; contentTemplate (and the legacy overview template field) identifies the original saved content structure, not the current design. Changing appearance preserves that structure. Blank content can use Luca appearance and a page index. Use set_page_sidebar with the version from get_page to enable/disable the index without replacing content or changing templates.
- get_page lists every template section's "elements": each element's role (heading level, paragraph, link, button, image…), its text, the fieldIds that hold that text, links and images, and an exact CSS selector. Sections the team added carry "selectors" too.
- Template sections (kind "template") keep their own text: change it with update_text using an element's fieldId. Add new content with add_section (subsection=true for an H3). Headings appear in the page's side index automatically.
- Collapsible sections (kind "accordion") hold an ordered list of items { id, title, body, open? }. Add them with add_section kind "accordion" and items; change them with update_section { items: [...] }, keeping existing ids. Each section's summary and text have selectors in get_page. To insert images or other elements into a subsection, call add_section with inside=accordion layer id and insideItem=subsection item id. Keep item ids when reordering; removing an item removes its nested content.
- To move a Custom HTML block (or another section) visually, use move_section with offset: {x, y} in pixels and optional scope. Use after to reorder it. Do not rewrite its HTML or switch its parent to free placement just to move it.
- To restyle one element use style_element with its selector; use set_page_css only for larger stylesheet changes, keeping the existing customCss.
- Deleting a template section hides it; deleting a custom section removes it. Sections locked in Studio cannot be changed.
- Inserting content must preserve existing sections, parent layout modes, positions and relative order. Use add_section with inside/after rather than rewriting the page. Free-positioned inserts are placed below saved child bounds; use the browser preview to check actual text/image heights. Do not switch a flow section to free positioning merely to add an element.
- Edits save immediately and appear live to teammates, who may be editing too. Section edits only change the properties you send. update_text and set_page_css replace whole values: pass ifVersion from get_page.
- The header menu is edited with move_page_in_menu or set_menu. New pages are not in the menu until you place them.
- Keep scientific content accurate. Never invent results, data, names or citations; if information is missing, write a clear placeholder such as "[TODO: add growth curve data]" and say so in your reply.
- Keep newly added images local to Studio. Reuse existing /api/media/ uploads or supplied /templates/ assets; otherwise obtain the actual image file and upload it through the media tools before inserting it. Do not hotlink third-party image URLs (for example ResearchGate/rgstatic, Squarespace or social-media CDNs) in image elements, HTML src/srcset, CSS backgrounds or JavaScript photo arrays. A URL opening in your browser does not mean the export server can download it. Export's remote downloader is a fallback for existing content, not the authoring workflow. If the original cannot be obtained, ask the user to upload it; do not invent file bytes, embed base64 or create a proxy. Preserve existing content unless the user asks to change it. Video Universe iframe embeds remain the supported video/audio workflow.
- For large custom HTML component code, use get_section_code then get_section_code_upload_url and POST the actual local UTF-8 file bytes directly to the returned URL. Maximum 128 KiB (131072 bytes) per field. Do not manually reproduce generated base64/gzip payloads. replace_section_text edits small exact matches without resending unchanged data. Both routes require the current version and hash and preserve other fields. These edit existing sandboxed components with Standard access, not project source files. Developer source permissions still require user approval. ${codeUploadReview} After upload inspect the full preview and report any unverified behavior.
- Upload media before inserting it: upload_media accepts real file bytes as base64 up to 512 KiB. For larger files use start_media_upload, then upload_media_chunk with byte offsets (each chunk up to 512 KiB); the final chunk returns a permanent /api/media/ URL. get_media_upload resumes interrupted transfers; cancel_media_upload removes only unfinished uploads. If your client can send a binary HTTP POST, get_media_upload_url avoids base64 and returns a short-lived direct destination. Never invent bytes or treat a path on your computer as a server path. If your client cannot read an attachment, ask the user to attach it in a way your client can access or use the editor upload. Use the returned permanent URL as src in add_section/update_section; uploads alone do not insert or replace content. For an image inside a custom HTML block, upload it as media and insert the returned permanent URL in an <img src="/api/media/..." alt="..."> tag or CSS url(...), using replace_section_text or update_section. Do not base64-embed the image in component code and do not create a separate image section. Referenced media is collected and mapped automatically during export.
- Studio Design and Preview automatically use developer-source overrides when present, with no version switch. Reopen Studio after adding the first override; rebuild after saving drafts when source changes are available. Custom HTML has a read-only window.websiteSearch.search(query) API returning result objects with title, excerpt, url and page. Use normal editable HTML/CSS for a custom search interface, textContent for results, and ordinary links; no proxy or direct server fetch is needed. The built-in search dialog is a runtime component rather than a page layer. The visitor colour API is window.websiteAccessibility: openSettings(), getColorModes(), setColorMode('default'|'high-contrast'|'protanopia'|'deuteranopia'|'tritanopia'|'grayscale'), getColorMode(), setColorStrength(0..1), getColorStrength(), toggleColorMode(). A built-in Colours chooser lets visitors select a preset and strength; preferences persist per site. Add <button type="button" data-website-color-settings>Colour preferences</button> in editable HTML, or use select[data-website-color-mode] and input[data-website-color-strength] (range 0..100). Custom HTML supports the same API asynchronously. Active modes use a readable interface palette; strength affects media, not text contrast. Media/PDFs use colour assistance; video/player/plugin surfaces use an approximate CSS fallback for browser compatibility. These are visual aids, not simulations or medically validated corrections. Default restores authored appearance without changing media files. Mark CSS-background logos with data-website-media and exempt colour-critical subtrees with data-preserve-colors. Custom charts can listen for website:colormodechange with mode, strength and palette. Keep labels/patterns on colour-coded data.
- PDFs can be referenced inside custom HTML without creating PDF sections: upload the actual PDF once, then use <a href="/api/media/FILE_ID.pdf" data-studio-pdf>Read the document</a>. Reuse existing uploaded URLs. Preview opens the shared PDF reader; export collects the file, maps the URL and preserves complete-document reading/download for partitioned PDFs. Do not use iframe/embed/object for PDF files or encode PDF bytes in HTML/JavaScript. Upload & insert PDF link is also available in the HTML editor. A client's network allowlist blocking the upload host is a client restriction, not a ban on referencing media-library PDFs. Use the direct connector's native upload tools with real bytes if available; otherwise ask for a Studio upload. Do not create a proxy or manually transcribe base64.
- Custom HTML can display existing media-library photos, including flip cards. Use permanent /api/media/ URLs; never save temporary /file/...?...ticket links or ask users to rehost working photos elsewhere merely because the block is sandboxed. Complete URLs are preferred; literal uploaded UUID filenames in arrays combined with '/api/media/' are also resolved and collected for export. The parent supplies image bytes without exposing login cookies to custom code. Keep IDs readable in code; encrypted/compressed/generated IDs cannot be discovered for export. Do not fetch private media from custom JavaScript (network fetch remains blocked); use img src/srcset or CSS background images. If a photo fails, inspect its HTTP error and try Retry images; verify the original before declaring it missing or asking for replacement. Test keyboard activation and phone/tablet layouts as well as desktop.
- Use get_preview_url to look at a page if you have a browser tool. Follow the full-page inspection checklist returned by that tool; one viewport is not a complete preview.
Full-page preview checklist:
${previewChecklist.map((step, i) => `${i + 1}. ${step}`).join('\n')}`;

export function createMcp({
  db,
  projectSource,
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
  mediaUploadURL,
  mediaUploadOrigin,
  environment,
  dataDir,
}) {
  const mediaUploads = createMcpMedia({ db, dataDir, environment, fail });
  const codeUploads = createSectionCodeUploads({ fail });
  let sharedStyles;
  function readSharedStyles() {
    if (sharedStyles) return sharedStyles;
    try {
      // Read only CSS linked by our built preview, never an arbitrary path or
      // URL supplied by the MCP caller. Preserve stylesheet source order.
      const html = readFileSync(path.join(clientDir, 'preview.html'), 'utf8');
      sharedStyles = [...html.matchAll(/<link\b[^>]*>/g)]
        .filter(([tag]) => /rel=["']stylesheet["']/.test(tag))
        .map(
          ([tag]) =>
            /href=["'](\/assets\/[a-zA-Z0-9_.-]+\.css)["']/.exec(tag)?.[1],
        )
        .filter(Boolean)
        .map((href) => ({
          kind: 'shared',
          href,
          css: readFileSync(path.join(clientDir, href.slice(1)), 'utf8'),
        }));
      return sharedStyles;
    } catch {
      return null;
    }
  }
  db.exec(
    'CREATE TABLE IF NOT EXISTS mcp_links (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, page TEXT, name TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE, created_by TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, revoked_at INTEGER, last_used_at INTEGER)',
  );
  const columns = db.prepare('PRAGMA table_info(mcp_links)').all();
  for (const [column, type] of [
    ['task', 'TEXT'],
    ['token_enc', 'TEXT'],
    ['created_by_id', 'TEXT'],
    ['mode', "TEXT NOT NULL DEFAULT 'standard'"],
    ['approved_at', 'INTEGER'],
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
  // Only the authenticated editor API can issue this short-lived, one-use grant.
  // MCP bearer links cannot create or promote links, even in developer mode.
  const developerGrants = new Map();
  const links = {
    prepareDeveloper(projectId, user) {
      for (const [key, grant] of developerGrants)
        if (
          grant.expiresAt < Date.now() ||
          (grant.projectId === projectId && grant.userId === user.userId)
        )
          developerGrants.delete(key);
      const confirmation = randomBytes(32).toString('base64url');
      developerGrants.set(confirmation, {
        projectId,
        userId: user.userId,
        expiresAt: Date.now() + 600000,
      });
      return { confirmation, notice: sourceNotice };
    },
    // Everyone sees the team's links; only the creator can copy one again.
    list(projectId, user) {
      return activeRows(projectId).map((row) => ({
        id: row.id,
        page: row.page,
        name: row.name,
        mode: row.mode,
        approvedAt: row.approved_at,
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
      const mode = body.mode ?? 'standard';
      if (!['standard', 'developer'].includes(mode))
        throw fail(400, 'Choose Standard or Developer mode.');
      if (mode === 'developer') {
        const grant = developerGrants.get(body.confirmation);
        if (
          body.confirmDeveloper !== true ||
          !grant ||
          grant.projectId !== projectId ||
          grant.userId !== user.userId ||
          grant.expiresAt < Date.now()
        )
          throw fail(
            403,
            'Confirm developer access in the signed-in editor before creating this link.',
          );
        if (body.page != null)
          throw fail(
            400,
            'Developer source access requires whole-project scope.',
          );
      }
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
        mode,
        approvedAt: mode === 'developer' ? now : null,
      };
      db.prepare(
        'INSERT INTO mcp_links (id,project_id,page,name,token_hash,created_by,created_at,expires_at,task,token_enc,created_by_id,mode,approved_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',
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
        mode,
        link.approvedAt,
      );
      if (mode === 'developer') developerGrants.delete(body.confirmation);
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
      projectSource.releaseOwner(String(id));
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
    function projectTemplate(includeStyles = false) {
      const sourceId = project.templateId || 'classic';
      const row = project.select.get('site:appearance');
      const appearanceId = row?.value || sourceId;
      const describe = (id) => ({
        id,
        name: templates[id]?.name || (id === 'classic' ? 'Classic' : id),
      });
      return {
        contentTemplate: describe(sourceId),
        appearance: { ...describe(appearanceId), version: row?.version || 0 },
        appearanceChanged: appearanceId !== sourceId,
        ...(includeStyles ? { css: templateCss(sourceId, appearanceId) } : {}),
        note: 'Read-only. Appearance is layered over the original content template. Saved pages, images and custom CSS are not template defaults: inspect them with get_page, or view them with get_preview_url. CSS here excludes page overrides and shared editor/reader styles.',
      };
    }
    function pageStyles(slug, options = {}) {
      if (
        Object.keys(options).some(
          (key) => !['view', 'includeShared'].includes(key),
        ) ||
        (options.view !== undefined &&
          !['preview', 'editor'].includes(options.view)) ||
        (options.includeShared !== undefined &&
          typeof options.includeShared !== 'boolean')
      )
        throw fail(
          400,
          'Use view="preview" or "editor" and an optional boolean includeShared.',
        );
      slug = page(slug);
      const { layout, version } = readLayout(project, slug);
      const info = projectTemplate();
      const editor = options.view === 'editor';
      const scope = `[data-page-css="${slug}"]`;
      const customCss = layout.customCss || '';
      const warnings = [];
      let compiled = '';
      try {
        compiled = compileCustomCss(
          normalizePdfPlacementCss(
            customCss,
            layout.nodes.filter((n) => n.kind === 'pdf').map((n) => n.id),
          ),
          scope,
          editor,
        );
      } catch (error) {
        warnings.push(
          'Saved page CSS is invalid and the renderer omits it: ' +
            error.message,
        );
      }
      const shared = options.includeShared === false ? [] : readSharedStyles();
      if (!shared?.length && options.includeShared !== false)
        warnings.push(
          'Deployed shared styles are unavailable; this is not the complete stylesheet stack.',
        );
      const styleKeys = [
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
        'zIndex',
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
        'objectFit',
        'layoutMode',
        'x',
        'y',
        'freeWidth',
        'freeHeight',
      ];
      return {
        page: slug,
        version,
        view: editor ? 'editor' : 'preview',
        scope,
        projectTemplate: info,
        layout: {
          width: layout.width,
          gap: layout.gap,
          sidebar: layout.sidebar,
        },
        customCss,
        stylesheets: [
          ...(shared || []),
          {
            kind: 'template',
            css: templateCss(
              info.contentTemplate.id,
              info.appearance.id,
              editor,
            ),
          },
          { kind: 'page', css: compiled },
        ],
        sections: layout.nodes.map((n) => ({
          id: n.id,
          kind: n.kind,
          parentId: n.parentId,
          parentItemId: n.parentItemId,
          hidden: !!n.hidden,
          selector: `[data-layer-id="${n.id}"]`,
          settings: Object.fromEntries(
            styleKeys
              .filter((key) => n[key] !== undefined)
              .map((key) => [key, n[key]]),
          ),
        })),
        isolatedHtmlStyles: layout.nodes
          .filter((n) => n.kind === 'html')
          .map((n) => ({
            id: n.id,
            css: n.css || '',
            note: 'Separate sandboxed iframe; page CSS cannot select its contents. get_page returns its HTML and JavaScript.',
          })),
        warnings,
        note: 'Read-only stylesheet sources in load order, not browser-computed styles. Specificity, !important, inheritance, responsive conditions and inline styles affect the result. Section settings generate inline styles; template HTML may also have inline styles (inspect get_page). Editor chrome is not part of the page. Shared CSS uses its href as the base for relative asset URLs. Use get_preview_url to verify the rendered result.',
      };
    }
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
        const next = change(layout, version);
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
        if (JSON.stringify({ ...next, customCss: '' }).length > 1024 * 1024)
          throw fail(
            413,
            'The page layout exceeds 1048576 serialized characters (excluding page CSS). Nothing was saved. Reduce unnecessary content or split it across pages.',
          );
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
    function sectionCode(args, layout, version, writing = false) {
      if (!sectionCodeFields.includes(args.field))
        throw fail(400, 'field must be html, css or javascript.');
      const target = node(layout, args.id);
      if (target.kind !== 'html')
        throw fail(400, 'Choose a custom HTML component from get_page.');
      const content = target[args.field] || '';
      if (writing) {
        if (nodeLocked(layout, args.id))
          throw fail(423, 'That section is locked in Studio.');
        if (
          !Number.isSafeInteger(args.ifVersion) ||
          args.ifVersion !== version ||
          args.ifHash !== codeHash(content)
        )
          throw fail(
            409,
            'The page or code changed. Call get_section_code and review the latest content before retrying. Nothing was saved.',
          );
      }
      return {
        page: args.page,
        id: args.id,
        field: args.field,
        version,
        sha256: codeHash(content),
        bytes: Buffer.byteLength(content),
        maxUploadBytes: sectionCodeBytes,
        content,
      };
    }
    function saveSectionCode(args, transform) {
      const slug = page(args.page);
      let output;
      writeLayout(slug, (layout, version) => {
        const current = sectionCode(args, layout, version, true);
        const content = transform(current.content);
        checkSectionCode(content, fail);
        output = {
          ok: true,
          page: slug,
          id: args.id,
          field: args.field,
          sha256: codeHash(content),
          bytes: Buffer.byteLength(content),
        };
        return {
          ...layout,
          nodes: layout.nodes.map((n) =>
            n.id === args.id ? { ...n, [args.field]: content } : n,
          ),
        };
      });
      seen(slug, args.id, 'Updated custom component code');
      return {
        ...output,
        version: readLayout(project, slug).version,
        next: 'Inspect the full page using get_preview_url, including interactions and console errors.',
      };
    }
    function describe(project, slug, layout, version) {
      const { layers, context } = pageView(project, slug);
      return {
        page: slug,
        title: pageList(project).find((p) => p.slug === slug)?.title,
        version,
        width: layout.width,
        gap: layout.gap,
        sidebar: layout.sidebar,
        pageIndex: {
          enabled: layout.sidebar,
          tool: 'set_page_sidebar',
          source:
            'Saved section headings; independent of the original content template.',
        },
        customCss: layout.customCss || '',
        linkTargets: sectionLinkTargets(siteData(), slug, layout).map(
          (target) => ({
            ...target,
            href: (slug === 'home' ? '/' : '/' + slug) + '#' + target.anchor,
          }),
        ),
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
    function loadingState() {
      const row = project.select.get(HEADER_FIELD);
      let header;
      try {
        header = JSON.parse(
          row?.value ?? project.defaults()[HEADER_FIELD] ?? '{}',
        );
      } catch {
        /* Report invalid saved data rather than replacing the header. */
      }
      if (!validHeader(header))
        throw fail(
          400,
          'The saved website header is invalid. Repair it in Studio before changing the loading animation.',
        );
      return {
        row,
        header,
        settings: { ...defaultLoading, ...header.loading },
      };
    }
    function loadingInfo() {
      const { row, settings } = loadingState();
      return {
        settings,
        version: row?.version || 0,
        canEdit: !link.page,
        scope: 'project',
        instructions:
          'Use update_loading_animation with this version. Standard whole-project links can save these settings; Developer access is not required. Saved settings apply to the live website and future exports. Prepare a fresh export to update an already exported website. session means once per browser tab/session; first remembers this browser using localStorage; always replays each page visit. Studio Pages → Loading animation → Preview animation replays without consuming the visitor flag. Reduced-motion preferences skip the animation.',
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

    const mediaPage = {
      type: 'string',
      description: 'Page slug within this AI link’s scope',
    };
    const uploadId = {
      type: 'string',
      description: 'Upload id returned by start_media_upload',
    };
    const base64 = {
      type: 'string',
      description:
        'Actual file bytes encoded as standard base64, no data URL prefix; maximum 512 KiB decoded',
    };
    const codeProperties = {
      page: { type: 'string' },
      id: {
        type: 'string',
        description: 'Existing custom HTML component ID from get_page.',
      },
      field: { type: 'string', enum: sectionCodeFields },
    };
    const codeWriteProperties = {
      ...codeProperties,
      ifVersion: {
        type: 'integer',
        minimum: 0,
        description: 'Page version from get_section_code.',
      },
      ifHash: {
        type: 'string',
        description: 'Existing field SHA-256 from get_section_code.',
      },
      reviewedForUpload: {
        type: 'boolean',
        const: true,
        description: codeUploadReview,
      },
    };
    const tools = {
      get_section_code: {
        description:
          'Read one custom HTML component field with its byte size, SHA-256 and page version. Set includeContent=false to inspect metadata without returning a large encoded payload. Standard links may use this tool; source files are separate.',
        annotations: { readOnlyHint: true },
        inputSchema: {
          type: 'object',
          properties: {
            ...codeProperties,
            includeContent: { type: 'boolean', default: true },
          },
          required: ['page', 'id', 'field'],
        },
        run(args) {
          const { layout, version } = readLayout(project, page(args.page));
          const result = sectionCode(args, layout, version);
          if (args.includeContent === false) delete result.content;
          return result;
        },
      },
      get_section_code_upload_url: {
        description:
          'Replace one existing custom component HTML/CSS/JavaScript field by uploading an actual local UTF-8 file, at most 128 KiB (131072 bytes). First get_section_code; review the generated artifact for unnecessary tests/debug/demo content. Returns a 10-minute URL: POST raw file bytes, not JSON/multipart/base64. Verifies size, checksum, scope, locks and concurrent edits before saving atomically. Does not require Developer mode or change source files.',
        inputSchema: {
          type: 'object',
          properties: {
            ...codeWriteProperties,
            size: { type: 'integer', minimum: 0, maximum: sectionCodeBytes },
            sha256: {
              type: 'string',
              description: 'SHA-256 computed from the actual local file bytes.',
            },
          },
          required: [
            'page',
            'id',
            'field',
            'ifVersion',
            'ifHash',
            'size',
            'sha256',
            'reviewedForUpload',
          ],
        },
        run(args) {
          const { layout, version } = readLayout(project, page(args.page));
          sectionCode(args, layout, version, true);
          const ticket = codeUploads.issue(link, args);
          return {
            url:
              publicOrigin + '/mcp/section-code-upload?upload=' + ticket.secret,
            method: 'POST',
            headers: { 'Content-Type': 'application/octet-stream' },
            expiresAt: ticket.expiresAt,
            maxBytes: sectionCodeBytes,
            body: 'Raw UTF-8 file bytes',
            review: codeUploadReview,
            note: 'Treat this scoped URL as a secret. Send the file directly with your HTTP/file tool; do not create a local proxy or retype an encoded payload. Identical retries return the original receipt. Tickets expire on server restart. Saving updates only this field, then verify the full preview.',
          };
        },
      },
      replace_section_text: {
        description:
          'Apply one exact, unique text replacement within a custom HTML component field without resending its unchanged code or encoded data. Requires get_section_code version/hash and an agent production review. The resulting field may be at most 128 KiB UTF-8. For a rebuilt generated payload, use get_section_code_upload_url.',
        inputSchema: {
          type: 'object',
          properties: {
            ...codeWriteProperties,
            find: { type: 'string', minLength: 1 },
            replace: { type: 'string' },
          },
          required: [
            'page',
            'id',
            'field',
            'ifVersion',
            'ifHash',
            'find',
            'replace',
            'reviewedForUpload',
          ],
        },
        run(args) {
          if (args.reviewedForUpload !== true)
            throw fail(400, codeUploadReview);
          if (
            typeof args.find !== 'string' ||
            !args.find ||
            typeof args.replace !== 'string'
          )
            throw fail(
              400,
              'Supply nonempty find text and a replacement string.',
            );
          return saveSectionCode(args, (content) => {
            const offset = content.indexOf(args.find);
            if (offset < 0 || content.indexOf(args.find, offset + 1) >= 0)
              throw fail(
                409,
                'find must match exactly once. Read the latest code and use a unique match. Nothing was saved.',
              );
            return (
              content.slice(0, offset) +
              args.replace +
              content.slice(offset + args.find.length)
            );
          });
        },
      },
      upload_media: {
        description:
          'Upload a small image, PDF or other supported file (up to 512 KiB) directly through MCP. Returns a permanent media URL for add_section/update_section; does not alter page content. For larger files use chunk uploads or get_media_upload_url.',
        inputSchema: {
          type: 'object',
          properties: {
            page: mediaPage,
            name: {
              type: 'string',
              description: 'Filename including extension',
            },
            base64,
          },
          required: ['page', 'name', 'base64'],
        },
        run(args) {
          return mediaUploads.upload(link, page(args.page), args);
        },
      },
      start_media_upload: {
        description:
          'Start a resumable upload of an image or file. Supply filename and exact byte size. Returns uploadId, nextOffset and chunkBytes. Send chunks in order with upload_media_chunk. Sessions last 24 hours and are private to this link and page. Supports the same formats and limits as the editor.',
        inputSchema: {
          type: 'object',
          properties: {
            page: mediaPage,
            name: { type: 'string' },
            size: {
              type: 'integer',
              minimum: 16,
              description: 'Exact file size in bytes, not base64 length',
            },
          },
          required: ['page', 'name', 'size'],
        },
        run(args) {
          return mediaUploads.start(link, page(args.page), args);
        },
      },
      upload_media_chunk: {
        description:
          'Append up to 512 KiB of base64-encoded file bytes at nextOffset. First chunk must contain at least 16 bytes. Repeating the same bytes at the same offset is safe. Automatically completes when all declared bytes arrive and returns the permanent media URL.',
        inputSchema: {
          type: 'object',
          properties: {
            page: mediaPage,
            uploadId,
            offset: { type: 'integer', minimum: 0 },
            base64,
          },
          required: ['page', 'uploadId', 'offset', 'base64'],
        },
        run(args) {
          return mediaUploads.append(link, page(args.page), args);
        },
      },
      get_media_upload: {
        description:
          'Check an upload’s receivedBytes, nextOffset and completion. Use after a lost response or reconnect to resume without duplicating the file.',
        inputSchema: {
          type: 'object',
          properties: { page: mediaPage, uploadId },
          required: ['page', 'uploadId'],
        },
        run(args) {
          return mediaUploads.status(link, page(args.page), args.uploadId);
        },
      },
      cancel_media_upload: {
        description:
          'Discard an unfinished upload and its temporary bytes. Cannot delete completed media or page content.',
        inputSchema: {
          type: 'object',
          properties: { page: mediaPage, uploadId },
          required: ['page', 'uploadId'],
        },
        run(args) {
          return mediaUploads.cancel(link, page(args.page), args.uploadId);
        },
      },
      get_media_upload_url: {
        description:
          'For clients with HTTP/file access: request a short-lived binary upload URL for a file on this page. POST the actual file bytes (not multipart or JSON) to that URL. The POST response contains the permanent /api/media/ URL. If direct media is unavailable, use start_media_upload instead. Never put the temporary upload URL in page content.',
        inputSchema: {
          type: 'object',
          properties: {
            page: mediaPage,
            name: { type: 'string' },
            size: { type: 'integer', minimum: 16 },
          },
          required: ['page', 'name', 'size'],
        },
        async run(args) {
          page(args.page);
          if (!mediaUploadURL)
            throw fail(
              409,
              'Direct media is not configured. Use start_media_upload and upload_media_chunk instead.',
            );
          const ticket = await mediaUploadURL(
            { name: args.name, size: args.size },
            { userId: agentId },
          );
          return {
            ...ticket,
            method: 'POST',
            headers: {
              'Content-Type': 'application/octet-stream',
              Origin: mediaUploadOrigin,
            },
            body: 'Raw file bytes',
            note: 'This URL is a temporary secret. Use it only for the upload. Insert the permanent url from the HTTP response into the page.',
          };
        },
      },
      get_page_styles: {
        description:
          'Read the styling of one authorized page together: deployed shared styles, active template/appearance CSS, raw and compiled page custom CSS, layout and section style settings, and sandboxed HTML CSS. Returns stylesheet order and layout version without changing content. Includes responsive rules; not browser-computed styles. Call before editing page styles.',
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
        inputSchema: {
          type: 'object',
          properties: {
            page: {
              type: 'string',
              description: 'Page slug from get_site_overview.',
            },
            view: {
              type: 'string',
              enum: ['preview', 'editor'],
              default: 'preview',
            },
            includeShared: {
              type: 'boolean',
              default: true,
              description:
                'Include the deployed shared CSS. Set false for a smaller follow-up response.',
            },
          },
          required: ['page'],
          additionalProperties: false,
        },
        run({ page: slug, ...options }) {
          return pageStyles(slug, options);
        },
      },
      get_project_template: {
        description:
          'Read only: identify this project’s currently selected template appearance and original content template, including their names. Optionally return the same template CSS used by the renderer. Does not change the template, content, or settings. Use get_page for saved content and page CSS, and get_preview_url for visual inspection.',
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
        inputSchema: {
          type: 'object',
          properties: {
            includeStyles: {
              type: 'boolean',
              description:
                'Include the combined template and appearance CSS (can be large).',
            },
          },
          additionalProperties: false,
        },
        run(args) {
          if (
            Object.keys(args).some((key) => key !== 'includeStyles') ||
            (args.includeStyles !== undefined &&
              typeof args.includeStyles !== 'boolean')
          )
            throw fail(
              400,
              'Only the optional boolean includeStyles is accepted. The project is determined by this MCP link.',
            );
          return projectTemplate(args.includeStyles === true);
        },
      },
      get_loading_animation: {
        description:
          'Read the project-wide visitor loading animation, effective defaults, header version and edit permission. This is the animation shown when visitors enter the exported website, not Studio’s own loading screen.',
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
        inputSchema: {
          type: 'object',
          properties: {},
          additionalProperties: false,
        },
        run(args) {
          if (Object.keys(args).length)
            throw fail(400, 'get_loading_animation takes no arguments.');
          return loadingInfo();
        },
      },
      update_loading_animation: {
        description:
          'Save a partial patch to the project-wide visitor loading animation, preserving other header settings. Available to standard whole-project MCP links; page-limited links cannot edit global settings. First read get_loading_animation and pass its version as ifVersion. For an uploaded animated image on the first visit use enabled:true, frequency:"first", animation:"custom", image:the uploaded media URL, duration:3400 and timeout:5000. Empty customCss with custom animation displays the image without an extra preset effect. Use upload_media/list_media for an actual image URL, never invent one. Prepare a fresh export after saving.',
        annotations: {
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: false,
        },
        inputSchema: {
          type: 'object',
          properties: {
            ifVersion: {
              type: 'integer',
              minimum: 0,
              description: 'Header version returned by get_loading_animation.',
            },
            settings: {
              type: 'object',
              additionalProperties: false,
              minProperties: 1,
              properties: {
                enabled: { type: 'boolean' },
                frequency: {
                  type: 'string',
                  enum: ['session', 'first', 'always'],
                },
                animation: {
                  type: 'string',
                  enum: ['pulse', 'spin', 'dots', 'custom'],
                },
                image: {
                  type: 'string',
                  maxLength: 2048,
                  description:
                    'Uploaded image URL, or empty string to remove it. Prefer Studio media library URLs.',
                },
                message: { type: 'string', maxLength: 160 },
                background: { type: 'string', pattern: '^#[a-fA-F0-9]{6}$' },
                color: { type: 'string', pattern: '^#[a-fA-F0-9]{6}$' },
                duration: {
                  type: 'number',
                  minimum: 0,
                  maximum: 5000,
                  description: 'Minimum display time in milliseconds.',
                },
                timeout: {
                  type: 'number',
                  minimum: 1000,
                  maximum: 10000,
                  description:
                    'Maximum wait in milliseconds, at least duration.',
                },
                customCss: {
                  type: 'string',
                  maxLength: 8000,
                  description:
                    'Animation CSS; no url(), @import or closing style tags.',
                },
              },
            },
          },
          required: ['settings', 'ifVersion'],
          additionalProperties: false,
        },
        run(args) {
          if (link.page)
            throw fail(
              403,
              'Loading animation is project-wide. Use a whole-project MCP link to edit it.',
            );
          const { settings, ifVersion } = args;
          if (
            Object.keys(args).some(
              (key) => !['settings', 'ifVersion'].includes(key),
            ) ||
            !Number.isSafeInteger(ifVersion) ||
            ifVersion < 0
          )
            throw fail(
              400,
              'Pass settings and a non-negative integer ifVersion from get_loading_animation.',
            );
          if (
            !settings ||
            typeof settings !== 'object' ||
            Array.isArray(settings) ||
            !Object.keys(settings).length
          )
            throw fail(
              400,
              'settings must be a non-empty loading animation patch.',
            );
          const current = loadingState();
          if ((current.row?.version || 0) !== ifVersion)
            throw fail(
              409,
              'Conflict: the header or loading animation changed. Read get_loading_animation and retry.',
            );
          const next = { ...current.settings, ...settings };
          if (!validLoading(next))
            throw fail(
              400,
              'Invalid loading animation settings. Check supported fields, image URL, colours, CSS and timing: duration 0–5000 ms; timeout 1000–10000 ms and at least duration.',
            );
          const value = JSON.stringify({ ...current.header, loading: next });
          const result = current.row
            ? project.update.run(value, author, HEADER_FIELD, ifVersion)
            : project.insert.run(HEADER_FIELD, value, author);
          if (!result.changes)
            throw fail(
              409,
              'Conflict: the header or loading animation changed. Read get_loading_animation and retry.',
            );
          live.changed(project.id, [HEADER_FIELD], '');
          return { ok: true, ...loadingInfo() };
        },
      },
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
            accessMode: link.mode || 'standard',
            connectionPolicy:
              'Use the direct MCP connector. Do not create local proxies, tunnels, relays or localhost bridges. If direct connection fails, report it and ask for connector configuration.',
            sourceAccess:
              link.mode === 'developer'
                ? sourceNotice
                : 'Source tools require a separately approved Developer link created in Studio.',
            template: project.templateId || 'classic',
            projectTemplate: projectTemplate(),
            loadingAnimation: loadingInfo(),
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
              'get_project_template to inspect the current appearance; includeStyles=true returns template CSS.',
              'get_loading_animation / update_loading_animation configure the exported website’s visitor entrance animation, including first visit only, uploaded image and minimum display time. Standard whole-project access is sufficient; preserve the returned version and prepare a fresh export after saving.',
              'get_page_styles before styling a page: shared, template and page CSS plus section style settings in one read-only response.',
              'Replace template placeholder text with update_text; add new sections with add_section.',
              'Keep headings short and informative: they form the page index.',
              'The current design is projectTemplate.appearance, not the legacy template field. set_page_sidebar toggles the section index, including Blank content restyled with Luca; pass the version from get_page.',
              'Use get_preview_url and follow its inspection checklist: scroll through the entire page to the footer on desktop and mobile, check lazy-loaded/nested content, then capture full-page or overlapping screenshots. State explicitly if your check was partial.',
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
          'Get a private read-only preview of the saved page using the installed template/components. Returns a mandatory full-page inspection checklist. Open directly in your browser, scroll in overlapping steps from header to footer to load and inspect every visible section, check nested content, and repeat on desktop/mobile. One viewport screenshot is not a full preview. Developer source overrides are not shown by this tool. In signed-in Studio, open Preview to build and inspect them before export.',
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
            renderingScope:
              'Saved page content and styles with the installed release. Developer source workspace overrides are not rendered by this preview.',
            inspection: {
              viewports: {
                desktop: { width: 1440, height: 900 },
                mobile: { width: 390, height: 844 },
              },
              checklist: previewChecklist,
              completion:
                'Report full or partial coverage, actual viewport sizes, whether the footer/real bottom was reached, interactions checked, and any remaining gaps. Never include the private URL/key in your report.',
            },
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
          'Read a page: its sections in order (ids, kinds, headings, text, styles) and, for template sections, their editable text fields. Pass includeStyles=true to include the full get_page_styles preview response alongside the content.',
        inputSchema: {
          type: 'object',
          properties: {
            page: { type: 'string', description: 'Page slug' },
            includeStyles: { type: 'boolean', default: false },
          },
          required: ['page'],
        },
        run({ page: slug, includeStyles }) {
          if (includeStyles !== undefined && typeof includeStyles !== 'boolean')
            throw fail(400, 'includeStyles must be a boolean.');
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
            ...(includeStyles ? { styles: pageStyles(slug) } : {}),
          };
        },
      },
      update_text: {
        description:
          "Replace one text field of a template section (fieldId from get_page's texts). Plain text with optional Markdown links: [label](/page#section-id). Use linkTargets from get_page on the destination page; never invent section IDs.",
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
          'Add a section. Default is a heading + paragraph text block placed after `after` (a section id) or at the end. subsection=true makes an H3 subsection. Use kind image/video/embed/button with src or linkTo. Use kind html with html, css and javascript strings for sandboxed animations and HTTPS video/audio. HTML may include iGEM Video Universe, YouTube or Vimeo iframe embeds; keep player query settings such as title=0 and warningTitle=0 and include allow="autoplay; fullscreen; picture-in-picture" on the iframe. No external scripts or fetch. Use kind equation with LaTeX math source in body (no document preamble). Use kind references with references [{id,text,url}] and cite using [@SECTION_ID/ENTRY_ID] in page text. Use kind "accordion" with `items` for collapsible sections (FAQ-style): readers can open several at once, and opening one never changes the address or scrolls the page.',
        inputSchema: {
          type: 'object',
          properties: {
            page: { type: 'string' },
            heading: { type: 'string' },
            shape: {
              type: 'string',
              enum: [
                'rectangle',
                'ellipse',
                'triangle',
                'diamond',
                'line',
                'arrow',
              ],
            },
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
                'html',
                'shape',
              ],
            },
            html: { type: 'string' },
            css: { type: 'string' },
            javascript: { type: 'string' },
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
              description:
                'Text block, frame, template section or accordion id to place this inside. An accordion also requires insideItem.',
            },
            insideItem: {
              type: 'string',
              description:
                'Subsection item id from get_page; required when inside is an accordion.',
            },
            subsection: { type: 'boolean' },
            src: {
              type: 'string',
              description:
                'HTTPS media URL or permanent /api/media/ URL returned by upload tools',
            },
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
              'html',
              'shape',
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
              ...(kind === 'shape'
                ? { shape: input.shape || 'rectangle' }
                : {}),
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
              ...(kind === 'html'
                ? {
                    html: input.html ?? '',
                    css: input.css ?? '',
                    javascript: input.javascript ?? '',
                    minHeight: 360,
                  }
                : {}),
              ...(kind === 'references'
                ? { references: input.references || [] }
                : {}),
              ...(kind === 'accordion'
                ? { items: accordionItems(input.items ?? []) }
                : {}),
            };
            if (input.inside) {
              const parent = node(layout, input.inside);
              if (
                !['section', 'template', 'accordion', 'text'].includes(
                  parent.kind,
                )
              )
                throw fail(
                  400,
                  '`inside` must be a frame, template section or collapsible.',
                );
              if (
                parent.kind === 'accordion' &&
                !parent.items?.some((item) => item.id === input.insideItem)
              )
                throw fail(
                  400,
                  'Choose a valid insideItem subsection id from get_page.',
                );
              if (nodeLocked(layout, parent.id))
                throw fail(423, 'That section is locked in Studio.');
            }
            if (input.after) node(layout, input.after);
            const parentId =
              input.inside ||
              layout.nodes.find((c) => c.id === 'custom-content')?.id;
            if (parentId && nodeLocked(layout, parentId))
              throw fail(423, 'That section is locked in Studio.');
            label = n.name;
            if (
              input.insideItem !== undefined &&
              (!input.inside || node(layout, input.inside).kind !== 'accordion')
            )
              throw fail(
                400,
                'insideItem requires an accordion inside destination.',
              );
            return insertNode(layout, n, {
              inside: input.inside,
              insideItem: input.insideItem,
              after: input.after,
            });
          });
          seen(slug, id, label);
          return { ok: true, id };
        },
      },
      update_section: {
        description:
          'For large custom HTML code use get_section_code_upload_url (128 KiB); replace_section_text patches a small exact match. Before uploading production code check for unnecessary tests/debug content. Change properties of a section: title, body, items (the full list of collapsible sections for an accordion; keep each existing id to keep it stable), name, hidden, headingLevel (2 or 3), indexLabel, indexHidden, span/tabletSpan/mobileSpan (1-12), minHeight (px), x/freeWidth (%), y/freeHeight (px) for free-placement children, shape (rectangle/ellipse/triangle/diamond/line/arrow), zIndex (integer layer order; higher covers lower within the same container), align, colours (#RRGGBB), spacing, font sizes, src/alt/caption, linkTo/linkLabel. Use null to clear a property.',
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
            if (
              ['x', 'y', 'freeWidth', 'freeHeight'].some(
                (key) => changes[key] !== undefined && changes[key] !== null,
              ) &&
              layout.nodes.find((n) => n.id === target.parentId)?.layoutMode !==
                'free'
            )
              throw fail(
                400,
                'x/y/freeWidth/freeHeight only apply inside a free-placement section. For a visual move use move_section with offset: {x, y} in pixels; use span/minHeight to resize in responsive flow.',
              );
            label = target.name || target.title || target.kind;
            const preparedItems =
              'items' in changes
                ? accordionItems(changes.items ?? [])
                : undefined;
            const next = patchNodes(
              layout,
              [id],
              preparedItems ? { items: preparedItems } : {},
            );
            if (preparedItems && next === layout)
              throw fail(
                423,
                'Unlock nested elements before removing their subsection.',
              );
            next.nodes = next.nodes.map((n) => {
              if (n.id !== id) return n;
              const copy = { ...n };
              for (const [key, value] of Object.entries(changes))
                if (key === 'items' && value !== null)
                  copy.items = preparedItems;
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
          'Move any section, including Custom HTML. Use offset: {x, y} for an absolute visual offset in pixels from its normal layout position (negative values allowed; {x:0,y:0} resets). This preserves parent layout, size, content and page order. scope can be all, tablet or mobile. To reorder, provide after (empty string means first); without offset, omitting after also means first. Both may be supplied together. No developer permission is needed.',
        inputSchema: {
          type: 'object',
          properties: {
            page: { type: 'string' },
            id: { type: 'string' },
            after: { type: 'string' },
            offset: {
              type: 'object',
              properties: { x: { type: 'number' }, y: { type: 'number' } },
              required: ['x', 'y'],
              additionalProperties: false,
            },
            scope: { type: 'string', enum: ['all', 'tablet', 'mobile'] },
          },
          required: ['page', 'id'],
        },
        run({ page: slug, id, after, offset, scope = 'all' }) {
          if (
            offset !== undefined &&
            (!offset ||
              typeof offset !== 'object' ||
              Array.isArray(offset) ||
              !Number.isFinite(offset.x) ||
              !Number.isFinite(offset.y) ||
              Object.keys(offset).some((k) => !['x', 'y'].includes(k)))
          )
            throw fail(
              400,
              '`offset` must contain finite x and y pixel values.',
            );
          if (!['all', 'tablet', 'mobile'].includes(scope))
            throw fail(400, 'Invalid movement scope.');
          slug = page(slug);
          writeLayout(slug, (layout) => {
            const target = node(layout, id);
            if (nodeLocked(layout, id))
              throw fail(423, 'That section is locked in Studio.');
            const siblings = layout.order.filter(
              (other) =>
                other !== id &&
                layout.nodes.find((n) => n.id === other)?.parentId ===
                  target.parentId &&
                layout.nodes.find((n) => n.id === other)?.parentItemId ===
                  target.parentItemId,
            );
            if (after && !siblings.includes(after))
              throw fail(
                400,
                '`after` must be a section with the same parent and subsection.',
              );
            const next = after
              ? siblings[siblings.indexOf(after) + 1]
              : siblings[0];
            const moved =
              offset !== undefined && after === undefined
                ? layout
                : moveBefore(layout, [id], next ?? null);
            if (offset === undefined) return moved;
            return {
              ...moved,
              customCss: applySelectionStyle(
                moved.customCss || '',
                `[data-layer-id="${id}"]`,
                'translate',
                `${offset.x}px ${offset.y}px`,
                scope,
              ),
            };
          });
          seen(slug, id);
          return {
            ok: true,
            id,
            ...(offset !== undefined
              ? {
                  offset,
                  scope,
                  positioning: 'visual offset; surrounding layout preserved',
                }
              : {}),
          };
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
          "Style one element without rewriting the page CSS. `selector` must come from get_page (an element's selector, a section's selector or selectors.heading/body). `styles` maps CSS properties to values; allowed properties: font-family, font-size, font-weight, font-style, color, text-align, line-height, letter-spacing, background-color, border-radius, padding, object-fit, display, rotate, translate, width, max-width, height, max-height, box-sizing. For an image use its exact img selector, width, height:auto and max-height:none; use update_section zIndex on the image layer to stack it. To resize a nested text box, set width and max-width:100% on its exact selector; text reflows without resizing its section. `scope` limits the change to tablet (≤1000px) or mobile (≤760px) screens.",
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
      set_page_sidebar: {
        description:
          'Enable or disable the page section index. Works with Blank content, including projects whose appearance was changed to Luca. Keeps all content, images, section settings, CSS and the selected template. Read get_page first and pass its version.',
        annotations: {
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
        inputSchema: {
          type: 'object',
          properties: {
            page: { type: 'string' },
            enabled: { type: 'boolean' },
            ifVersion: {
              type: 'integer',
              minimum: 0,
              description: 'Current layout version from get_page.',
            },
          },
          required: ['page', 'enabled', 'ifVersion'],
          additionalProperties: false,
        },
        run(args) {
          const slug = page(args.page);
          if (
            Object.keys(args).some(
              (key) => !['page', 'enabled', 'ifVersion'].includes(key),
            ) ||
            typeof args.enabled !== 'boolean' ||
            !Number.isInteger(args.ifVersion) ||
            args.ifVersion < 0
          )
            throw fail(
              400,
              'Provide page, boolean enabled, and integer ifVersion from get_page.',
            );
          writeLayout(slug, (layout, version) => {
            if (version !== args.ifVersion)
              throw fail(
                409,
                'Conflict: the page changed. Call get_page and retry with its version.',
              );
            return { ...layout, sidebar: args.enabled };
          });
          seen(slug);
          return {
            ok: true,
            page: slug,
            sidebar: args.enabled,
            version: readLayout(project, slug).version,
          };
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
      duplicate_page: {
        description:
          'Duplicate a saved page into a new independent page. Copies layout, text, images and custom CSS, sharing media files. Does not copy unsaved editor drafts. Standard access is sufficient; no developer link required.',
        inputSchema: {
          type: 'object',
          properties: {
            source: { type: 'string' },
            title: { type: 'string' },
            slug: { type: 'string' },
            sourceVersion: { type: 'integer' },
          },
          required: ['source', 'title', 'slug'],
        },
        run({ source, title, slug, sourceVersion }) {
          scopedOnly();
          page(source);
          const result = createCustomPage(
            project,
            { source, title, slug, sourceVersion },
            author,
          );
          live.changed(project.id, result.ids, '');
          seen(slug);
          return { ok: true, page: result.page };
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
    if (link.mode === 'developer' && link.approved_at && !link.page) {
      const sourceOwner = {
        id: link.id,
        name: link.name,
        approvedBy: link.created_by,
        expiresAt: link.expires_at,
      };
      const readonly = {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      };
      const sourcePath = {
        type: 'string',
        description:
          'Exact relative path in list_source_files. New components belong under app/project-components/ or components/project/.',
      };
      const leaseProperties = {
        path: sourcePath,
        lockToken: {
          type: 'string',
          description:
            'Private lease token from acquire_source_lock; never use another editor’s token.',
        },
      };
      const duration = {
        type: 'integer',
        minimum: 30,
        maximum: 900,
        default: 300,
        description:
          'Lease duration in seconds; capped at the MCP link expiry.',
      };
      const writeProperties = {
        ...leaseProperties,
        ifVersion: { type: 'integer' },
        ifBaseHash: { type: 'string' },
      };
      Object.assign(tools, {
        get_source_status: {
          description:
            'Read current source editing reservations: lock owner (connection and agent label), expiry, and latest saved revision/author/time. Optional path gives one file; omit for all active project locks and modified files. Lock status is current at request time, not a push subscription. No lease tokens are exposed.',
          annotations: readonly,
          inputSchema: { type: 'object', properties: { path: sourcePath } },
          run: (args) => projectSource.status(project.id, args.path, link.id),
        },
        acquire_source_lock: {
          description:
            'Reserve one editable source file before any write, replacement or restore. Default 5 minutes, maximum 15 minutes, automatically expires. Fails if already held, even by another agent on this link. Returns a private lockToken. Read again after acquiring, renew before expiry, and release when finished. Do not reserve unrelated files.',
          inputSchema: {
            type: 'object',
            properties: {
              path: sourcePath,
              ttlSeconds: duration,
              editorName: {
                type: 'string',
                description:
                  'Short agent/developer label shown alongside the authenticated link owner; this label is self-reported.',
              },
            },
            required: ['path'],
          },
          run: (args) => projectSource.acquire(project.id, sourceOwner, args),
        },
        renew_source_lock: {
          description:
            'Extend your still-active source lease while working. Requires its token. An expired lease cannot be renewed: acquire a new one and reread the file. Reads and writes do not extend a lease automatically.',
          inputSchema: {
            type: 'object',
            properties: { ...leaseProperties, ttlSeconds: duration },
            required: ['path', 'lockToken'],
          },
          run: (args) => projectSource.renew(project.id, sourceOwner, args),
        },
        release_source_lock: {
          description:
            'Release your source-file reservation when finished or abandoning the edit. Requires its token. Cannot release another editor’s lease.',
          inputSchema: {
            type: 'object',
            properties: leaseProperties,
            required: ['path', 'lockToken'],
          },
          run: (args) => projectSource.release(project.id, sourceOwner, args),
        },
        list_source_files: {
          description:
            'Developer only: list this wiki’s release source and project overrides, including editable flags, versions, last saved author/time, conflicts, and per-file lock owner/expiry. ' +
            sourceNotice,
          annotations: readonly,
          inputSchema: { type: 'object', properties: {} },
          run: () => ({
            files: projectSource.list(project.id, link.id),
            notice: sourceNotice,
          }),
        },
        read_source_file: {
          description:
            'Read template/component source with version and baseHash required for edits. Paginated by lines and character offset for large generated JSON. A new component path returns exists=false with creation version/hash.',
          annotations: readonly,
          inputSchema: {
            type: 'object',
            properties: {
              path: sourcePath,
              startLine: { type: 'integer' },
              lineCount: { type: 'integer', maximum: 500 },
              offset: { type: 'integer' },
            },
            required: ['path'],
          },
          run: (args) => projectSource.read(project.id, args, link.id),
        },
        write_source_file: {
          description:
            'Save a complete project-specific template/component file. Read first; never overwrite unread content. Source edits affect exported builds and Studio Design/Preview. Revisions are retained for rollback. No server execution or filesystem access.',
          inputSchema: {
            type: 'object',
            properties: { ...writeProperties, content: { type: 'string' } },
            required: [
              'path',
              'content',
              'ifVersion',
              'ifBaseHash',
              'lockToken',
            ],
          },
          run: (args) =>
            projectSource.write(project.id, author, args, sourceOwner),
        },
        replace_source_text: {
          description:
            'Replace one exact, unique text match in a source file. Useful for large template JSON and small component fixes. Requires the latest version/baseHash. Does not execute code or update live Studio.',
          inputSchema: {
            type: 'object',
            properties: {
              ...writeProperties,
              oldText: { type: 'string' },
              newText: { type: 'string' },
            },
            required: [
              'path',
              'oldText',
              'newText',
              'ifVersion',
              'ifBaseHash',
              'lockToken',
            ],
          },
          run: (args) =>
            projectSource.replace(project.id, author, args, sourceOwner),
        },
        get_source_history: {
          description:
            'List the last 20 saved revisions of one project source file. Version 0 always restores the installed release (or removes a newly added component).',
          annotations: readonly,
          inputSchema: {
            type: 'object',
            properties: { path: sourcePath },
            required: ['path'],
          },
          run: (args) => ({
            revisions: projectSource.history(project.id, args.path),
          }),
        },
        restore_source_file: {
          description:
            'Restore a previous source revision, or targetVersion=0 to use the installed release again. Creates a new version and preserves the outgoing revision. Requires latest version/baseHash.',
          inputSchema: {
            type: 'object',
            properties: {
              ...writeProperties,
              targetVersion: { type: 'integer', minimum: 0 },
            },
            required: [
              'path',
              'targetVersion',
              'ifVersion',
              'ifBaseHash',
              'lockToken',
            ],
          },
          run: (args) =>
            projectSource.restore(project.id, author, args, sourceOwner),
        },
      });
    }
    const instructions = [
      baseRules,
      'Visitor loading animations are configurable through get_loading_animation and update_loading_animation with standard whole-project access. These settings are included in future exports; no source edit or browser workaround is needed. Read the current version before saving and use the real uploaded image URL.',
      link.mode === 'developer'
        ? 'Developer access approved by the user. Start with get_source_status and list_source_files. Before each source edit, acquire_source_lock, then read_source_file; pass lockToken, ifVersion and ifBaseHash on write/replace/restore. Renew the lease before expiry while working, and release it when done. If locked by someone else, report the owner/expiry and work on a different file; do not repeatedly retry or overwrite. Separate developers should use separate named links. ' +
          sourceNotice
        : 'Standard access: source tools are unavailable. Only a person in the authenticated editor can approve a separate Developer link.',
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
    return { tools, instructions, prompts, saveSectionCode };
  }

  function rpcResult(id, result) {
    return { jsonrpc: '2.0', id, result };
  }
  function rpcError(id, code, message) {
    return { jsonrpc: '2.0', id: id ?? null, error: { code, message } };
  }
  async function answer(message, { tools, instructions, prompts }) {
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
          version: '1.1.0',
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
          ...(tool.annotations ? { annotations: tool.annotations } : {}),
        })),
      });
    if (method === 'tools/call') {
      const tool = tools[params?.name];
      if (!tool) return rpcError(id, -32602, 'Unknown tool: ' + params?.name);
      try {
        const output = await tool.run(params.arguments || {});
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
              text: error?.details
                ? JSON.stringify({ error: error.message, ...error.details })
                : error?.status
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
    const codeTicket =
      url.pathname === '/mcp/section-code-upload'
        ? codeUploads.get(url.searchParams.get('upload'))
        : null;
    const credentialHash =
      url.pathname === '/mcp/section-code-upload'
        ? codeTicket?.linkHash
        : token && hash(token);
    const link = credentialHash && byHash.get(credentialHash, Date.now());
    if (!link || !projects.has(link.project_id))
      return reply(401, {
        error:
          'This AI link is invalid, expired or revoked. Ask your team for a new link.',
      });
    if (limited(link.id))
      return reply(429, { error: 'Too many requests. Slow down and retry.' });
    if (url.pathname === '/mcp/section-code-upload') {
      if (req.method !== 'POST')
        return reply(405, { error: 'Use POST with raw UTF-8 file bytes.' });
      try {
        const result = await codeUploads.receive(
          req,
          codeTicket,
          (args, content) => {
            // Recheck authorization after the body arrives; a link can be revoked mid-upload.
            const current = byHash.get(codeTicket.linkHash, Date.now());
            if (!current || !projects.has(current.project_id))
              throw fail(
                401,
                'This AI link expired or was revoked. Nothing was saved.',
              );
            return session(current, '').saveSectionCode(args, () => content);
          },
        );
        touch.run(Date.now(), link.id);
        return reply(200, result);
      } catch (error) {
        req.resume();
        return reply(error.status || 500, {
          error: error.status
            ? error.message
            : 'Code upload failed. Nothing was saved.',
        });
      }
    }
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
        rpcError(
          null,
          error.status === 413 ? -32600 : -32700,
          error.status === 413
            ? 'MCP JSON requests are limited to 4 MiB. Custom component file uploads are limited to 128 KiB; use get_section_code_upload_url for actual file bytes. Use upload_media_chunk with at most 512 KiB of decoded file bytes per call, or get_media_upload_url.'
            : 'Parse error',
        ),
      );
    }
    const current = session(link, token);
    if (Array.isArray(message)) {
      const answers = [];
      for (const m of message) {
        const response = await answer(m, current);
        if (response) answers.push(response);
      }
      return answers.length ? reply(200, answers) : reply(202);
    }
    const response = await answer(message, current);
    return response ? reply(200, response) : reply(202);
  }

  return { handle, links };
}
