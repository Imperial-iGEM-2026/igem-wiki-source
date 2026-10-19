import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { build } from 'vite';
import { chromium } from '../upload-helper/node_modules/playwright/index.mjs';
import { common } from './build-options.mjs';

const dir = await mkdtemp(path.resolve('work/html-visibility-'));
const relative = path.relative(process.cwd(), dir).replaceAll('\\', '/');
const body =
  '<button id="state">0</button><div class="css">CSS</div><div class="author-paused">Paused</div><div id="wa">WAAPI</div><svg width="40" height="40"><circle r="10" cy="20"><animate attributeName="cx" values="10;30;10" dur="2s" repeatCount="indefinite"/></circle></svg><img src="/api/media/aabb.svg" width="40" height="40" alt="test">';
const css =
  'body{font:16px Arial}.css,.author-paused{animation:move 10s linear infinite}.author-paused{animation-play-state:paused}@keyframes move{to{transform:translateX(200px)}}';
const javascript = `window.ticks=0;window.cancelled=0;window.timerTicks=0;function tick(){window.ticks++;requestAnimationFrame(tick)}requestAnimationFrame(tick);const id=requestAnimationFrame(()=>window.cancelled++);cancelAnimationFrame(id);setInterval(()=>window.timerTicks++,50);window.animation=document.getElementById('wa').animate([{opacity:1},{opacity:.2}],{duration:10000,iterations:Infinity});document.getElementById('state').onclick=e=>e.target.textContent=String(Number(e.target.textContent)+1);`;
const node = { id: 'example', kind: 'html', html: body, css, javascript };
await writeFile(
  path.join(dir, 'entry.tsx'),
  `
import React from 'react';import{createRoot}from'react-dom/client';
import{CustomHtmlBlock}from'/app/custom-html-block';import{htmlDocument}from'/app/html-document';
const node=${JSON.stringify(node)};
if(location.search.includes('react')){
const root=createRoot(document.getElementById('host'));window.unmount=()=>root.unmount();root.render(<CustomHtmlBlock node={node}/>);
}else{
const frame=document.createElement('iframe');frame.className='custom-html-frame';frame.sandbox='allow-scripts allow-same-origin allow-presentation';
if(location.search.includes('manifest')){frame.dataset.htmlSource='/component.json';window.source=htmlDocument(node)}else frame.dataset.htmlDocument=htmlDocument(node);
document.getElementById('host').append(frame);await import('/scripts/static-runtime');
}`,
);
await writeFile(
  path.join(dir, 'index.html'),
  '<!doctype html><meta name="viewport" content="width=device-width"><style>body{margin:0}#host{margin-top:2400px;margin-bottom:2400px;height:300px}.custom-html-frame{width:600px!important;height:300px!important;border:0}</style><h1>Visibility fixture</h1><div id="host"></div><script type="module" src="./entry.tsx"></script>',
);
await build({
  ...common,
  build: {
    outDir: path.join(dir, 'dist'),
    rolldownOptions: { input: path.join(dir, 'index.html') },
  },
});
let imageRequests = 0;
let sourceRequests = 0;
let source = '';
const server = createServer(async (req, res) => {
  if (req.url === '/api/media/aabb.svg') {
    imageRequests++;
    res.setHeader('Content-Type', 'image/svg+xml');
    res.end(
      '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="blue"/></svg>',
    );
    return;
  }
  if (req.url === '/component.json') {
    sourceRequests++;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify([source]));
    return;
  }
  try {
    const file = new URL(req.url, 'http://localhost').pathname;
    res.setHeader(
      'Content-Type',
      file.endsWith('.js')
        ? 'text/javascript'
        : file.endsWith('.css')
          ? 'text/css'
          : 'text/html',
    );
    res.end(await readFile(path.join(dir, 'dist', file)));
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  for (const mode of ['react', 'inline', 'manifest']) {
    imageRequests = sourceRequests = 0;
    const page = await browser.newPage({
      viewport: { width: 1200, height: 800 },
    });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(
      `http://127.0.0.1:${server.address().port}/${relative}/index.html?${mode}`,
    );
    await page.locator('.custom-html-frame').waitFor({ state: 'attached' });
    if (mode === 'manifest') source = await page.evaluate(() => window.source);
    await page.waitForTimeout(150);
    assert.equal(
      await page.locator('iframe').getAttribute('src'),
      null,
      mode + ': distant frame deferred',
    );
    assert.equal(imageRequests, 0, mode + ': no distant image requests');
    assert.equal(sourceRequests, 0, mode + ': no distant manifest requests');
    await page.locator('#host').scrollIntoViewIfNeeded();
    await page.frameLocator('iframe').locator('#state').waitFor();
    const frame = await page
      .locator('iframe')
      .elementHandle()
      .then((handle) => handle.contentFrame());
    await frame.waitForFunction(
      () => window.ticks > 3 && document.querySelector('img').complete,
    );
    await frame.locator('#state').click();
    assert.equal(await frame.evaluate(() => window.cancelled), 0);
    assert.equal(await frame.locator('img').getAttribute('decoding'), 'async');
    const imageCount = imageRequests;
    assert.ok(imageCount > 0);
    await page.evaluate(() => window.scrollTo(0, 0));
    await frame.waitForFunction(
      () => document.documentElement.hasAttribute('data-studio-motion-paused'),
      null,
      { polling: 50 },
    );
    const state = () =>
      frame.evaluate(() => ({
        ticks: window.ticks,
        css: document.querySelector('.css').getAnimations()[0].currentTime,
        wa: window.animation.currentTime,
        svg: document.querySelector('svg').getCurrentTime(),
        timers: window.timerTicks,
      }));
    await page.waitForTimeout(80);
    const before = await state();
    await page.waitForTimeout(250);
    const after = await state();
    assert.equal(after.ticks, before.ticks, mode + ': offscreen RAF stopped');
    assert.equal(after.css, before.css, mode + ': offscreen CSS stopped');
    assert.equal(after.wa, before.wa, mode + ': offscreen WAAPI stopped');
    assert.equal(after.svg, before.svg, mode + ': offscreen SVG stopped');
    assert.ok(
      after.timers > before.timers,
      mode + ': application timers preserved',
    );
    await page.locator('#host').scrollIntoViewIfNeeded();
    await frame.waitForFunction(
      (ticks) => window.ticks > ticks + 2,
      after.ticks,
    );
    assert.equal(
      await frame.locator('#state').textContent(),
      '1',
      mode + ': interaction state retained',
    );
    assert.equal(imageRequests, imageCount, mode + ': images not refetched');
    assert.equal(
      await frame
        .locator('.author-paused')
        .evaluate((el) => getComputedStyle(el).animationPlayState),
      'paused',
    );
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', {
        configurable: true,
        value: true,
      });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await frame.waitForFunction(
      () => document.documentElement.hasAttribute('data-studio-motion-paused'),
      null,
      { polling: 50 },
    );
    const hidden = await state();
    await page.waitForTimeout(100);
    assert.equal(
      (await state()).ticks,
      hidden.ticks,
      mode + ': hidden parent suspends frame',
    );
    await page.evaluate(() => {
      delete document.hidden;
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await frame.waitForFunction((ticks) => window.ticks > ticks, hidden.ticks, {
      polling: 50,
    });
    // A sibling message cannot resume this sandbox while offscreen.
    await page.evaluate(() => {
      window.scrollTo(0, 0);
      const child = document.createElement('iframe');
      child.id = 'sibling';
      document.body.append(child);
    });
    await frame.waitForFunction(
      () => document.documentElement.hasAttribute('data-studio-motion-paused'),
      null,
      { polling: 50 },
    );
    const sibling = await page
      .locator('#sibling')
      .elementHandle()
      .then((handle) => handle.contentFrame());
    await sibling.evaluate(() =>
      parent.frames[0].postMessage(
        { type: 'custom-html-visibility', visible: true },
        '*',
      ),
    );
    await page.waitForTimeout(80);
    assert.equal(
      await frame.evaluate(() =>
        document.documentElement.hasAttribute('data-studio-motion-paused'),
      ),
      true,
    );
    if (mode === 'react') {
      await page.evaluate(() => window.unmount());
      assert.equal(await page.locator('.custom-html-frame').count(), 0);
    }
    assert.deepEqual(errors, [], mode + ': no runtime errors');
    console.log(
      `PASS ${mode}: deferred sources/images, animation pause/resume, retained state, cancelled RAF, trusted parent, timers unchanged.`,
    );
    await page.close();
  }
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
