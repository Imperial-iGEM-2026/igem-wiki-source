import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { build } from 'vite';
import { chromium } from '../upload-helper/node_modules/playwright/index.mjs';
import { common } from './build-options.mjs';

const dir = await mkdtemp(path.resolve('work/html-large-'));
const relative = path.relative(process.cwd(), dir).replaceAll('\\', '/');
const photo =
  '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="60"><!--' +
  'x'.repeat(600000) +
  '--><rect width="80" height="60" fill="#6030bb"/></svg>';
const keys = Array.from(
  { length: 8 },
  (_, i) => `${String(i).padStart(8, '0')}-0000-4000-8000-000000000000.jpg`,
);
const node = {
  id: 'festival',
  kind: 'html',
  name: 'Festival',
  html:
    '<h1>Great Exhibition Road Festival</h1><button id="flip">Front</button>' +
    keys
      .map((key) => `<img width="80" height="60" src="/api/media/${key}">`)
      .join(''),
  css: 'body{font-family:Arial}img{display:inline-block}.pulse{animation:pulse 1s infinite}@keyframes pulse{to{opacity:.5}}',
  javascript:
    "window.ticks=0;function tick(){window.ticks++;requestAnimationFrame(tick)}requestAnimationFrame(tick);document.querySelector('#flip').onclick=e=>e.target.textContent='Back';",
};
await writeFile(
  path.join(dir, 'entry.tsx'),
  String.raw`
import React,{useState}from'react';import{createRoot}from'react-dom/client';
import{CustomHtmlBlock}from'/app/custom-html-block';import{htmlDocument,htmlFrameURL}from'/app/html-document';
const node=${JSON.stringify(node)};
const largePhoto=${JSON.stringify('data:image/svg+xml;base64,' + Buffer.from(photo).toString('base64'))};
const large=htmlDocument(node).replace(/\/api\/media\/[a-f0-9-]+\.jpg/g,largePhoto);
window.fixtureSource=large;
if(location.search.includes('react')){
function App(){const[editing,setEditing]=useState(true);return <><button id="mode" onClick={()=>setEditing(!editing)}>Toggle mode</button><CustomHtmlBlock node={node} editing={editing}/></>};createRoot(document.getElementById('host')).render(<App/>);
}else{
const frame=document.createElement('iframe');frame.className='custom-html-frame';frame.sandbox='allow-scripts allow-same-origin allow-presentation';document.getElementById('host').append(frame);
if(location.search.includes('legacy'))frame.src=htmlFrameURL(large,document.baseURI);
else{if(location.search.includes('manifest')){frame.dataset.htmlSource='/component.json'}else frame.dataset.htmlDocument=large;await import('/scripts/static-runtime')}
}`,
);
await writeFile(
  path.join(dir, 'index.html'),
  '<!doctype html><meta name="viewport" content="width=device-width"><style>iframe{width:100%;height:400px;border:0}#host{margin-bottom:2000px}</style><div id="host"></div><script type="module" src="./entry.tsx"></script>',
);
await build({
  ...common,
  build: {
    outDir: path.join(dir, 'dist'),
    rolldownOptions: { input: path.join(dir, 'index.html') },
  },
});
let publishedSource = '';
let previewRequests = 0;
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/media/')) {
    if (url.searchParams.has('preview')) previewRequests++;
    res.setHeader('Content-Type', 'image/svg+xml');
    res.end(photo);
    return;
  }
  if (url.pathname === '/component.json') {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify([publishedSource]));
    return;
  }
  try {
    res.setHeader(
      'Content-Type',
      /\.(m?js)$/.test(url.pathname)
        ? 'text/javascript'
        : url.pathname.endsWith('.css')
          ? 'text/css'
          : 'text/html',
    );
    res.end(await readFile(path.join(dir, 'dist', url.pathname)));
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  for (const mode of ['legacy', 'react', 'inline', 'manifest']) {
    const page = await browser.newPage({
      viewport: { width: 1200, height: 800 },
    });
    page.setDefaultTimeout(15000);
    await page.goto(
      `http://127.0.0.1:${server.address().port}/${relative}/index.html?${mode}`,
    );
    const frameElement = page.locator('iframe');
    await frameElement.waitFor();
    if (mode === 'legacy') {
      await page.waitForTimeout(1000);
      const frame = await frameElement
        .elementHandle()
        .then((h) => h.contentFrame());
      assert.ok((await frameElement.getAttribute('src')).length > 6_000_000);
      assert.equal(
        await frame.locator('h1').count(),
        0,
        'Reproduces the oversized data URL remaining blank',
      );
      publishedSource = await page.evaluate(() => window.fixtureSource);
      await page.close();
      console.log(
        'PASS: reproduced original blank frame with a >6 MB navigation URL',
      );
      continue;
    }
    await page.frameLocator('iframe').locator('h1').waitFor();
    assert.ok(
      (await frameElement.getAttribute('src')).length < 10000,
      mode + ': small bootstrap URL',
    );
    const frame = await frameElement
      .elementHandle()
      .then((h) => h.contentFrame());
    await frame.waitForFunction(
      () =>
        document.images.length === 8 &&
        [...document.images].every((i) => i.complete && i.naturalWidth === 80),
    );
    assert.equal(
      await frame.evaluate(() => {
        try {
          void parent.document;
          return false;
        } catch {
          return true;
        }
      }),
      true,
      'sandbox retains opaque origin',
    );
    assert.match(
      await frame
        .locator('meta[http-equiv="Content-Security-Policy"]')
        .getAttribute('content'),
      /connect-src 'none'/,
    );
    const ticks = await frame.evaluate(() => window.ticks);
    await frame.waitForFunction((n) => window.ticks > n, ticks);
    await frame.locator('#flip').click();
    assert.equal(await frame.locator('#flip').innerText(), 'Back');
    await page.evaluate(() => window.scrollTo(0, 1500));
    await frame.waitForFunction(
      () => document.documentElement.hasAttribute('data-studio-motion-paused'),
      null,
      { polling: 50 },
    );
    const pausedTicks = await frame.evaluate(() => window.ticks);
    await page.waitForTimeout(150);
    assert.equal(
      await frame.evaluate(() => window.ticks),
      pausedTicks,
      'Large offscreen frame suspends animation',
    );
    await page.evaluate(() => window.scrollTo(0, 0));
    await frame.waitForFunction((t) => window.ticks > t, pausedTicks);
    assert.equal(
      await frame.locator('#flip').innerText(),
      'Back',
      'Scrolling preserves widget state',
    );
    // The bootstrap must accept just one document, even from the parent.
    await page.evaluate(() => {
      const f = document.querySelector('iframe');
      const code = decodeURIComponent(f.src.split(',').slice(1).join(','));
      const token = code.match(/[a-f0-9]{8}-[a-f0-9-]{27,}/)?.[0];
      f.contentWindow.postMessage(
        {
          type: 'custom-html-document',
          token,
          html: '<h1>Wrong replacement</h1>',
        },
        '*',
      );
    });
    assert.equal(
      await frame.locator('h1').innerText(),
      'Great Exhibition Road Festival',
    );
    if (mode === 'react') {
      assert.equal(previewRequests, 8);
      for (let i = 0; i < 2; i++) {
        await page.locator('#mode').click();
        await frame.locator('#flip').getByText('Front').waitFor();
        await frame.waitForFunction(() =>
          [...document.images].every(
            (i) => i.complete && i.naturalWidth === 80,
          ),
        );
        await frame.locator('#flip').click();
      }
      await page.screenshot({ path: path.join(dir, 'fixed-editor.png') });
    }
    await page.close();
    console.log(
      'PASS: ' +
        mode +
        ' large photo block, images, scripts, animation and isolation',
    );
  }
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
}
console.log(dir);
