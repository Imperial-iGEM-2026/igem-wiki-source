import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from '../upload-helper/node_modules/playwright/index.mjs';
import { OfficialSites } from '../upload-helper/sites.mjs';

const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const context = await browser.newContext();
  let sends = 0;
  const state = {
    version: '1.0.24', busy: false, jobs: ['job'], events: [],
    activity: { phase: 'error', action: 'publish', message: 'GitLab rejected the request (HTTP 413).' },
    job: { id: 'job', team: 'test', teamId: '1', rows: [],
      publication: { attempted: true, next: 3, url: 'https://gitlab.igem.org/2026/test/-/tree/wiki-upload-job' } },
    proposal: { total: 5, files: [{ path: 'app/page.tsx', action: 'update' }] },
  };
  await context.route('http://helper.test/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === '/api/state') return route.fulfill({ json: state });
    if (pathname === '/api/publish') {
      sends++;
      state.busy = true;
      state.activity.phase = 'working';
      return route.fulfill({ status: 202, json: { ok: true } });
    }
    const file = pathname === '/' ? 'index.html' : pathname.slice(1);
    assert.ok(['index.html', 'client.js', 'style.css'].includes(file), file);
    return route.fulfill({
      contentType: file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html',
      body: await readFile(new URL(`../upload-helper/${file}`, import.meta.url), 'utf8'),
    });
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('http://helper.test/');
  const send = page.locator('#publish');
  await send.waitFor();
  await page.waitForFunction(() => document.querySelector('#publish').textContent.includes('Retry'));
  assert.equal(await send.isEnabled(), true);
  assert.match(await page.locator('#gitlabStatus').innerText(), /incomplete.*3 files/);
  await send.click();
  assert.equal(sends, 1);
  assert.equal(await send.isDisabled(), true);
  state.busy = false;
  state.proposal = null;
  state.job.publication.complete = true;
  state.job.publication.url = 'https://gitlab.igem.org/2026/test/-/merge_requests/1';
  state.activity = { phase: 'complete', action: 'publish', message: 'Source uploaded.' };
  await page.waitForFunction(() => document.querySelector('#gitlabStatus').textContent.includes('Source sent'));
  assert.equal(await send.isDisabled(), true);
  assert.equal(await page.locator('#publication a').getAttribute('href'), state.job.publication.url);
  assert.deepEqual(errors, []);

  // Exercise the actual browser fetch and error parser against a proxy-style
  // HTML response. No production repository requests are made.
  let apiStatus = 413;
  await context.route('https://gitlab.igem.org/**', async (route) => {
    if (new URL(route.request().url()).pathname.startsWith('/api/'))
      return route.fulfill({ status: apiStatus, headers: { 'content-type': 'text/html', 'x-request-id': 'proxy-test' }, body: '<h1>Request rejected</h1>' });
    return route.fulfill({ contentType: 'text/html', body: '<meta name="csrf-token" content="fixture">' });
  });
  const gitlab = await context.newPage();
  await gitlab.goto('https://gitlab.igem.org/2026/test');
  const sites = new OfficialSites();
  sites.tabs.gitlab = gitlab;
  await assert.rejects(sites.git('POST', '/api/v4/projects/1/repository/commits', { test: true }),
    /too large.*HTTP 413.*proxy-test/);
  apiStatus = 200;
  await assert.rejects(sites.git('GET', '/api/v4/projects/1'), /HTML page.*security check.*HTTP 200/);
  console.log('PASS: failed sends can resume, active/completed sends stay disabled, and browser HTTP errors report the actual status.');
} finally {
  await browser.close();
}
