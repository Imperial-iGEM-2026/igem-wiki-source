import { copyFieldDefaults, copyFieldId } from './shared.mjs';
import { createExportJobs } from './export-jobs.mjs';
import { createBundleExports } from './export-bundles.mjs';
import { createProjectSource } from './project-source.mjs';
import { createProjects } from './projects.mjs';
import { createTemplateChanges } from './template-changes.mjs';
import { createChatHistory } from './chat-history.mjs';
import { isDeepStrictEqual } from 'node:util';
import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdir, stat, open, unlink } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  createPageAssistant,
  allowedPageField,
  validatePageProposal,
} from './ai-page.mjs';
import { loadAiImages } from './ai-images.mjs';
import { createCssAssistant } from './ai-css.mjs';
import { createMediaGateway } from './media-gateway.mjs';
import { createLiveHub } from './live.mjs';
import { createMcp } from './mcp.mjs';
import {
  CUSTOM_PAGES,
  resolveContentRows,
  LAYOUT_WRITE_PROTOCOL,
  REMOVED_PAGES,
  parseRemovedPages,
  parseCustomPages,
  SITE_MENU,
  validMenu,
  extractChrome,
  applyChrome,
  sameChrome,
  cssError,
  customDefaults,
  validCustomPage,
  customWikiPage,
  initial,
  templates,
  templateDefaults,
  wikiPages,
  validateLayout,
  validHeader,
  linkAllowed,
  nodeLocked,
  parseAccessConfig,
  verifyAccessToken,
  mediaTypes,
  matchesMedia,
} from './shared.mjs';

export async function createAppServer({
  dataDir,
  clientDir,
  environment,
  keyOverride,
  aiFetch,
  codexRunner,
}) {
  const config = parseAccessConfig(environment);
  if (!config)
    throw Error(
      'Set CF_ACCESS_TEAM_DOMAIN, CF_ACCESS_AUD and CF_ACCESS_ORIGIN. The server will not start without verified Access configuration.',
    );
  await mkdir(path.join(dataDir, 'media'), { recursive: true });
  const db = new DatabaseSync(path.join(dataDir, 'wiki.sqlite'));
  db.exec(
    'PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS blocks (id TEXT PRIMARY KEY,value TEXT NOT NULL,version INTEGER NOT NULL,author TEXT NOT NULL); CREATE TABLE IF NOT EXISTS presence (id TEXT PRIMARY KEY,name TEXT NOT NULL,seen INTEGER NOT NULL);',
  );
  const assistant = createCssAssistant({ environment, db, fetchImpl: aiFetch });
  const pageAssistant = environment.CODEX_SOCKET
    ? createPageAssistant({
        environment,
        db,
        runner: codexRunner,
        loadImages: (images) => loadAiImages(dataDir, images),
      })
    : null;
  const projects = createProjects(db);
  const templateChanges = createTemplateChanges(db, projects);
  const chatHistory = createChatHistory(db);
  const projectSource = createProjectSource({ db });
  const bundleExports = createBundleExports({
    dataDir,
    clientDir,
    projectSource,
    assetOrigins: [config.origin, environment.MEDIA_ORIGIN],
  });
  const exportJobs = createExportJobs({
    prepare: (args) => bundleExports.prepare(args),
  });
  const json = (res, status, body) => {
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(JSON.stringify(body));
  };
  const fail = (status, message) =>
    Object.assign(new Error(message), { status });
  async function readJSON(req) {
    let total = 0;
    const chunks = [];
    for await (const chunk of req) {
      total += chunk.length;
      if (total > 4 * 1024 * 1024) throw fail(413, 'Request too large');
      chunks.push(chunk);
    }
    try {
      return JSON.parse(Buffer.concat(chunks));
    } catch {
      throw fail(400, 'Invalid JSON');
    }
  }
  async function file(req, res, filename, type, cacheSeconds = 0) {
    let meta;
    try {
      meta = await stat(filename);
    } catch {
      throw fail(404, 'File not found');
    }
    if (!meta.isFile()) throw fail(404, 'File not found');
    const cacheControl =
      cacheSeconds > 0
        ? `private, max-age=${Math.min(600, cacheSeconds)}, must-revalidate`
        : 'private, no-store';
    const etag =
      '"' +
      meta.size.toString(16) +
      '-' +
      Math.trunc(meta.mtimeMs).toString(16) +
      '"';
    if (cacheSeconds > 0 && req.headers['if-none-match'] === etag) {
      res.writeHead(304, { 'Cache-Control': cacheControl, ETag: etag });
      return res.end();
    }
    let start = 0,
      end = meta.size - 1;
    if (req.headers.range) {
      const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
      if (!m || (!m[1] && !m[2])) {
        res.writeHead(416, { 'Content-Range': `bytes */${meta.size}` });
        return res.end();
      }
      start = m[1] ? Number(m[1]) : Math.max(0, meta.size - Number(m[2]));
      end = m[1] ? (m[2] ? Math.min(end, Number(m[2])) : end) : end;
      if (
        !Number.isSafeInteger(start) ||
        !Number.isSafeInteger(end) ||
        start > end ||
        start >= meta.size
      ) {
        res.writeHead(416, { 'Content-Range': `bytes */${meta.size}` });
        return res.end();
      }
    }
    res.writeHead(req.headers.range ? 206 : 200, {
      'Content-Type': type,
      'Content-Length': Math.max(0, end - start + 1),
      'Cache-Control': cacheControl,
      ...(cacheSeconds > 0 ? { ETag: etag } : {}),
      'X-Content-Type-Options': 'nosniff',
      'Accept-Ranges': 'bytes',
      ...(req.headers.range
        ? { 'Content-Range': `bytes ${start}-${end}/${meta.size}` }
        : {}),
    });
    if (req.method === 'HEAD' || meta.size === 0) return res.end();
    const stream = createReadStream(filename, { start, end });
    stream.on('error', () => res.destroy());
    res.on('close', () => stream.destroy());
    stream.pipe(res);
  }
  let uploads = 0;
  const media = environment.MEDIA_ORIGIN
    ? await createMediaGateway({
        origin: environment.MEDIA_ORIGIN,
        editorOrigin: config.origin,
        dataDir,
        db,
        file,
        json,
        fail,
        environment,
      })
    : null;
  function projectContext(projectId) {
    const store = projects.scope(projectId);
    const registry = () => store.select.get(CUSTOM_PAGES)?.value || '[]';
    const templateId = projects.templateId(projectId);
    const allCorePages = templateId
      ? templates[templateId].pages.filter((p) => p.slug !== 'home')
      : wikiPages;
    const removedPages = () =>
      templateId
        ? parseRemovedPages(store.select.get(REMOVED_PAGES)?.value)
        : [];
    const corePages = () => {
      const removed = new Set(removedPages());
      return allCorePages.filter((p) => !removed.has(p.slug));
    };
    const defaults = () => ({
      ...(templateId ? templateDefaults(templateId) : initial),
      ...customDefaults(registry()),
    });
    const destinations = () =>
      new Set([
        '/',
        ...corePages().map((p) => '/' + p.slug),
        ...parseCustomPages(registry()).map((p) => '/' + p.slug),
      ]);
    return {
      ...store,
      id: projectId,
      registry,
      templateId,
      allCorePages,
      removedPages,
      // Pages currently in the project (deleted template pages excluded).
      get corePages() {
        return corePages();
      },
      defaults,
      destinations,
    };
  }
  const brokenLink = (href, destinations) =>
    Boolean(href) && !linkAllowed(href, destinations);
  function checkLayout(project, layout) {
    if (!validateLayout(layout)) throw fail(400, 'Invalid layout');
    const destinations = project.destinations();
    if (
      layout.nodes.some(
        (n) =>
          brokenLink(n.linkTo, destinations) ||
          Object.values(n.links || {}).some((href) =>
            brokenLink(href, destinations),
          ),
      )
    )
      throw fail(400, 'A linked page does not exist.');
  }
  function createCustomPage(project, body, author) {
    const { select, insert, update } = project;
    if (!validCustomPage(body))
      throw fail(
        400,
        'Use a title up to 100 characters and a unique lowercase page address (letters, numbers and hyphens).',
      );
    db.exec('BEGIN IMMEDIATE');
    try {
      const previous = select.get(CUSTOM_PAGES),
        list = parseCustomPages(previous?.value || '[]');
      if (list.length >= 50)
        throw fail(400, 'This workspace supports 50 custom pages.');
      if ([...project.allCorePages, ...list].some((p) => p.slug === body.slug))
        throw fail(409, 'A page already uses this address.');
      const source = body.source;
      let copiedLayout, sourceCopy;
      if (source !== undefined) {
        if (
          typeof source !== 'string' ||
          !Object.hasOwn(project.defaults(), 'layout:' + source) ||
          parseRemovedPages(select.get(REMOVED_PAGES)?.value || '[]').includes(
            source,
          )
        )
          throw fail(404, 'The page to duplicate does not exist.');
        const sourceRow = select.get('layout:' + source);
        if (
          body.sourceVersion !== undefined &&
          body.sourceVersion !== (sourceRow?.version || 0)
        )
          throw fail(409, 'This page changed. Reload it before duplicating.');
        copiedLayout = parseLayout(
          sourceRow?.value ?? project.defaults()['layout:' + source],
        );
        if (!copiedLayout)
          throw fail(
            422,
            'The source layout could not be read. No copy was created.',
          );
        sourceCopy = list.find((p) => p.slug === source);
      }
      const sourcePage =
        sourceCopy?.sourcePage ||
        (source &&
        templates[project.templateId]?.pages.some((p) => p.slug === source)
          ? source
          : undefined);
      const page = {
        slug: body.slug,
        title: body.title.trim(),
        ...(sourcePage
          ? {
              sourcePage,
              sourceTemplate: sourceCopy?.sourceTemplate || project.templateId,
            }
          : {}),
      };
      const value = JSON.stringify([...list, page]);
      if (previous) update.run(value, author, CUSTOM_PAGES, previous.version);
      else insert.run(CUSTOM_PAGES, value, author);
      const fields = customDefaults(JSON.stringify([page]));
      if (copiedLayout) {
        fields['layout:' + page.slug] = JSON.stringify(copiedLayout);
        const defaults = project.defaults();
        for (const [key, value] of Object.entries(defaults)) {
          if (key.startsWith(source + ':') && key !== source + ':title')
            fields[page.slug + key.slice(source.length)] =
              select.get(key)?.value ?? value;
        }
        for (const key of Object.keys(copyFieldDefaults(page))) {
          const original = key.slice(('copy:' + page.slug + ':').length);
          const from = sourceCopy?.sourcePage
            ? copyFieldId(source, original)
            : original;
          fields[key] =
            select.get(from)?.value ?? defaults[from] ?? fields[key];
        }
      }
      // A page recreated at a deleted address starts fresh.
      for (const [id, value] of Object.entries(fields)) {
        project.erase.run(id);
        insert.run(
          id,
          id.startsWith('layout:') ? withSharedChrome(project, value) : value,
          author,
        );
      }
      db.exec('COMMIT');
      const ids = [CUSTOM_PAGES, ...Object.keys(fields)];
      return {
        page: customWikiPage(page),
        ids,
        rows: ids.map((id) => ({ id, ...select.get(id) })),
      };
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
  // Removes links that now point nowhere, so later saves of other pages and
  // the header keep validating.
  function dropBrokenLinks(project, author, ids) {
    const { rows, update } = project;
    const destinations = project.destinations();
    for (const row of rows.all()) {
      let next;
      if (row.id.startsWith('layout:')) {
        const layout = JSON.parse(row.value);
        next = {
          ...layout,
          nodes: layout.nodes.map((n) => {
            const node = { ...n };
            // Buttons stay as plain labels once their destination is gone.
            if (brokenLink(node.linkTo, destinations)) delete node.linkTo;
            if (node.links)
              node.links = Object.fromEntries(
                Object.entries(node.links).filter(
                  ([, href]) => !brokenLink(href, destinations),
                ),
              );
            return node;
          }),
        };
      } else if (row.id === 'site:header') {
        const header = JSON.parse(row.value);
        next = {
          ...header,
          ...(brokenLink(header.brandHref, destinations)
            ? { brandHref: '/' }
            : {}),
          ...(Array.isArray(header.links)
            ? {
                links: header.links.filter(
                  (link) => !brokenLink(link.href, destinations),
                ),
              }
            : {}),
        };
      } else continue;
      const value = JSON.stringify(next);
      if (value !== JSON.stringify(JSON.parse(row.value))) {
        update.run(value, author, row.id, row.version);
        ids.push(row.id);
      }
    }
  }
  const parseLayout = (value) => {
    try {
      const layout = JSON.parse(value);
      return validateLayout(layout) ? layout : null;
    } catch {
      return null;
    }
  };
  // Header and footer are shared by every page of a template project: after a
  // page saves a different header/footer, copy it to every other page.
  function syncChrome(project, fromId, before, after, author, force = false) {
    if (!project.templateId || !after) return [];
    const chrome = extractChrome(after);
    if (!force && !chrome.nodes.length) return [];
    if (!force && before && sameChrome(extractChrome(before), chrome))
      return [];
    const ids = [];
    const defaults = project.defaults();
    for (const id of Object.keys(defaults)) {
      if (!id.startsWith('layout:') || id === fromId) continue;
      const row = project.select.get(id);
      const layout = parseLayout(row?.value ?? defaults[id]);
      if (!layout) continue;
      const next = applyChrome(layout, chrome);
      const value = JSON.stringify(next);
      if (
        value === JSON.stringify(layout) ||
        !validateLayout(next) ||
        cssError(next.customCss || '')
      )
        continue;
      const result = row
        ? project.update.run(value, author, id, row.version)
        : project.insert.run(id, value, author);
      if (result.changes) ids.push(id);
    }
    return ids;
  }
  // New or restored pages start with the project's current header/footer.
  function withSharedChrome(project, value) {
    const home = parseLayout(project.select.get('layout:home')?.value || '');
    const layout = parseLayout(value);
    if (!project.templateId || !home || !layout) return value;
    const chrome = extractChrome(home);
    return chrome.nodes.length
      ? JSON.stringify(applyChrome(layout, chrome))
      : value;
  }
  const rowsFor = (project, ids) =>
    ids.map((id) => ({
      id,
      ...(project.select.get(id) || {
        value: project.defaults()[id] ?? '',
        version: 0,
        author: '',
      }),
    }));
  function writeRemoved(project, next, author) {
    const previous = project.select.get(REMOVED_PAGES);
    const value = JSON.stringify(next);
    if (previous)
      project.update.run(value, author, REMOVED_PAGES, previous.version);
    else project.insert.run(REMOVED_PAGES, value, author);
  }
  // Custom pages are removed with their content. Template pages are hidden for
  // this project and their saved edits discarded; they can be restored later.
  function deletePage(project, slug, author) {
    const { select, update, erase, rows } = project;
    db.exec('BEGIN IMMEDIATE');
    try {
      const previous = select.get(CUSTOM_PAGES),
        list = parseCustomPages(previous?.value || '[]'),
        page = list.find((p) => p.slug === slug);
      const ids = [];
      if (page && previous) {
        update.run(
          JSON.stringify(list.filter((p) => p.slug !== slug)),
          author,
          CUSTOM_PAGES,
          previous.version,
        );
        const removed = Object.keys(customDefaults(JSON.stringify([page])));
        for (const id of removed) erase.run(id);
        ids.push(CUSTOM_PAGES, ...removed);
      } else if (
        project.templateId &&
        slug !== 'home' &&
        project.corePages.some((p) => p.slug === slug)
      ) {
        writeRemoved(project, [...project.removedPages(), slug], author);
        const saved = rows
          .all()
          .map((row) => row.id)
          .filter(
            (id) =>
              id === 'layout:' + slug ||
              id === slug + ':title' ||
              id === slug + ':summary' ||
              id.startsWith('template:' + slug + ':'),
          );
        for (const id of saved) erase.run(id);
        ids.push(REMOVED_PAGES, ...saved);
      } else
        throw fail(
          404,
          slug === 'home'
            ? 'The home page cannot be deleted.'
            : 'This page no longer exists.',
        );
      dropBrokenLinks(project, author, ids);
      db.exec('COMMIT');
      return { ids, rows: rowsFor(project, ids) };
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
  function restorePage(project, slug, author) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const removed = project.removedPages();
      if (!removed.includes(slug))
        throw fail(404, 'This template page is not deleted.');
      if (parseCustomPages(project.registry()).some((p) => p.slug === slug))
        throw fail(409, 'A page you created now uses this address.');
      writeRemoved(
        project,
        removed.filter((s) => s !== slug),
        author,
      );
      const layoutId = 'layout:' + slug;
      const ids = [REMOVED_PAGES];
      if (!project.select.get(layoutId)) {
        project.insert.run(
          layoutId,
          withSharedChrome(project, project.defaults()[layoutId]),
          author,
        );
        ids.push(layoutId);
      }
      db.exec('COMMIT');
      return { ids, rows: rowsFor(project, ids) };
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
  const live = createLiveHub();
  const mcp = createMcp({
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
    // Served from the media hostname by default: it is outside Cloudflare
    // Access, and the link's secret key authorises each request instead.
    publicOrigin:
      environment.MCP_ORIGIN || environment.MEDIA_ORIGIN || config.origin,
    clientDir,
    file,
    mediaReadURL: media ? (key, user) => media.readURL(key, user) : null,
    mediaUploadURL: media
      ? (body, user) => media.issueUpload(body, user)
      : null,
    mediaUploadOrigin: config.origin,
    environment,
    dataDir,
  });
  const changed = (req, projectId, ids) =>
    live.changed(projectId, ids, req.headers['x-prion-client']);
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, config.origin),
        pathname = decodeURIComponent(url.pathname);
      res.setHeader('Referrer-Policy', 'no-referrer');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader(
        'Permissions-Policy',
        'camera=(), microphone=(), geolocation=()',
      );
      if (pathname === '/mcp' || pathname.startsWith('/mcp/'))
        return await mcp.handle(req, res, url);
      // AI previews on the media hostname need the public site bundle.
      if (
        media &&
        req.headers.host === media.host &&
        ['GET', 'HEAD'].includes(req.method) &&
        /^\/(assets|templates)\/[a-zA-Z0-9_./-]+$|^\/prion-hero\.png$/.test(
          pathname,
        ) &&
        !pathname.includes('..')
      ) {
        const type = {
          js: 'text/javascript',
          mjs: 'text/javascript',
          wasm: 'application/wasm',
          bcmap: 'application/octet-stream',
          pfb: 'application/octet-stream',
          icc: 'application/octet-stream',
          ttf: 'font/ttf',
          otf: 'font/otf',
          css: 'text/css',
          woff2: 'font/woff2',
          svg: 'image/svg+xml',
          png: 'image/png',
          jpg: 'image/jpeg',
          jpeg: 'image/jpeg',
          webp: 'image/webp',
          gif: 'image/gif',
        }[path.extname(pathname).slice(1)];
        if (!type) throw fail(404, 'File not found');
        return await file(req, res, path.join(clientDir, pathname), type, 600);
      }
      if (media && req.headers.host === media.host)
        return await media.handle(req, res, url, pathname);
      if (media && req.headers.host !== new URL(config.origin).host)
        throw fail(421, 'Unknown hostname');
      if (pathname === '/auth/logout') {
        res.writeHead(302, {
          Location: config.origin + '/cdn-cgi/access/logout',
        });
        return res.end();
      }
      let user;
      try {
        const token = req.headers['cf-access-jwt-assertion'];
        if (typeof token === 'string')
          user = await verifyAccessToken(token, config, keyOverride);
      } catch {}
      if (!user) {
        if (
          pathname === '/auth/login' &&
          req.headers.host !== new URL(config.origin).host
        ) {
          res.writeHead(302, { Location: config.origin + '/workspace' });
          return res.end();
        }
        return json(res, 401, {
          error:
            'Cloudflare Access authentication required. Open ' +
            config.origin +
            ' and sign in. Check that the Access policy covers this hostname and allows your account.',
        });
      }
      if (pathname === '/auth/login') {
        res.writeHead(302, { Location: config.origin + '/workspace' });
        return res.end();
      }
      if (!['GET', 'HEAD', 'POST'].includes(req.method))
        return json(res, 405, { error: 'Method not allowed' });
      if (req.method === 'POST' && req.headers.origin !== config.origin)
        return json(res, 403, { error: 'Invalid origin' });
      if (pathname === '/api/session' && req.method === 'GET')
        return json(res, 200, {
          user: { id: user.userId, name: user.displayName },
        });
      if (pathname === '/api/ai/chats') {
        // Ownership comes only from the verified Access identity, never a query/body field.
        if (req.method === 'GET')
          return json(
            res,
            200,
            url.searchParams.has('id')
              ? chatHistory.get(user.userId, url.searchParams.get('id'))
              : {
                  chats: chatHistory.list(
                    user.userId,
                    url.searchParams.get('q') || '',
                  ),
                },
          );
        if (req.method !== 'POST') throw fail(405, 'Method not allowed');
        const body = await readJSON(req);
        if (body?.action === 'delete' || body?.action === 'clear')
          return json(res, 200, chatHistory.remove(user.userId, body));
        const project =
          req.headers['x-prion-project'] ?? projects.list().defaultId;
        if (!projects.has(project)) throw fail(404, 'Project not found.');
        return json(res, 200, chatHistory.save(user.userId, project, body));
      }
      if (pathname === '/api/template-change') {
        if (req.method !== 'POST') throw fail(405, 'Method not allowed');
        const body = await readJSON(req);
        if (typeof body.id !== 'string') throw fail(400, 'Choose a project.');
        if (body.action === 'status')
          return json(res, 200, templateChanges.status(body.id));
        if (body.action === 'preview')
          return json(
            res,
            200,
            templateChanges.preview(body.id, body.templateId, user.userId),
          );
        if (body.action === 'apply' || body.action === 'rollback') {
          const result =
            body.action === 'apply'
              ? templateChanges.apply(body.id, body.token, user.userId)
              : templateChanges.rollback(
                  body.id,
                  body.changeId,
                  body.version,
                  user.userId,
                );
          live.changed(body.id, ['site:appearance'], '');
          return json(res, 200, result);
        }
        throw fail(400, 'Invalid template action.');
      }
      if (pathname === '/api/projects') {
        if (req.method === 'GET') return json(res, 200, projects.list());
        if (req.method !== 'POST') throw fail(405, 'Method not allowed');
        const body = await readJSON(req);
        if (body?.action === 'create') {
          if (
            typeof body.name !== 'string' ||
            !body.name.trim() ||
            body.name.trim().length > 80
          )
            throw fail(400, 'Use a project name between 1 and 80 characters.');
          if (projects.list().projects.length >= 50)
            throw fail(400, 'This server supports up to 50 projects.');
          if (!Object.hasOwn(templates, body.templateId))
            throw fail(400, 'Choose a template or Blank canvas.');
          const id = projects.create(body.name.trim(), body.templateId);
          return json(res, 201, { ...projects.list(), id });
        }
        if (body?.action === 'rename') {
          projects.rename(body.id, body.name);
          return json(res, 200, projects.list());
        }
        if (body?.action === 'delete') {
          projects.remove(body.id, body.replacementId);
          return json(res, 200, projects.list());
        }
        if (body?.action === 'restore') {
          projects.restore(body.id);
          return json(res, 200, projects.list());
        }
        if (body?.action === 'default' && projects.has(body.id)) {
          projects.setDefault(body.id);
          return json(res, 200, projects.list());
        }
        throw fail(400, 'Invalid project request.');
      }
      if (
        req.method === 'POST' &&
        [
          '/api/export/bundles',
          '/api/content',
          '/api/pages',
          '/api/ai/css',
          '/api/ai/page',
          '/api/ai/apply',
          '/api/mcp-links',
        ].includes(pathname) &&
        !req.headers['x-prion-project'] &&
        projects.list().projects.length > 1
      )
        throw fail(
          409,
          'Refresh this editor before saving. Select the project you want to edit.',
        );
      if (pathname === '/upload-helper.zip') {
        res.setHeader(
          'Content-Disposition',
          'attachment; filename="regelerate-upload-helper.zip"',
        );
        return await file(
          req,
          res,
          path.join(clientDir, 'upload-helper.zip'),
          'application/zip',
        );
      }
      if (pathname === '/studio-preview' && req.method === 'GET')
        return await file(
          req,
          res,
          path.join(clientDir, 'preview.html'),
          'text/html; charset=utf-8',
        );
      if (
        (pathname === '/workspace' ||
          (pathname === '/' && !projects.list().projects.length)) &&
        req.method === 'GET'
      )
        return await file(
          req,
          res,
          path.join(clientDir, 'index.html'),
          'text/html; charset=utf-8',
        );
      const requestedProject =
        req.headers['x-prion-project'] ?? url.searchParams.get('project');
      const projectId = requestedProject ?? projects.list().defaultId;
      const globalRoute =
        !pathname.startsWith('/api/') ||
        ['/api/ai/status', '/api/media', '/api/media-ticket'].includes(
          pathname,
        ) ||
        pathname.startsWith('/api/media/');
      if (
        !projects.has(
          projectId,
          globalRoute || (pathname === '/api/export' && req.method === 'GET'),
        )
      )
        throw fail(404, 'Project not found.');
      const project = projectContext(projectId);
      const {
        rows,
        people,
        pulse,
        insert,
        update,
        select,
        registry,
        corePages,
        defaults,
      } = project;
      if (pathname === '/api/mcp-links') {
        if (req.method === 'GET')
          return json(res, 200, { links: mcp.links.list(projectId, user) });
        if (req.method !== 'POST')
          return json(res, 405, { error: 'Method not allowed' });
        const body = await readJSON(req);
        if (body?.action === 'prepare-developer')
          return json(res, 200, mcp.links.prepareDeveloper(projectId, user));
        if (body?.action === 'revoke') {
          mcp.links.revoke(projectId, body.id);
          return json(res, 200, { links: mcp.links.list(projectId, user) });
        }
        if (body?.action === 'reveal')
          return json(res, 200, mcp.links.reveal(projectId, user, body.id));
        return json(res, 201, mcp.links.create(projectId, user, body));
      }
      if (pathname === '/api/live') {
        if (req.method === 'GET') {
          if (
            live.connect(req, res, {
              project: projectId,
              user,
              clientId: url.searchParams.get('clientId'),
              page: url.searchParams.get('page'),
            })
          )
            return;
          throw fail(400, 'Invalid live connection.');
        }
        if (req.method !== 'POST')
          return json(res, 405, { error: 'Method not allowed' });
        return live.update(projectId, user, await readJSON(req))
          ? json(res, 200, { ok: true })
          : json(res, 404, { error: 'Live connection not found.' });
      }
      if (pathname === '/api/ai/status' && req.method === 'GET')
        return json(
          res,
          200,
          pageAssistant ? await pageAssistant.status() : assistant.status(),
        );
      if (
        ['/api/ai/page', '/api/ai/apply'].includes(pathname) &&
        req.method === 'POST'
      ) {
        if (!pageAssistant) throw fail(503, 'Codex is not configured');
        if (req.headers['x-prion-layout-protocol'] !== LAYOUT_WRITE_PROTOCOL)
          throw fail(
            409,
            'This editor tab is out of date. Reload before editing this page. Your saved content has not been changed.',
          );
        const body = await readJSON(req),
          page = body?.page;
        const knownPages = [
          'home',
          ...corePages.map((p) => p.slug),
          ...parseCustomPages(registry()).map((p) => p.slug),
        ];
        if (
          !knownPages.includes(page) ||
          !validateLayout(body.layout) ||
          JSON.stringify({ ...body.layout, customCss: '' }).length >
            1024 * 1024 ||
          !body.fields ||
          typeof body.fields !== 'object' ||
          Array.isArray(body.fields) ||
          Object.keys(body.fields).length > 500 ||
          !Number.isSafeInteger(body.layoutVersion) ||
          body.layoutVersion < 0
        )
          throw fail(400, 'Invalid page context');
        const values = defaults();
        for (const [id, field] of Object.entries(body.fields))
          if (
            !allowedPageField(page, id) ||
            !Object.hasOwn(values, id) ||
            !field ||
            typeof field.value !== 'string' ||
            field.value.length > (id.startsWith('wiki:') ? 12000 : 2000) ||
            !Number.isSafeInteger(field.version) ||
            field.version < 0
          )
            throw fail(400, 'Invalid page text');
        const context = {
          ...body,
          pages: knownPages.map((p) => (p === 'home' ? '/' : '/' + p)),
          target: body.target || null,
        };
        if (
          context.target &&
          (!body.layout.nodes.some((n) => n.id === context.target.layerId) ||
            typeof context.target.selector !== 'string' ||
            !context.target.selector.startsWith(
              `[data-layer-id="${context.target.layerId}"]`,
            ))
        )
          throw fail(400, 'Invalid selected layer');
        if (pathname === '/api/ai/page') {
          if (
            typeof body.prompt !== 'string' ||
            !body.prompt.trim() ||
            body.prompt.length > 4000 ||
            !['low', 'medium', 'high'].includes(body.effort) ||
            !Array.isArray(body.messages) ||
            body.messages.length > 6 ||
            body.messages.some(
              (m) =>
                !['user', 'assistant'].includes(m.role) ||
                typeof m.content !== 'string' ||
                m.content.length > 4000,
            )
          )
            throw fail(400, 'Invalid Codex request');
          const abort = new AbortController();
          const disconnected = () => {
            if (!res.writableEnded) abort.abort();
          };
          res.on('close', disconnected);
          const streaming = req.headers.accept === 'application/x-ndjson';
          const sendEvent = (event) => {
            if (res.destroyed || res.writableEnded) return;
            if (!res.headersSent)
              res.writeHead(200, {
                'Content-Type': 'application/x-ndjson',
                'Cache-Control': 'private, no-store',
                'X-Accel-Buffering': 'no',
              });
            res.write(JSON.stringify(event) + '\n');
          };
          try {
            const result = await pageAssistant.propose(
              context,
              user.userId,
              abort.signal,
              streaming ? sendEvent : undefined,
            );
            if (!streaming) return json(res, 200, result);
            sendEvent({ type: 'result', data: result });
            res.end();
            return;
          } catch (error) {
            if (!streaming || !res.headersSent) throw error;
            sendEvent({
              type: 'error',
              error: error.status
                ? error.message
                : 'AI request failed. Please try again.',
            });
            res.end();
            return;
          } finally {
            res.off('close', disconnected);
          }
        }
        const proposal = validatePageProposal(body.proposal, context);
        db.exec('BEGIN IMMEDIATE');
        try {
          const layoutID = 'layout:' + page,
            previous = select.get(layoutID);
          if ((previous?.version || 0) !== body.layoutVersion)
            throw fail(
              409,
              'This page changed. Generate a new proposal before applying.',
            );
          for (const [id, field] of Object.entries(body.fields))
            if ((select.get(id)?.version || 0) !== field.version)
              throw fail(
                409,
                'Page text changed. Generate a new proposal before applying.',
              );
          const savedLayout = JSON.parse(previous?.value ?? values[layoutID]);
          for (const locked of savedLayout.nodes.filter((n) =>
            nodeLocked(savedLayout, n.id),
          ))
            if (
              !isDeepStrictEqual(
                locked,
                proposal.layout.nodes.find((n) => n.id === locked.id),
              )
            )
              throw fail(
                409,
                'A locked layer changed. Generate a new proposal.',
              );
          const serialized = JSON.stringify(proposal.layout);
          if (previous)
            update.run(
              serialized,
              user.displayName,
              layoutID,
              previous.version,
            );
          else insert.run(layoutID, serialized, user.displayName);
          for (const field of proposal.fields) {
            const old = select.get(field.id);
            if (old)
              update.run(field.value, user.displayName, field.id, old.version);
            else insert.run(field.id, field.value, user.displayName);
          }
          db.exec('COMMIT');
          const synced = syncChrome(
            project,
            layoutID,
            savedLayout,
            proposal.layout,
            user.displayName,
          );
          changed(req, projectId, [
            layoutID,
            ...proposal.fields.map((field) => field.id),
            ...synced,
          ]);
          return json(res, 200, { version: body.layoutVersion + 1 });
        } catch (error) {
          db.exec('ROLLBACK');
          throw error;
        }
      }
      if (pathname === '/api/ai/css' && req.method === 'POST') {
        const body = await readJSON(req),
          abort = new AbortController();
        const disconnect = () => {
          if (!res.writableEnded) abort.abort();
        };
        res.on('close', disconnect);
        try {
          return json(
            res,
            200,
            await assistant.propose(body, user.userId, abort.signal),
          );
        } finally {
          res.off('close', disconnect);
        }
      }
      if (pathname === '/api/media-ticket' && req.method === 'POST') {
        if (!media) throw fail(404, 'Direct media is not configured');
        return json(
          res,
          200,
          await media.issueUpload(await readJSON(req), user),
        );
      }
      if (pathname === '/api/pages' && req.method === 'POST') {
        const body = await readJSON(req);
        if (body?.action === 'sync-chrome') {
          const source = select.get('layout:' + body.page);
          const layout = source && parseLayout(source.value);
          if (!layout) throw fail(404, 'Save this page first, then try again.');
          const ids = syncChrome(
            project,
            'layout:' + body.page,
            null,
            layout,
            user.displayName,
            true,
          );
          changed(req, projectId, ids);
          return json(res, 200, { pages: ids.length });
        }
        if (body?.action === 'restore') {
          const result = restorePage(project, body.slug, user.displayName);
          changed(req, projectId, result.ids);
          return json(res, 200, { rows: result.rows });
        }
        if (body?.action === 'delete') {
          const result = deletePage(project, body.slug, user.displayName);
          changed(req, projectId, result.ids);
          return json(res, 200, { rows: result.rows });
        }
        const result = createCustomPage(project, body, user.displayName);
        changed(req, projectId, result.ids);
        return json(res, 201, { page: result.page, rows: result.rows });
      }
      if (pathname === '/api/export/bundles' && req.method === 'POST') {
        const body = await readJSON(req);
        const values = defaults();
        for (const row of rows.all())
          if (Object.hasOwn(values, row.id)) values[row.id] = row.value;
        const args = {
          userId: user.userId,
          project: projects
            .list()
            .projects.find((entry) => entry.id === projectId),
          values,
          template: templates[values['site:template']],
          team: body.team,
          requiredPages: body.requiredPages,
        };
        if (req.headers.prefer?.includes('respond-async')) {
          res.setHeader('Preference-Applied', 'respond-async');
          return json(res, 202, exportJobs.start(args, body.requestId));
        }
        // Compatibility for older editor tabs; new editors always poll jobs.
        return json(res, 200, await bundleExports.prepare(args));
      }
      const exportJobRoute = /^\/api\/export\/jobs\/([a-f0-9-]{36})$/.exec(
        pathname,
      );
      if (exportJobRoute && req.method === 'GET')
        return json(
          res,
          200,
          exportJobs.get({
            id: exportJobRoute[1],
            userId: user.userId,
            projectId,
          }),
        );

      const bundleRoute =
        /^\/api\/export\/bundles\/([a-f0-9-]{36})\/(source|assets|media)$/.exec(
          pathname,
        );
      if (bundleRoute && req.method === 'GET')
        return await bundleExports.download({
          id: bundleRoute[1],
          key: bundleRoute[2],
          userId: user.userId,
          projectId,
          res,
        });
      if (pathname === '/api/export' && req.method === 'GET') {
        const values = defaults();
        for (const row of rows.all())
          if (Object.hasOwn(values, row.id)) values[row.id] = row.value;
        return json(res, 200, {
          format: 'prion-wiki-snapshot',
          version: 1,
          exportedAt: new Date().toISOString(),
          project: projects.list().projects.find((p) => p.id === projectId),
          values,
        });
      }
      if (pathname === '/api/content') {
        if (req.method === 'GET')
          return json(res, 200, {
            projectId,
            rows: resolveContentRows(defaults(), rows.all()),
            people: people.all(Date.now() - 20000),
          });
        if (req.method !== 'POST')
          return json(res, 405, { error: 'Method not allowed' });
        const body = await readJSON(req);
        if (!body || typeof body !== 'object')
          throw fail(400, 'Invalid content');
        if (body.presence) {
          pulse.run(user.userId, user.displayName, Date.now());
          db.prepare('DELETE FROM project_presence WHERE seen<?').run(
            Date.now() - 86400000,
          );
          db.prepare('DELETE FROM presence WHERE seen<?').run(
            Date.now() - 86400000,
          );
          return json(res, 200, { ok: true });
        }
        const { id, value, version } = body;
        if (
          typeof id !== 'string' ||
          id === CUSTOM_PAGES ||
          id === REMOVED_PAGES ||
          id === 'site:template' ||
          id === 'site:appearance' ||
          !Object.hasOwn(defaults(), id) ||
          typeof value !== 'string' ||
          (!value.trim() &&
            !id.startsWith('template:') &&
            !id.endsWith(':summary') &&
            !['intro', SITE_MENU, 'ai:brief'].includes(id)) ||
          (id.startsWith('layout:')
            ? (() => {
                try {
                  return JSON.stringify({ ...JSON.parse(value), customCss: '' })
                    .length;
                } catch {
                  return Infinity;
                }
              })()
            : value.length) >
            (id === 'site:header' || id === SITE_MENU
              ? 24000
              : id === 'ai:brief'
                ? 8000
                : id.startsWith('layout:')
                  ? 1024 * 1024
                  : id.startsWith('wiki:')
                    ? 12000
                    : 2000) ||
          !Number.isInteger(version) ||
          version < 0
        )
          throw fail(400, 'Invalid content');
        if (id === SITE_MENU && value) {
          let menu;
          try {
            menu = JSON.parse(value);
          } catch {}
          if (!validMenu(menu)) throw fail(400, 'Invalid menu');
        }
        if (id === 'site:header') {
          let header;
          try {
            header = JSON.parse(value);
          } catch {}
          if (!validHeader(header)) throw fail(400, 'Invalid header settings');
          const destinations = new Set([
            '/',
            ...corePages.map((p) => '/' + p.slug),
            ...parseCustomPages(registry()).map((p) => '/' + p.slug),
          ]);
          if (
            (header.brandHref &&
              !linkAllowed(header.brandHref, destinations)) ||
            header.links?.some((link) => !linkAllowed(link.href, destinations))
          )
            throw fail(
              400,
              'A header link points to a page that does not exist in this project.',
            );
        }
        if (id.startsWith('layout:')) {
          if (req.headers['x-prion-layout-protocol'] !== LAYOUT_WRITE_PROTOCOL)
            throw fail(
              409,
              'This editor tab is out of date. Reload before saving this page. Your saved content has not been changed.',
            );
          let layout;
          try {
            layout = JSON.parse(value);
          } catch {}
          checkLayout(project, layout);
        }
        if (
          id === 'order' &&
          !/^(1,2,3|1,3,2|2,1,3|2,3,1|3,1,2|3,2,1)$/.test(value)
        )
          throw fail(400, 'Invalid topic order');
        const before = id.startsWith('layout:') ? select.get(id)?.value : null;
        const result =
          version === 0
            ? insert.run(id, value, user.displayName)
            : update.run(value, user.displayName, id, version);
        if (!result.changes)
          return json(res, 409, {
            error:
              'Someone updated this section. Your draft is kept; review the latest version before saving again.',
          });
        const synced = id.startsWith('layout:')
          ? syncChrome(
              project,
              id,
              before && parseLayout(before),
              parseLayout(value),
              user.displayName,
            )
          : [];
        changed(req, projectId, [id, ...synced]);
        return json(res, 200, select.get(id));
      }
      if (pathname === '/api/media' && req.method === 'POST') {
        if (media)
          throw fail(409, 'Request a direct media upload authorization first.');
        if (uploads >= 2)
          throw fail(
            429,
            'Two uploads are already running. Please retry shortly.',
          );
        const name = (url.searchParams.get('name') || '').slice(0, 180),
          ext = name.split('.').pop().toLowerCase(),
          size = Number(req.headers['content-length']);
        if (!mediaTypes[ext]) throw fail(400, 'Unsupported media type');
        if (!Number.isSafeInteger(size) || size < 16 || size > 25 * 1024 * 1024)
          throw fail(413, 'Upload a file between 16 bytes and 25 MB.');
        const key = randomUUID() + '.' + ext,
          filename = path.join(dataDir, 'media', key);
        let handle,
          total = 0,
          header = Buffer.alloc(0),
          verified = false,
          complete = false;
        uploads++;
        try {
          handle = await open(filename, 'wx');
          for await (const chunk of req) {
            total += chunk.length;
            if (total > size) throw fail(413, 'Upload exceeds declared size');
            if (!verified) {
              header = Buffer.concat([header, chunk]);
              if (header.length < 16) continue;
              if (!matchesMedia(ext, header))
                throw fail(400, 'File contents do not match extension');
              verified = true;
              await handle.writeFile(header);
              header = null;
            } else await handle.writeFile(chunk);
          }
          if (!verified || total !== size) throw fail(400, 'Incomplete upload');
          complete = true;
        } finally {
          await handle?.close();
          if (!complete) await unlink(filename).catch(() => {});
          uploads--;
        }
        return json(res, 200, {
          url: '/api/media/' + key,
          name,
          type: mediaTypes[ext],
          size,
        });
      }
      if (
        pathname.startsWith('/api/media/') &&
        ['GET', 'HEAD'].includes(req.method)
      ) {
        const key = pathname.slice('/api/media/'.length);
        if (!/^[a-f0-9-]+\.[a-z0-9]+$/.test(key))
          throw fail(404, 'File not found');
        if (media) {
          res.writeHead(302, {
            Location: await media.readURL(key, user),
            'Cache-Control': 'private, no-store',
          });
          return res.end();
        }
        return await file(
          req,
          res,
          path.join(dataDir, 'media', key),
          mediaTypes[key.split('.').pop()] || 'application/octet-stream',
        );
      }
      if (pathname.startsWith('/api/')) throw fail(404, 'API route not found');
      if (!['GET', 'HEAD'].includes(req.method))
        throw fail(405, 'Method not allowed');
      const normal = pathname.replace(/\/$/, '') || '/';
      if (
        normal === '/' ||
        [...corePages, ...parseCustomPages(registry())].some(
          (p) => '/' + p.slug === normal,
        )
      )
        return await file(
          req,
          res,
          path.join(clientDir, 'index.html'),
          'text/html; charset=utf-8',
        );
      const filename = path.resolve(clientDir, '.' + pathname);
      if (!filename.startsWith(path.resolve(clientDir) + path.sep))
        throw fail(404, 'File not found');
      const ext = path.extname(filename).slice(1),
        type =
          mediaTypes[ext] ||
          {
            js: 'text/javascript',
            mjs: 'text/javascript',
            wasm: 'application/wasm',
            bcmap: 'application/octet-stream',
            pfb: 'application/octet-stream',
            icc: 'application/octet-stream',
            ttf: 'font/ttf',
            otf: 'font/otf',
            css: 'text/css',
            ico: 'image/x-icon',
            woff2: 'font/woff2',
            svg: 'image/svg+xml',
          }[ext];
      if (!type) throw fail(404, 'File not found');
      await file(
        req,
        res,
        filename,
        type,
        /^\/(assets|templates)\//.test(pathname) ? 600 : 0,
      );
    } catch (error) {
      if (!res.headersSent)
        json(res, error.status || 500, {
          error: error.status ? error.message : 'Server error. Please retry.',
          ...(error.status === 422 && Array.isArray(error.mediaIssues)
            ? { mediaIssues: error.mediaIssues }
            : {}),
        });
      else res.destroy();
    }
  });
  server.requestTimeout = media
    ? Number(environment.MEDIA_UPLOAD_TIMEOUT_SECONDS || 1800) * 1000
    : 60000;
  server.headersTimeout = 15000;
  server.on('close', () => {
    exportJobs.close();
    bundleExports.close();
    db.close();
  });
  // Open event streams would otherwise keep close() waiting forever.
  const close = server.close.bind(server);
  server.close = (callback) => {
    live.closeAll();
    return close(callback);
  };
  return server;
}
