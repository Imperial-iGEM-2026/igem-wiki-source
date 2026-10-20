import { createServer } from 'node:http';
import { createWriteStream } from 'node:fs';
import { readFile, mkdir, writeFile, readdir } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import { randomBytes, randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import {
  extractZip,
  jsonFile,
  putJSON,
  manifest,
  ensureTemplateFonts,
  hostedURL,
  publicationSources,
  readPublicationSource,
  digest,
  verifyRuntimeAsset,
  uploadFolder,
} from './files.mjs';
import { OfficialSites } from './sites.mjs';
import { publicationComplete, publicationTarget } from './gitlab.mjs';
import {
  scanStorage,
  removeStorage,
  confirmCleanup,
  clearDeletedMappings,
  storageAdapter,
} from './cleanup.mjs';
const root = fileURLToPath(new URL('.', import.meta.url));
const helperVersion = (await jsonFile(path.join(root, 'package.json'))).version;
const jobsRoot = path.resolve(
  process.env.HELPER_JOBS_DIR || path.join(root, 'jobs'),
);
await mkdir(jobsRoot, { recursive: true });
const secret = randomBytes(32).toString('hex');
let job = null,
  busy = false,
  events = [],
  proposal = null,
  origin = '';
let activity = { phase: 'idle', message: 'Import your three ZIPs to begin.' },
  cleanup = null;
const log = (text) => {
  activity.message = text;
  events.push({ time: new Date().toLocaleTimeString(), text });
  events = events.slice(-100);
};
const sites = new OfficialSites(log);
const save = () => putJSON(path.join(job.dir, 'state.json'), job);
const respond = (res, status, data) => {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(data));
};
async function bodyJSON(req) {
  let text = '';
  for await (const c of req) {
    text += c;
    if (text.length > 128000) throw Error('Form is too large');
  }
  return JSON.parse(text || '{}');
}
async function receive(req, file) {
  let count = 0;
  await pipeline(
    req,
    new Transform({
      transform(c, e, cb) {
        count += c.length;
        cb(count > 20 * 1024 ** 3 ? Error('File exceeds 20 GiB') : null, c);
      },
    }),
    createWriteStream(file, { flags: 'wx' }),
  );
}
async function sync() {
  const source = path.join(job.dir, 'source'),
    config = await jsonFile(path.join(source, 'publication/config.json'));
  const map = await jsonFile(path.join(source, 'publication/media-map.json'));
  for (const row of job.rows || []) if (row.url) map[row.source] = row.url;
  await putJSON(path.join(source, 'publication/media-map.json'), map);
  let css = [
    ...new Set(
      (job.rows || [])
        .filter((row) => row.fontLicense && row.url)
        .map((row) => row.fontLicense),
    ),
  ]
    .map((license) => '/* ' + license.replaceAll('*/', '* /') + ' */')
    .join('\n');
  for (const row of job.rows || [])
    if (row.fontFamily && row.url)
      css += `@font-face{font-family:${JSON.stringify(row.fontFamily)};font-style:${row.fontStyle === 'italic' ? 'italic' : 'normal'};font-weight:${row.fontWeight};font-display:swap;src:url(${JSON.stringify(row.url)});}\n`;
  if (job.systemFonts)
    css +=
      '/* Team chose local system fonts. */\n:root{--font-sans:Arial,sans-serif;--font-serif:Georgia,serif}body{font-family:Arial,sans-serif}\n';
  if (css) await writeFile(path.join(source, 'publication/fonts.css'), css);
  config.fontCss = css ? 'publication/fonts.css' : '';
  config.attributionUrl = job.attributionUrl || config.attributionUrl;
  await putJSON(path.join(source, 'publication/config.json'), config);
  await save();
}
async function listJobs() {
  return (await readdir(jobsRoot, { withFileTypes: true }))
    .filter((e) => e.isDirectory() && /^[a-f0-9-]{36}$/.test(e.name))
    .map((e) => e.name);
}
async function publicState() {
  const ids = await listJobs();
  const jobLabels = {};
  for (const id of ids) {
    try {
      const saved = await jsonFile(path.join(jobsRoot, id, 'state.json'));
      jobLabels[id] =
        `${saved.team || 'Unfinished import'} · ${(saved.rows || []).filter((r) => r.url).length}/${(saved.rows || []).length} links saved · ${id.slice(0, 8)}`;
    } catch {
      jobLabels[id] = 'Unreadable saved import · ' + id.slice(0, 8);
    }
  }
  return {
    busy,
    version: helperVersion,
    activity,
    cleanup: cleanup && {
      ...cleanup,
      files: cleanup.files.map(({ name, folder }) => ({ name, folder })),
    },
    events,
    jobs: ids,
    jobLabels,
    job: job
      ? {
          id: job.id,
          team: job.team,
          teamId: job.teamId,
          imported: job.imported,
          recordingTodoCount: job.recordingTodoCount || 0,
          rows: (job.rows || []).map((r) => ({
            source: r.source,
            file: r.file,
            url: r.url,
            kind: r.kind,
            attempted: r.attempted,
            processingComplete: r.processingComplete,
            uploadError: r.uploadError,
            fontFamily: r.fontFamily,
            folder: r.folder,
          })),
          attributionUrl: job.attributionUrl,
          systemFonts: job.systemFonts,
          publication: job.publication,
        }
      : null,
    proposal: proposal
      ? {
          files: proposal.actions.map((a) => ({
            path: a.file_path,
            action: a.action,
          })),
          total: proposal.actions.length,
        }
      : null,
  };
}
async function action(name, data) {
  if (name === 'new') {
    cleanup = null;
    activity = { phase: 'idle', message: 'Importing your export ZIPs.' };
    job = {
      id: randomUUID(),
      teamId: String(data.teamId || '6377'),
      imported: [],
      rows: [],
    };
    if (!/^\d{1,8}$/.test(job.teamId))
      throw Error('Enter the numeric iGEM team ID');
    job.dir = path.join(jobsRoot, job.id);
    await mkdir(job.dir);
    proposal = null;
    await save();
    return;
  }
  if (name === 'resume') {
    cleanup = null;
    activity = { phase: 'idle', message: 'Restoring saved progress.' };
    if (!/^[a-f0-9-]{36}$/.test(data.id)) throw Error('Invalid job');
    job = await jsonFile(path.join(jobsRoot, data.id, 'state.json'));
    job.dir = path.join(jobsRoot, data.id);
    if (job.team) {
      await ensureTemplateFonts(path.join(job.dir, 'source'), job.rows);
      await save();
    } else if (['source', 'assets'].every((kind) => job.imported?.includes(kind))) {
      await action('prepare', {});
    }
    log(
      `Resumed ${job.team || 'import'}: ${(job.rows || []).filter((r) => r.url).length} completed uploads saved.`,
    );
    proposal = null;
    return;
  }
  if (!job) throw Error('Import an export first');
  if (name === 'scan-storage') {
    if (!job.team) throw Error('Finish importing your project first.');
    cleanup = null;
    sites.stopped = false;
    cleanup = await scanStorage(storageAdapter(sites), job.teamId, job.team);
    log(
      `Storage preview ready: ${cleanup.files.length} files across the root and ${cleanup.folders} subfolders. Nothing deleted.`,
    );
    return;
  }
  if (name === 'delete-storage') {
    confirmCleanup(cleanup, data, job);
    sites.stopped = false;
    proposal = null;
    await putJSON(path.join(job.dir, 'cleanup-log.json'), cleanup);
    await removeStorage(
      storageAdapter(sites),
      cleanup,
      async (file) => {
        await putJSON(path.join(job.dir, 'cleanup-log.json'), cleanup);
        // Invalidate saved URLs in every local job for this team, so resuming an
        // older import cannot silently reuse links that we just removed.
        for (const id of await listJobs()) {
          const dir = path.join(jobsRoot, id);
          const saved =
            id === job.id ? job : await jsonFile(path.join(dir, 'state.json'));
          if (saved.teamId !== job.teamId || !saved.team) continue;
          const mapFile = path.join(dir, 'source/publication/media-map.json');
          const map = await jsonFile(mapFile);
          if (clearDeletedMappings(saved, map, new Set([file.url]))) {
            await putJSON(mapFile, map);
            await putJSON(path.join(dir, 'state.json'), saved);
          }
        }
        log(
          `Removed ${cleanup.deleted.length} of ${cleanup.files.length}: ${file.name}`,
        );
      },
      () => sites.stopped,
    );
    await sync();
    log(
      `Cleanup complete: ${cleanup.deleted.length} files removed. Empty folders remain. Video Universe and GitLab were not changed.`,
    );
    return;
  }
  if (name === 'prepare') {
    if (!['source', 'assets'].every((k) => job.imported.includes(k)))
      throw Error('Choose the website source and static assets ZIPs.');
    const source = path.join(job.dir, 'source');
    const config = await jsonFile(path.join(source, 'publication/config.json'));
    if (
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(config.teamSlug) ||
      config.repository !== `https://gitlab.igem.org/2026/${config.teamSlug}`
    )
      throw Error('Invalid team repository in export');
    if (
      config.source !== 'publication/content.json' ||
      config.mediaMap !== 'publication/media-map.json' ||
      (config.review && config.review !== 'publication/review.json')
    )
      throw Error('Unsupported publication file paths');
    const content = await readPublicationSource(source);
    job.team = config.teamSlug;
    job.attributionUrl = config.attributionUrl || '';
    job.rows = await manifest(
      source,
      {
        assets: path.join(job.dir, 'assets'),
        media: path.join(job.dir, 'media'),
      },
      await jsonFile(path.join(source, 'publication/media-map.json')),
    );
    const recordingTodos = await jsonFile(
      path.join(source, 'publication/recording-todos.json'),
    ).catch((error) => {
      if (error.code === 'ENOENT') return [];
      throw error;
    });
    job.recordingTodoCount = Array.isArray(recordingTodos)
      ? recordingTodos.length
      : 0;
    await save();
    await ensureTemplateFonts(source, job.rows, content);
    await save();
    log(`Ready: ${job.rows.length} media files for ${job.team}.`);
    return;
  }
  if (name === 'login') {
    await sites.open(data.kind, job.team, job.teamId);
    if (
      data.kind === 'assets' &&
      ['SIGN_IN_REQUIRED', 'STORAGE_ACCESS_REQUIRED'].includes(activity.code)
    )
      log(
        'Complete sign-in in the iGEM Uploads browser window, then return here and click “Check sign-in & scan”.',
      );
    return;
  }
  if (name === 'retry-rejected') {
    const row = job.rows.find((row) => row.source === data.source);
    if (
      !row ||
      row.bundle !== 'assets' ||
      row.url ||
      row.processingComplete ||
      !row.attempted
    )
      throw Error('Only a rejected static upload can be retried');
    row.attempted = false;
    row.rejected = false;
    row.uploadError = '';
    proposal = null;
    await save();
    log('Marked rejected file for retry: ' + row.file);
    return;
  }
  if (name === 'mapping') {
    const row = job.rows.find((r) => r.source === data.source);
    if (!row || !hostedURL(data.url, row.kind))
      throw Error('Use the returned iGEM URL for this file');
    row.url = data.url;
    proposal = null;
    await sync();
    return;
  }
  if (name === 'upload') {
    sites.stopped = false;
    const uploadJob = job;
    const saveUpload = () =>
      putJSON(path.join(uploadJob.dir, 'state.json'), uploadJob);
    proposal = null;
    const assets = job.rows.filter(
      (row) => row.bundle === 'assets' && !row.url && row.localFile,
    );
    const folders = new Map();
    for (const row of assets) {
      const folder = uploadFolder(row);
      if (!folders.has(folder)) folders.set(folder, []);
      folders.get(folder).push(row);
    }
    for (const [folder, rows] of folders) {
      await sites.assetFolder(job.teamId, folder);
      for (let index = 0; index < rows.length; index += 5) {
        const batch = rows.slice(index, index + 5);
        log(
          `Uploading ${folder || 'existing root folder'} · batch ${Math.floor(index / 5) + 1}: ${batch.length} files.`,
        );
        try {
          await sites.assetBatch(batch, job.dir, job.teamId, saveUpload);
        } finally {
          await sync();
        }
      }
    }
    for (const row of job.rows) {
      if (sites.stopped) throw Error('Paused. Completed uploads are saved.');
      if (row.url) continue;
      if (!row.localFile) {
        log('External file needs a local original: ' + row.source);
        continue;
      }
      if (row.bundle === 'assets') continue;
      log('Uploading ' + path.basename(row.file));
      row.url = await sites.video(row, job.dir, saveUpload);
      if (!hostedURL(row.url, row.kind)) {
        row.url = '';
        throw Error('Uploader returned an invalid iGEM URL');
      }
      await sync();
      log('URL captured: ' + row.url);
      if (row.bundle === 'media') {
        log(
          'Finish this recording’s metadata in Video Universe before opening Publish for the next file. Then click Upload / check remaining files.',
        );
        return;
      }
    }
    log(
      'Upload pass complete. Video moderation and metadata still need review.',
    );
    return;
  }
  if (name === 'review') {
    proposal = null;
    job.systemFonts = data.systemFonts === true;
    if (
      data.attributionUrl &&
      !/^https:\/\/teams\.igem\.org\/wiki\/\d+\/attributions$/.test(
        data.attributionUrl || '',
      )
    )
      throw Error('Use your official iGEM attribution embed URL.');
    job.attributionUrl = data.attributionUrl;
    await sync();
    const missing = job.rows.filter((r) => !hostedURL(r.url, r.kind));
    if (missing.length)
      throw Error(
        `${missing.length} files still need uploaded iGEM URLs. Complete uploads or attach their local originals.`,
      );
    for (const row of job.rows.filter((item) => item.kind === 'runtime')) {
      log('Checking uploaded JavaScript type, CORS and exact file contents…');
      await verifyRuntimeAsset(row);
    }
    proposal = await sites.plan(
      job.team,
      await publicationSources(path.join(job.dir, 'source')),
    );
    log(
      `Review ready: ${proposal.actions.length} source changes, including the current publishing configuration where needed. Merge the request into main to publish; uploading a branch alone does not update the website.`,
    );
    return;
  }
  if (name === 'publish') {
    if (!proposal) throw Error('Check the source changes first.');
    if (publicationComplete(job.publication))
      throw Error('This upload is complete. Open its GitLab review link.');
    const target = publicationTarget(proposal, 'wiki-upload-' + job.id, job.publication);
    if (target.replacedBranch)
      log(`The reviewed source changed. Starting ${target.branch}; the earlier incomplete branch ${target.replacedBranch} is preserved.`);
    const result = await sites.commit(proposal, target.branch, target.publication, async (progress) => {
      job.publication = progress;
      await save();
    });
    job.publication = result;
    await save();
    log(result.message);
    proposal = null;
    return;
  }
  throw Error('Unknown action');
}
const server = createServer(async (req, res) => {
  try {
    if (req.headers.host !== new URL(origin).host) {
      res.writeHead(403);
      return res.end();
    }
    const url = new URL(req.url, origin);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    if (req.method === 'GET' && url.pathname === '/') {
      if (
        url.searchParams.get('session') !== secret &&
        !String(req.headers.cookie || '')
          .split(';')
          .some((c) => c.trim() === 'helper-session=' + secret)
      ) {
        res.writeHead(403);
        return res.end('Open the helper URL shown in its terminal.');
      }
      res.setHeader(
        'Set-Cookie',
        `helper-session=${secret}; HttpOnly; SameSite=Strict; Path=/`,
      );
      const html = (
        await readFile(path.join(root, 'index.html'), 'utf8')
      ).replace('__SESSION__', secret);
      res.setHeader(
        'Content-Security-Policy',
        "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'",
      );
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      return res.end(html);
    }
    if (
      req.method === 'GET' &&
      ['/client.js', '/style.css'].includes(url.pathname)
    ) {
      res.setHeader(
        'Content-Type',
        url.pathname.endsWith('.js') ? 'text/javascript' : 'text/css',
      );
      return res.end(await readFile(path.join(root, url.pathname.slice(1))));
    }
    if (
      req.headers['x-helper-session'] !== secret ||
      (req.headers.origin && req.headers.origin !== origin)
    ) {
      res.writeHead(403);
      return res.end();
    }
    if (req.method === 'GET' && url.pathname === '/api/state')
      return respond(res, 200, await publicState());
    if (req.method !== 'POST') return respond(res, 404, { error: 'Not found' });
    if (url.pathname === '/api/pause') {
      sites.stopped = true;
      log('Pause requested. Completed URLs are preserved.');
      return respond(res, 200, { ok: true });
    }
    if (busy)
      return respond(res, 409, {
        error: 'Wait for the current step to finish.',
      });
    busy = true;
    if (url.pathname === '/api/import') {
      const kind = url.searchParams.get('kind');
      if (
        !job ||
        !['source', 'assets', 'media'].includes(kind) ||
        job.imported.includes(kind)
      )
        throw Error('Start a new import to replace ZIP files.');
      const file = path.join(job.dir, kind + '.zip');
      await receive(req, file);
      await extractZip(file, path.join(job.dir, kind));
      job.imported.push(kind);
      await save();
      busy = false;
      return respond(res, 200, { ok: true });
    }
    if (url.pathname === '/api/font' || url.pathname === '/api/original') {
      if (!job?.team) throw Error('Import the three ZIPs first');
      const name = url.searchParams.get('name') || '';
      if (!/^[a-zA-Z0-9_. -]+$/.test(name))
        throw Error('Use a simple filename');
      const file = path.join(job.dir, 'extra', randomUUID() + '-' + name);
      await mkdir(path.dirname(file), { recursive: true });
      await receive(req, file);
      const hash = await digest(file);
      if (url.pathname === '/api/font') {
        const family = url.searchParams.get('family') || '',
          weight = url.searchParams.get('weight') || '400';
        if (
          !/^[\w -]{1,80}$/.test(family) ||
          !/^\d{3}(?: \d{3})?$/.test(weight) ||
          !/^\.(woff2?|ttf|otf)$/.test(path.extname(name))
        )
          throw Error(
            'Use a font file, family name and weight such as 400 or 100 900.',
          );
        job.rows.push({
          source: 'font:' + hash,
          file: name,
          localFile: file,
          hash,
          kind: 'font',
          folder: 'fonts',
          bundle: 'assets',
          fontFamily: family,
          fontWeight: weight,
          url: '',
        });
      } else {
        const row = job.rows.find(
          (r) => r.source === url.searchParams.get('source'),
        );
        if (!row || row.url || row.attempted)
          throw Error('Cannot replace an uploaded or pending file');
        Object.assign(row, { localFile: file, file: name, hash });
      }
      proposal = null;
      await save();
      busy = false;
      return respond(res, 200, { ok: true });
    }
    const data = await bodyJSON(req);
    const name = url.pathname.slice('/api/'.length);
    if (
      [
        'upload',
        'review',
        'publish',
        'scan-storage',
        'delete-storage',
      ].includes(name)
    ) {
      activity = { phase: 'working', action: name, message: 'Starting…' };
      respond(res, 202, { ok: true });
      action(name, data)
        .then(() => {
          activity.phase = 'complete';
        })
        .catch((e) => {
          activity.phase = sites.stopped ? 'paused' : 'error';
          activity.code = e.code || '';
          log(e.message);
        })
        .finally(() => {
          busy = false;
        });
      return;
    }
    await action(name, data);
    busy = false;
    return respond(res, 200, { ok: true });
  } catch (e) {
    busy = false;
    respond(res, 400, { error: e.message });
  }
});
await new Promise((resolve) =>
  server.listen(Number(process.env.HELPER_PORT || 0), '127.0.0.1', resolve),
);
origin = 'http://127.0.0.1:' + server.address().port;
const url = origin + '/?session=' + secret;
console.log(
  'reGELerate Upload Helper ' +
    helperVersion +
    '\n' +
    url +
    '\nKeep this terminal open. Login only in the official website tabs.',
);
if (!process.argv.includes('--no-browser')) {
  if (process.platform === 'win32')
    spawn('rundll32', ['url.dll,FileProtocolHandler', url], {
      windowsHide: true,
      stdio: 'ignore',
    });
  else
    spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [url], {
      stdio: 'ignore',
    });
}
process.on('SIGINT', async () => {
  await sites.close();
  server.close();
  process.exit(0);
});
