// Optional browser regression: npm install --no-save playwright, then run this.
// PLAYWRIGHT_MODULE can point at an existing Playwright index.mjs.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { defaultLoading, startSiteLoading } from '../app/site-loading.js';
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE
    ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href
    : 'playwright'
);
const { dir } = JSON.parse(
  await readFile('work/loading-export-latest.json', 'utf8'),
);
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/stall') return;
  if (url.pathname.startsWith('/test-team/') || url.pathname.startsWith('/vector-team/')) {
    const file = path.join(
      dir,
      url.pathname.startsWith('/vector-team/') ? 'vector/public' : 'export/public',
      url.pathname.slice(url.pathname.startsWith('/vector-team/') ? '/vector-team/'.length : '/test-team/'.length) || 'index.html',
    );
    try {
      res.setHeader(
        'Content-Type',
        file.endsWith('.js')
          ? 'text/javascript'
          : file.endsWith('.css')
            ? 'text/css'
            : file.endsWith('.svg')
              ? 'image/svg+xml'
              : 'text/html',
      );
      res.end(await readFile(file));
    } catch {
      res.writeHead(404).end();
    }
    return;
  }
  const d = {
    ...defaultLoading,
    enabled: true,
    duration: url.searchParams.has('slow') ? 0 : 2000,
    timeout: url.searchParams.has('slow') ? 1000 : 3000,
    frequency: url.searchParams.get('frequency') || 'session',
    showSymbol: !url.searchParams.has('hide'),
    showSkip: !url.searchParams.has('hide'),
    image: url.searchParams.has('image') ? origin + '/test-team/templates/notebook-purple/favicon.svg' : '',
    animation: 'custom',
    customCss:
      '.loader-mark {animation: move 1s infinite alternate} @keyframes move {to {transform:translateY(-10px)}}',
  };
  res.setHeader('Content-Type', 'text/html');
  res.end(
    `<!doctype html><html><body><button id="before">Underlying page</button><script>window.run=()=>(${startSiteLoading.toString()})(${JSON.stringify(d)},'${url.searchParams.get('project') || 'test'}',${url.searchParams.has('preview')});${url.searchParams.has('storage') ? "Object.defineProperty(window,'sessionStorage',{get(){throw Error('Blocked storage')}});" : ''}window.stop=run();</script>${url.searchParams.has('slow') ? '<img src="/stall" alt="Slow image">' : ''}</body></html>`,
  );
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({
    channel: process.env.BROWSER_CHANNEL || 'msedge',
    headless: true,
  });
  const context = await browser.newContext();
  const page = await context.newPage();
  const overlay = page.locator('[data-site-loading]');
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  await overlay.waitFor();
  assert.equal(
    await page.locator('[data-site-loading] iframe').getAttribute('sandbox'),
    '',
  );
  await page.getByRole('button', { name: 'Skip animation' }).click();
  await overlay.waitFor({ state: 'detached' });
  assert.equal(
    await page.evaluate(() => document.documentElement.style.overflow),
    '',
  );
  await page.reload();
  assert.equal(await overlay.count(), 0, 'Session reload skips the loader');
  await page.goto(origin + '/another');
  assert.equal(
    await overlay.count(),
    0,
    'Session page changes skip the loader',
  );
  await page.goto(origin + '/?project=other');
  await overlay.waitFor();
  await page.keyboard.press('Escape');
  await overlay.waitFor({ state: 'detached' });
  await page.goto(origin + '/?preview');
  await page.getByRole('button', { name: 'Close preview' }).click();
  await page.evaluate(() => run());
  await overlay.waitFor();
  await page.keyboard.press('Escape');
  await page.goto(origin + '/?frequency=always');
  await overlay.waitFor();
  await overlay.waitFor({ state: 'detached' });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await overlay.waitFor();
  await page.keyboard.press('Escape');
  await page.goto(origin + '/?frequency=first&project=first');
  await page.keyboard.press('Escape');
  const secondTab = await context.newPage();
  await secondTab.goto(origin + '/?frequency=first&project=first');
  assert.equal(
    await secondTab.locator('[data-site-loading]').count(),
    0,
    'First visit persists across tabs',
  );
  await secondTab.close();
  // Expiry is measured from completion, not extended by later navigation.
  const seenAt = await page.evaluate(() => Number(localStorage.getItem('studio:site-loading:v1:first')));
  await page.evaluate(() => localStorage.setItem('studio:site-loading:v1:first', String(Date.now()-29*60000)));
  await page.reload();
  assert.equal(await overlay.count(),0,'Still suppressed before 30 minutes');
  await page.evaluate(() => localStorage.setItem('studio:site-loading:v1:first', String(Date.now()-30*60000-1)));
  await page.reload({waitUntil:'domcontentloaded'});
  await overlay.waitFor();
  await page.keyboard.press('Escape');
  assert.ok(await page.evaluate(() => Number(localStorage.getItem('studio:site-loading:v1:first'))) >= seenAt);
  await page.evaluate(() => localStorage.setItem('studio:site-loading:v1:first','1'));
  await page.reload({waitUntil:'domcontentloaded'});
  await overlay.waitFor();
  await page.keyboard.press('Escape');
  await page.goto(origin+'/?hide&frequency=always');
  await overlay.waitFor();
  assert.equal(await page.getByRole('button',{name:'Skip animation'}).count(),0);
  const hiddenFrame=page.frameLocator('[data-site-loading] iframe');
  assert.equal(await hiddenFrame.locator('.loader-symbol').count(),0);
  assert.equal(await hiddenFrame.locator('.loader-mark').count(),1,'Keep custom CSS animation target');
  await page.keyboard.press('Escape');
  await overlay.waitFor({state:'detached'});
  await page.goto(origin+'/?hide&image&frequency=always');
  await overlay.waitFor();
  assert.equal(await page.frameLocator('[data-site-loading] iframe').locator('img').count(),1,'Hiding symbol preserves uploaded animation');
  await page.keyboard.press('Escape');
  await page.goto(origin+'/?hide&preview');
  await page.getByRole('button',{name:'Close preview'}).click();
  await page.goto(origin + '/?slow&project=slow', {
    waitUntil: 'domcontentloaded',
  });
  await overlay.waitFor();
  await overlay.waitFor({ state: 'detached', timeout: 2500 });
  assert.notEqual(
    await page.evaluate(() => document.readyState),
    'complete',
    'Timeout dismisses before slow resources finish',
  );
  await page.goto(origin + '/?storage&project=storage', {
    waitUntil: 'domcontentloaded',
  });
  await overlay.waitFor();
  await overlay.waitFor({ state: 'detached' });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(origin + '/?frequency=always');
  assert.equal(
    await overlay.count(),
    0,
    'Reduced motion bypasses the animation',
  );
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto(origin + '/test-team/', { waitUntil: 'domcontentloaded' });
  await overlay.waitFor();
  const logo = page.frameLocator('[data-site-loading] iframe').locator('img');
  await logo.waitFor();
  await page.waitForFunction(() =>
    document.querySelector('[data-site-loading]'),
  );
  assert.equal(
    await logo.evaluate((img) => img.complete && img.naturalWidth > 0),
    true,
    'Exported animation image loads',
  );
  await page.getByRole('button', { name: 'Skip animation' }).click();
  await page.reload();
  assert.equal(
    await overlay.count(),
    0,
    'Exported loader respects session storage',
  );
  await page.goto(origin + '/vector-team/', {waitUntil:'domcontentloaded'});
  await overlay.waitFor();
  const vectorFrame=page.frameLocator('[data-site-loading] iframe');
  const circle=vectorFrame.locator('circle');
  await circle.waitFor();
  await page.waitForFunction(()=>document.querySelector('[data-site-loading]'));
  await circle.evaluate(el=>new Promise(resolve=>{const check=()=>Number(el.dataset.ticks)>2 && el.dataset.network==='blocked' ? resolve(true) : requestAnimationFrame(check);check()}));
  assert.equal(await circle.getAttribute('data-isolated'),'yes');
  assert.equal(await page.locator('[data-site-loading] iframe').getAttribute('sandbox'),'allow-scripts');
  assert.equal(await vectorFrame.locator('#breakout').count(),0,'Closing script text cannot escape its JS string');
  assert.equal(await page.locator('body').getAttribute('data-escaped'),null);
  assert.equal(await page.getByRole('button',{name:'Skip animation'}).count(),0);
  await page.keyboard.press('Escape');
  await overlay.waitFor({state:'detached'});
  console.log('PASS: exported vector JavaScript animates SVG, blocks parent/network access, handles closing-script text and dismisses cleanly.');
  console.log(
    'PASS: session/first-visit/always policies, preview replay, project isolation, skip/Escape, slow-load timeout, blocked storage, reduced motion and exported logo.',
  );
} finally {
  await browser?.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
