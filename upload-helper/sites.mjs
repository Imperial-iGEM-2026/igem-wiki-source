import { chromium } from 'playwright';
import path from 'node:path';
import { copyFile, mkdir, stat, readFile } from 'node:fs/promises';
import { hostedURL, mergeChanges, uploadFolder } from './files.mjs';

export function svgUpload(buffer, name) {
  let text = buffer
    .toString('utf8')
    .replace(/^\uFEFF/, '')
    .trimStart();
  while (/^(?:<\?xml\s|<!--)/i.test(text)) {
    const end = text.startsWith('<!--')
      ? text.indexOf('-->') + 3
      : text.indexOf('?>') + 2;
    if (end < 3) throw Error('Invalid SVG preamble: ' + name);
    text = text.slice(end).trimStart();
  }
  // A declaration is metadata, not part of the vector artwork. Do not discard
  // internal entity definitions, which could change how the SVG renders.
  if (/^<!DOCTYPE/i.test(text)) {
    const declaration = text.match(
      /^<!DOCTYPE(?:[^>"']|"[^"]*"|'[^']*')*>/i,
    )?.[0];
    if (!declaration || declaration.includes('['))
      throw Error(
        'SVG contains custom entity definitions. Export it as a plain SVG first: ' +
          name,
      );
    text = text.slice(declaration.length).trimStart();
  }
  if (!/^<svg(?:\s|>)/i.test(text))
    throw Error('This file does not contain an SVG image: ' + name);
  return { name, mimeType: 'image/svg+xml', buffer: Buffer.from(text) };
}
export function assetURL(urls, row) {
  const prefix = 'rgel-' + row.hash.slice(0, 24) + '.';
  return urls.find((url) => {
    try {
      return (
        decodeURIComponent(new URL(url).pathname)
          .split('/')
          .at(-1)
          .startsWith(prefix) && hostedURL(url, row.kind)
      );
    } catch {
      return false;
    }
  });
}

export class OfficialSites {
  constructor(log = () => {}) {
    this.log = log;
    this.tabs = {};
  }
  async browser() {
    if (this.context) return this.context;
    let browser;
    for (const channel of ['msedge', 'chrome', undefined]) {
      try {
        browser = await chromium.launch({
          headless: false,
          ...(channel ? { channel } : {}),
        });
        break;
      } catch {}
    }
    if (!browser)
      throw Error(
        'Install Microsoft Edge or Google Chrome, then retry. Alternatively run: npx playwright install chromium',
      );
    this.context = await browser.newContext({ acceptDownloads: false });
    this.context.setDefaultTimeout(15000);
    return this.context;
  }
  async open(kind, team, teamId) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(team) || !/^\d{1,8}$/.test(teamId))
      throw Error('Check your registered team URL and numeric team ID.');
    const urls = {
      assets: `https://teams.igem.org/${teamId}/deliverables/wiki/uploads`,
      media: 'https://video.igem.org/videos/publish',
      gitlab: `https://gitlab.igem.org/2026/${team}`,
    };
    if (!urls[kind]) throw Error('Unknown destination');
    const context = await this.browser();
    let page = this.tabs[kind];
    if (!page || page.isClosed()) {
      page = await context.newPage();
      this.tabs[kind] = page;
    }
    if (page.url() !== urls[kind])
      await page.goto(urls[kind], { waitUntil: 'domcontentloaded' });
    await page.bringToFront();
    return page;
  }
  async assetFolder(teamId, folder) {
    if (!folder) return; // Legacy imports retain their current upload location.
    if (
      !/^\d{1,8}$/.test(teamId) ||
      ![
        'banners',
        'logos',
        'icons',
        'images',
        'documents',
        'models',
        'fonts',
      ].includes(folder)
    )
      throw Error('Invalid upload folder');
    const page = this.tabs.assets;
    const route = `/${teamId}/deliverables/wiki/uploads`;
    if (
      !page ||
      page.isClosed() ||
      new URL(page.url()).origin !== 'https://teams.igem.org' ||
      new URL(page.url()).pathname !== route
    )
      throw Error('Open iGEM Uploads and sign in for this team first.');
    const inFolder = (url) =>
      url.origin === 'https://teams.igem.org' &&
      url.pathname === route &&
      url.searchParams.get('path') === folder;
    if (inFolder(new URL(page.url()))) {
      await page.locator('input[type="file"]').waitFor({ state: 'attached' });
      return;
    }
    if (new URL(page.url()).searchParams.has('path'))
      await page.goto('https://teams.igem.org' + route, {
        waitUntil: 'domcontentloaded',
      });
    const newFolder = page.getByRole('button', {
      name: 'New folder',
      exact: true,
    });
    await newFolder.waitFor({ state: 'visible' });
    const selector = `a[href="${route}?path=${folder}"], a[href="https://teams.igem.org${route}?path=${folder}"]`;
    const links = page.locator(selector);
    const dialog = page
      .locator('form')
      .filter({ hasText: 'Create new folder' });
    const name = dialog.locator('input[name="name"]');
    if (!(await links.count())) {
      this.log('Creating iGEM folder: ' + folder);
      try {
        // The fixed-position popup leaves its outer form at zero height.
        // Wait on the input; the form itself never becomes "visible".
        if (!(await name.isVisible())) {
          this.log('Opening folder dialog: ' + folder);
          await newFolder.click({ timeout: 10000 });
        }
        this.log('Waiting for folder name field: ' + folder);
        await name.waitFor({ state: 'visible', timeout: 10000 });
        this.log('Typing folder name: ' + folder);
        await name.fill('', { timeout: 10000 });
        await name.pressSequentially(folder, { delay: 30, timeout: 10000 });
        await name.press('Tab');
        if ((await name.inputValue()) !== folder)
          throw Error('Folder name did not reach the input');
      } catch {
        throw Error(
          `Could not enter the folder name “${folder}”. In iGEM’s Create new folder dialog, enter that name and click Create, then return here and check remaining files.`,
        );
      }
      if (this.stopped)
        throw Error(
          'Paused before creating the folder. Check remaining files to continue.',
        );
      this.log('Clicking Create for folder: ' + folder);
      await dialog
        .getByRole('button', { name: 'Create', exact: true })
        .click({ timeout: 10000 });
      this.log('Waiting for iGEM to finish creating folder: ' + folder);
      try {
        await name.waitFor({ state: 'hidden', timeout: 15000 });
        // iGEM's Create handler navigates to ?path=NAME. Empty folders do
        // not appear in the parent's listing until they contain a file.
        await page.waitForURL(inFolder, { timeout: 15000 });
      } catch {
        throw Error(
          `iGEM has not confirmed the “${folder}” folder yet. Check the iGEM window for an error, then check remaining files. The helper has not repeated the Create request.`,
        );
      }
    } else {
      if (await name.isVisible())
        await dialog
          .getByRole('button', { name: 'Cancel', exact: true })
          .click();
      await links.first().click();
      await page.waitForURL(inFolder, { timeout: 15000 });
    }
    await page.locator('input[type="file"]').waitFor({ state: 'attached' });
    this.log('Folder ready; continuing upload into ' + folder);
  }
  async assetProgress(page, filename) {
    // Scope status to this file's processing card, not other completed uploads.
    return page.locator('span[title]').evaluateAll((elements, name) => {
      const label = elements.find(
        (element) => element.getAttribute('title') === name,
      );
      let card = label?.parentElement;
      while (card && card !== document.body) {
        if (card.querySelector('button[aria-label="Remove from list"]')) {
          const status = card.querySelector('div.whitespace-nowrap > span');
          return {
            text: status?.textContent?.trim() || '',
            failed: !!status?.classList.contains('text-red-600'),
          };
        }
        card = card.parentElement;
      }
      return { text: '', failed: false };
    }, filename);
  }
  async waitForAsset(
    page,
    row,
    scan,
    {
      resume = false,
      deferRefresh = false,
      timeoutMs = 180000,
      pollMs = 1200,
    } = {},
  ) {
    const filename =
      'rgel-' +
      row.hash.slice(0, 24) +
      path.extname(row.localFile || row.file || '').toLowerCase();
    const started = Date.now();
    let refreshed = false,
      completed = false,
      lastRefresh = 0,
      lastLog = 0,
      previous = '';
    while (Date.now() - started < timeoutMs) {
      if (this.stopped)
        throw Error(
          'Paused. Check remaining files will recover the completed upload without sending it again.',
        );
      if (row.uploadError) throw Error(row.uploadError);
      if (deferRefresh && row.processingComplete) return;
      const url = await scan();
      if (url) return url;
      const progress = await this.assetProgress(page, filename);
      if (progress.failed) {
        row.rejected = true;
        row.uploadError =
          'iGEM could not process ' +
          path.basename(row.file || filename) +
          ': ' +
          progress.text +
          '. Check its processing card; the helper has not retried it.';
        throw Error(row.uploadError);
      }
      if (progress.text === 'Completed') completed = true;
      if (completed && deferRefresh) return;
      // The official processing card does not refresh its separate directory query.
      // Never reload a visible queued/active transfer. A resumed job with no card
      // needs one fresh listing because processing cards disappear after navigation.
      if (
        (!refreshed && (completed || (resume && !progress.text))) ||
        (completed && Date.now() - lastRefresh >= 15000)
      ) {
        this.log(
          completed
            ? 'iGEM completed this file. Refreshing the folder to collect its URL…'
            : 'Checking the saved upload in a refreshed iGEM folder…',
        );
        await page.reload({ waitUntil: 'domcontentloaded' });
        refreshed = true;
        lastRefresh = Date.now();
        const found = await scan();
        if (found) return found;
      }
      if (progress.text !== previous || Date.now() - lastLog >= 15000) {
        this.log(
          (completed
            ? 'Waiting for the completed file to appear in the folder'
            : progress.text || 'Waiting for iGEM’s file listing') +
            ` (${Math.floor((Date.now() - started) / 1000)}s). No duplicate upload will be sent.`,
        );
        previous = progress.text;
        lastLog = Date.now();
      }
      await new Promise((resolve) => setTimeout(resolve, pollMs));
    }
    throw Error(
      completed
        ? 'iGEM completed the upload, but its file URL is still missing from the folder. Check remaining files again later, or use its existing official URL. Do not import again.'
        : 'The saved upload is still pending or absent from iGEM’s folder. Check its status and use Check remaining files; it will not upload this file twice.',
    );
  }
  async asset(row, jobDir, teamId, save, { deferRefresh = false } = {}) {
    const page = this.tabs.assets;
    if (
      !page ||
      page.isClosed() ||
      new URL(page.url()).hostname !== 'teams.igem.org' ||
      !new URL(page.url()).pathname.startsWith(
        `/${teamId}/deliverables/wiki/uploads`,
      )
    )
      throw Error('Open iGEM Uploads and sign in for this team first.');
    const expectedFolder = uploadFolder(row);
    if (
      expectedFolder &&
      new URL(page.url()).searchParams.get('path') !== expectedFolder
    )
      throw Error(
        'The selected iGEM folder changed. Check remaining files to return to ' +
          expectedFolder +
          '.',
      );
    const prefix = 'rgel-' + row.hash.slice(0, 24);
    const scan = async () => {
      const urls = await page
        .locator('a[href^="https://static.igem.wiki/"]')
        .evaluateAll((es) => es.map((e) => e.href));
      return assetURL(urls, row);
    };
    const url = await scan();
    if (url) return url;
    const wait = async (resume = false) => {
      const found = await this.waitForAsset(page, row, scan, {
        resume,
        deferRefresh,
      });
      if (!found && deferRefresh) {
        row.processingComplete = true;
        await save();
      }
      return found;
    };
    if (row.attempted) return wait(true);
    if ((await page.locator('input[type="file"]').count()) !== 1)
      throw Error(
        'The upload controls are unavailable. Sign in and open the Uploads tab.',
      );
    const stage = path.join(jobDir, 'staged');
    await mkdir(stage, { recursive: true });
    const file = path.join(
      stage,
      prefix + path.extname(row.localFile).toLowerCase(),
    );
    await copyFile(row.localFile, file);
    if ((await stat(file)).size > 10 * 1024 * 1024)
      throw Error(
        'iGEM’s static uploader has a 10 MB per-file limit. Compress or replace ' +
          path.basename(row.file) +
          ' before uploading.',
      );
    const payload =
      path.extname(file) === '.svg'
        ? svgUpload(await readFile(file), path.basename(file))
        : file;
    await page.locator('input[type="file"]').setInputFiles(payload);
    const upload = page.getByRole('button', { name: 'Upload', exact: true });
    this.log('Preparing upload: ' + path.basename(row.file));
    try {
      // File selection updates iGEM's form asynchronously. A one-shot
      // isEnabled() check can fail before React enables the submit button.
      // A trial click waits for readiness without sending the file.
      await upload.click({ trial: true, timeout: 15000 });
    } catch {
      throw Error(
        'iGEM’s Upload button did not become ready within 15 seconds. Check sign-in and any file size/type message in its tab. No upload was submitted.',
      );
    }
    if (this.stopped) throw Error('Paused before submitting the file.');
    let responseTask = Promise.resolve();
    const onResponse = (response) => {
      // Match the submitted multipart filename, not unrelated background errors.
      if (response.status() !== 422 || response.request().method() !== 'POST')
        return;
      const body = response.request().postDataBuffer();
      if (
        !body?.includes(Buffer.from('filename="' + path.basename(file) + '"'))
      )
        return;
      responseTask = (async () => {
        let reason = 'File rejected';
        try {
          const data = await response.json();
          reason = typeof data.message === 'string' ? data.message : reason;
        } catch {}
        row.uploadError =
          'iGEM rejected ' +
          path.basename(row.file) +
          ' (422): ' +
          reason.slice(0, 400);
        row.rejected = true;
        await save();
      })().catch((error) => {
        row.uploadError =
          'Could not save the rejected upload state: ' + error.message;
      });
    };
    row.uploadError = '';
    row.rejected = false;
    page.on('response', onResponse);
    try {
      row.attempted = true;
      await save();
      await upload.click();
      this.log('Waiting for iGEM to process ' + path.basename(row.file));
      return await wait();
    } catch (error) {
      if (row.rejected) await save();
      throw error;
    } finally {
      page.off('response', onResponse);
      await responseTask;
    }
  }
  async assetBatch(
    rows,
    jobDir,
    teamId,
    save,
    { timeoutMs = 45000, pollMs = 1200 } = {},
  ) {
    const completed = [],
      errors = [];
    for (const row of rows) {
      if (this.stopped)
        throw Error('Paused. Completed files are saved for recovery.');
      const duplicate = completed.find((other) => other.hash === row.hash);
      if (duplicate) {
        row.processingComplete = true;
        row.attempted = true;
        row.url = duplicate.url || '';
        await save();
        completed.push(row);
        continue;
      }
      try {
        const url = await this.asset(row, jobDir, teamId, save, {
          deferRefresh: true,
        });
        if (url) row.url = url;
        completed.push(row);
        await save();
      } catch (error) {
        if (!row.rejected) throw error;
        errors.push(row.uploadError || error.message);
        this.log(row.uploadError || error.message);
      }
    }
    const pending = completed.filter((row) => !row.url);
    if (pending.length) {
      this.log(
        `Batch processed. Refreshing once to collect ${pending.length} file URLs…`,
      );
      const page = this.tabs.assets;
      await page.reload({ waitUntil: 'domcontentloaded' });
      const started = Date.now();
      while (
        pending.some((row) => !row.url) &&
        Date.now() - started < timeoutMs
      ) {
        if (this.stopped)
          throw Error('Paused. Completed files are saved for recovery.');
        const urls = await page
          .locator('a[href^="https://static.igem.wiki/"]')
          .evaluateAll((elements) => elements.map((element) => element.href));
        let changed = false;
        for (const row of pending)
          if (!row.url) {
            const url = assetURL(urls, row);
            if (url) {
              row.url = url;
              changed = true;
            }
          }
        if (changed) await save();
        if (pending.every((row) => row.url)) break;
        await new Promise((resolve) => setTimeout(resolve, pollMs));
      }
      if (pending.some((row) => !row.url))
        throw Error(
          'Some completed files are not in iGEM’s folder yet. Check remaining files again; saved uploads will not be repeated.',
        );
    }
    if (errors.length)
      throw Error(
        `${errors.length} file(s) rejected. The other files in this batch were saved. Use Retry rejected file after fixing the reported format.`,
      );
    this.log(`Batch saved: ${completed.length} file URLs.`);
  }

  async video(row, jobDir, save) {
    const page = this.tabs.media;
    if (
      !page ||
      page.isClosed() ||
      new URL(page.url()).hostname !== 'video.igem.org'
    )
      throw Error('Open Video Universe and sign in first.');
    if (row.videoId)
      return `https://video.igem.org/videos/embed/${row.videoId}`;
    // The user reviews metadata on the official form. Capture only the upload's own response.
    const onResponse = async (response) => {
      try {
        const url = new URL(response.url());
        if (
          url.hostname !== 'video.igem.org' ||
          !/^\/api\/v1\/videos\/(?:upload|upload-resumable)/.test(
            url.pathname,
          ) ||
          !response.ok()
        )
          return;
        const data = await response.json();
        const id = data?.video?.uuid;
        if (typeof id === 'string' && /^[a-zA-Z0-9-]+$/.test(id)) {
          row.videoId = id;
          await save();
        }
      } catch {}
    };
    if (row.attempted)
      throw Error(
        'This recording was already started. Finish it in Video Universe, then check again or use its existing embed URL. Do not upload the recording again.',
      );
    if (!new URL(page.url()).pathname.startsWith('/videos/publish'))
      throw Error('Open the Video Universe Publish page first.');
    const inputs = page.locator('input[type="file"]');
    if ((await inputs.count()) !== 1)
      throw Error('Select Upload a file in Video Universe.');
    page.on('response', onResponse);
    try {
      row.attempted = true;
      await save();
      await inputs.setInputFiles(row.localFile);
      this.log(
        'Video transfer started. Review title, description, channel, language and license in Video Universe.',
      );
      await page.bringToFront();
      const deadline = Date.now() + 30 * 60 * 1000;
      while (Date.now() < deadline) {
        if (this.stopped)
          throw Error(
            'Paused. The video may still be uploading in its official tab.',
          );
        if (row.videoId) {
          return `https://video.igem.org/videos/embed/${row.videoId}`;
        }
        await new Promise((r) => setTimeout(r, 1500));
      }
      throw Error(
        'Video upload is still pending. Check the official tab before continuing.',
      );
    } finally {
      page.off('response', onResponse);
    }
  }
  async git(method, endpoint, body) {
    const page = this.tabs.gitlab;
    if (
      !page ||
      page.isClosed() ||
      new URL(page.url()).hostname !== 'gitlab.igem.org'
    )
      throw Error('Open iGEM GitLab and sign in first.');
    if (!endpoint.startsWith('/api/v4/'))
      throw Error('Invalid GitLab endpoint');
    const result = await page.evaluate(
      async ({ method, endpoint, body }) => {
        const csrf = document.querySelector('meta[name="csrf-token"]')?.content;
        const response = await fetch(endpoint, {
          method,
          credentials: 'same-origin',
          redirect: 'error',
          headers: {
            Accept: 'application/json',
            ...(body ? { 'Content-Type': 'application/json' } : {}),
            ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
        });
        const text = await response.text();
        let data;
        try {
          data = JSON.parse(text);
        } catch {
          data = null;
        }
        return { status: response.status, data };
      },
      { method, endpoint, body },
    );
    if ([401, 403].includes(result.status))
      throw Error(
        'Sign in to iGEM GitLab with an account allowed to edit this repository.',
      );
    if (!result.data && result.status !== 204)
      throw Error('GitLab returned an unexpected response. Check your login.');
    if (result.status >= 400 && result.status !== 404)
      throw Error(
        'GitLab request failed (' +
          result.status +
          '). ' +
          JSON.stringify(result.data?.message || '').slice(0, 400),
      );
    return result;
  }
  async plan(team, files) {
    const id = encodeURIComponent('2026/' + team),
      base = '/api/v4/projects/' + id;
    const project = await this.git('GET', base);
    if (project.status !== 200)
      throw Error('Your official team GitLab repository was not found.');
    if (project.data.path_with_namespace !== '2026/' + team)
      throw Error('Repository identity did not match.');
    const branch = project.data.default_branch;
    if (branch !== 'main')
      throw Error(
        'The exported CI expects main. Confirm your official repository uses main before uploading.',
      );
    const head = await this.git('GET', base + '/repository/branches/main');
    if (head.status !== 200)
      throw Error('The official repository needs an initial main branch.');
    const sha = head.data.commit.id;
    const remote = new Map();
    for (let i = 0; i < files.length; i += 4) {
      await Promise.all(
        files.slice(i, i + 4).map(async (file) => {
          const r = await this.git(
            'GET',
            base +
              '/repository/files/' +
              encodeURIComponent(file.path) +
              '?ref=' +
              sha,
          );
          if (r.status === 200)
            remote.set(file.path, {
              content: Buffer.from(r.data.content, 'base64').toString('utf8'),
              last_commit_id: r.data.last_commit_id,
            });
        }),
      );
    }
    return { base, sha, actions: mergeChanges(files, remote) };
  }
  async commit(plan, branch) {
    if (!plan.actions.length)
      return {
        url: '',
        message: 'The repository already matches these files.',
      };
    const r = await this.git('POST', plan.base + '/repository/commits', {
      branch,
      start_sha: plan.sha,
      commit_message: 'Update reviewed reGELerate wiki source',
      actions: plan.actions,
    });
    if (r.status !== 201)
      throw Error('GitLab did not confirm the source commit.');
    const mr = await this.git('POST', plan.base + '/merge_requests', {
      source_branch: branch,
      target_branch: 'main',
      title: 'Update reGELerate wiki',
      description:
        'Updated wiki source and verified iGEM media mappings. Includes a CC BY 4.0 LICENSE for original team wiki source and content; third-party material retains its own licences. Upload guides and Markdown files are excluded.',
      remove_source_branch: true,
    });
    if (mr.status !== 201)
      throw Error(
        'Source uploaded to ' +
          branch +
          ', but the review request was not created. Open the branch in GitLab.',
      );
    return {
      url: mr.data.web_url,
      message: 'Source uploaded. Review and merge in GitLab to publish.',
    };
  }
  async close() {
    if (this.context) await this.context.browser().close();
  }
}
