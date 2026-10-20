import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { build } from 'vite';
import { chromium } from '../upload-helper/node_modules/playwright/index.mjs';
import { common } from './build-options.mjs';

const dir = await mkdtemp(path.resolve('work/editor-scroll-reveal-'));
const relative = path.relative(process.cwd(), dir).replaceAll('\\', '/');
// Same entrance animation and child-wrapper selector as the live Education talks.
const css = `.reveal > * { --tw-enter-opacity:0; --tw-enter-translate-y:32px; animation:enter linear both; animation-timeline:view(); animation-range:entry 0% entry 45%; }
.hidden {display:none!important}.transparent {opacity:0!important}
@media (min-width: 760px) {.wide {animation:enter linear both;animation-timeline:view()}}
.ordinary{animation:pulse 4s linear infinite}`;
await writeFile(
  path.join(dir, 'entry.tsx'),
  `
import React,{useState}from'react';import{createRoot}from'react-dom/client';
import{compileCustomCss}from'/app/custom-css';import{CustomHtmlBlock}from'/app/custom-html-block';
const source=${JSON.stringify(css)};
const node={id:'talk',kind:'html',name:'Talk: regression',html:'<div class="room"><h2>Engineered living materials</h2><p>Talk content</p><button id="count">0</button></div>',css:'body{font:20px Arial;background:#1b1530;color:white}.room{padding:32px}',javascript:"document.getElementById('count').onclick=e=>e.target.textContent=String(Number(e.target.textContent)+1)"};
function App(){const[editing,setEditing]=useState(!location.search.includes('preview'));return <><button id="mode" onClick={()=>setEditing(e=>!e)}>Toggle Design/Preview</button><div className="studio-workspace"><div id="stage"><div data-page-css="education" className="artboard"><style>{compileCustomCss(source,'[data-page-css="education"]',editing)}</style><div className="spacer"/><div className="reveal"><div className="canvas-children"><CustomHtmlBlock node={node} editing={editing}/></div></div><div className="hidden">Deliberately hidden</div><div className="transparent">Deliberately transparent</div><div className="ordinary">Ordinary animation</div><div className="wide">Responsive reveal</div><div className="spacer"/></div></div></div></>};createRoot(document.getElementById('root')).render(<App/>);`,
);
await writeFile(
  path.join(dir, 'index.html'),
  `<!doctype html><style>
body{margin:0;background:#f4f5f9;font:16px Arial}button{margin:12px}#stage{height:600px;width:1000px;overflow:auto;margin:20px;border:1px solid #aaa}.artboard{container:studioPage/inline-size}.spacer{height:900px}.reveal{margin:0 40px}.canvas-children{height:320px}.custom-html-block,.custom-html-frame{display:block;width:100%;height:100%;border:0}.wide{height:50px}
@keyframes enter{from{opacity:var(--tw-enter-opacity,0);transform:translateY(var(--tw-enter-translate-y,32px))}to{opacity:1;transform:none}}@keyframes pulse{to{color:blue}}</style><div id="root"></div><script type="module" src="./entry.tsx"></script>`,
);
await build({
  ...common,
  build: {
    outDir: path.join(dir, 'dist'),
    rolldownOptions: { input: path.join(dir, 'index.html') },
  },
});
const server = createServer(async (req, res) => {
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
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 800 },
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(
    `http://127.0.0.1:${server.address().port}/${relative}/index.html?preview`,
  );
  const pose = () =>
    page.locator('.canvas-children').evaluate((e) => {
      const s = getComputedStyle(e);
      return {
        opacity: s.opacity,
        timeline: s.animationTimeline,
        transform: s.transform,
      };
    });
  await page.waitForFunction(
    () =>
      getComputedStyle(document.querySelector('.canvas-children')).opacity ===
      '0',
  );
  assert.equal(
    (await pose()).timeline,
    'view()',
    'Preview retains authored scroll reveal',
  );
  await page.locator('#mode').click();
  await page.waitForFunction(
    () =>
      getComputedStyle(document.querySelector('.canvas-children')).opacity ===
      '1',
  );
  assert.equal((await pose()).timeline, 'auto');
  assert.equal((await pose()).transform, 'matrix(1, 0, 0, 1, 0, 0)');
  assert.equal(await page.locator('.hidden').isVisible(), false);
  assert.equal(
    await page
      .locator('.transparent')
      .evaluate((e) => getComputedStyle(e).opacity),
    '0',
  );
  assert.equal(
    await page
      .locator('.ordinary')
      .evaluate((e) => getComputedStyle(e).animationPlayState),
    'running',
  );
  assert.equal(
    await page.locator('.wide').evaluate((e) => getComputedStyle(e).opacity),
    '1',
  );
  for (const zoom of [1, 0.6, 0.3]) {
    await page.locator('.artboard').evaluate((e, zoom) => {
      e.style.zoom = String(zoom);
    }, zoom);
    await page.locator('.reveal').scrollIntoViewIfNeeded();
    await page
      .frameLocator('iframe')
      .getByRole('heading', { name: 'Engineered living materials' })
      .waitFor();
    assert.equal(
      (await pose()).opacity,
      '1',
      'Visible while editing at zoom ' + zoom,
    );
  }
  await page.locator('.artboard').evaluate((e) => {
    e.style.zoom = '1';
  });
  await page.locator('.reveal').scrollIntoViewIfNeeded();
  await page.frameLocator('iframe').locator('#count').click();
  assert.equal(
    await page.frameLocator('iframe').locator('#count').innerText(),
    '1',
  );
  await page.locator('.artboard').evaluate((e) => {
    e.style.zoom = '1';
  });
  await page.locator('#mode').click();
  await page.locator('#stage').evaluate((e) => {
    e.scrollTop = 0;
  });
  await page.waitForFunction(
    () =>
      getComputedStyle(document.querySelector('.canvas-children')).opacity ===
      '0',
  );
  await page.locator('#stage').evaluate((e) => {
    e.scrollTop = 850;
  });
  await page.waitForFunction(
    () =>
      getComputedStyle(document.querySelector('.canvas-children')).opacity ===
      '1',
  );
  assert.equal(
    (await pose()).timeline,
    'view()',
    'Preview still animates after mode changes',
  );
  await page.locator('#mode').click();
  await page.screenshot({ path: path.join(dir, 'design-visible.png') });
  assert.deepEqual(errors, []);
  console.log(
    'PASS: Education-style scroll reveal is visible in Design at three zoom levels; Preview scroll animation, explicit hiding, ordinary animations and HTML interaction are preserved.',
  );
  console.log('Screenshot: ' + path.join(dir, 'design-visible.png'));
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
}
