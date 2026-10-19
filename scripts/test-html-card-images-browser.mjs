import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { build } from 'vite';
import { chromium } from '../upload-helper/node_modules/playwright/index.mjs';
import { common } from './build-options.mjs';
const dir = await mkdtemp(path.resolve('work/html-card-images-'));
const relative = path.relative(process.cwd(), dir).replaceAll('\\', '/');
const keys = Array.from(
  { length: 12 },
  (_, i) => `${String(i).padStart(8, '0')}-0000-4000-8000-000000000000.svg`,
);
const code = `const files=${JSON.stringify(keys)};const grid=document.getElementById('cards');files.forEach((name,i)=>{const card=document.createElement('button');card.className='card';card.innerHTML='<img src="/api/media/'+name+'?v=1" alt="Member '+i+'"><span>Front '+i+'</span>';card.onclick=()=>{card.classList.toggle('flipped');card.setAttribute('aria-pressed',String(card.classList.contains('flipped')))};grid.append(card)});setTimeout(()=>{const image=new Image();image.alt='Later image';image.src='/api/media/'+files[0];image.srcset='/api/media/'+files[0]+' 1x, /api/media/'+files[1]+' 2x';document.body.append(image);document.body.style.backgroundImage='url(/api/media/'+files[0]+')'},100);`;
const node = {
  id: 'cards',
  kind: 'html',
  html: '<div id="cards"></div>',
  css: '#cards{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.card img{width:50px;height:50px}.flipped{background:purple;color:white}@media(max-width:600px){#cards{grid-template-columns:repeat(2,1fr)}}',
  javascript: code,
};
await writeFile(
  path.join(dir, 'entry.tsx'),
  `import React from 'react';import{createRoot}from'react-dom/client';import{CustomHtmlBlock}from'/app/custom-html-block';import{htmlDocument}from'/app/html-document';const node=${JSON.stringify(node)};const keys=${JSON.stringify(keys)};if(location.search.includes('react'))createRoot(document.getElementById('host')).render(<CustomHtmlBlock node={node} editing={location.search.includes('editing')}/>);else{document.body.dataset.customHtmlMedia=btoa(JSON.stringify(Object.fromEntries(keys.map(key=>['/api/media/'+key,location.origin+'/published/'+key]))));const frame=document.createElement('iframe');frame.className='custom-html-frame';frame.sandbox='allow-scripts allow-same-origin allow-presentation';if(location.search.includes('manifest')){frame.dataset.htmlSource='/component.json';window.source=htmlDocument(node)}else frame.dataset.htmlDocument=htmlDocument(node);document.getElementById('host').append(frame);await import('/scripts/static-runtime');}`,
);
await writeFile(
  path.join(dir, 'index.html'),
  '<!doctype html><meta name="viewport" content="width=device-width"><style>iframe{width:100%!important;height:600px!important}body{margin:0}</style><div id="host"></div><script type="module" src="./entry.tsx"></script>',
);
await build({
  ...common,
  build: {
    outDir: path.join(dir, 'dist'),
    rolldownOptions: { input: path.join(dir, 'index.html') },
  },
});
let source = '',
  active = 0,
  maximum = 0,
  failLast = false;
const privateRequests = [];
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (
    url.pathname.startsWith('/api/media/') ||
    url.pathname.startsWith('/published/')
  ) {
    if (url.pathname.startsWith('/api/')) {
      privateRequests.push(req.url);
      if (url.searchParams.get('inline') !== '1') {
        res.writeHead(403).end('Opaque frame cannot read private media');
        return;
      }
    }
    if (failLast && url.pathname.endsWith(keys[11])) {
      res.writeHead(404).end();
      return;
    }
    maximum = Math.max(maximum, ++active);
    await new Promise((r) => setTimeout(r, 10));
    active--;
    res.setHeader('Content-Type', 'image/svg+xml');
    res.end(
      '<svg xmlns="http://www.w3.org/2000/svg" width="50" height="50"><rect width="50" height="50" fill="orange"/></svg>',
    );
    return;
  }
  if (url.pathname === '/component.json') {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify([source]));
    return;
  }
  try {
    res.setHeader(
      'Content-Type',
      url.pathname.endsWith('.js')
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
  for (const mode of ['react-editing', 'react-preview', 'inline', 'manifest']) {
    maximum = 0;
    privateRequests.length = 0;
    const page = await browser.newPage({
      viewport: { width: 1200, height: 800 },
    });
    if (mode === 'manifest')
      await page.route('**/component.json', async (route) =>
        route.fulfill({ json: [await page.evaluate(() => window.source)] }),
      );
    await page.goto(
      `http://127.0.0.1:${server.address().port}/${relative}/index.html?${mode}`,
    );
    if (mode === 'manifest') source = await page.evaluate(() => window.source);
    const iframe = page.locator('iframe');
    await iframe.waitFor();
    const frame = await iframe.elementHandle().then((h) => h.contentFrame());
    await frame
      .waitForFunction(
        () =>
          document.querySelectorAll('img').length === 13 &&
          [...document.images].every(
            (img) => img.complete && img.naturalWidth > 0,
          ),
      )
      .catch(async (error) => {
        throw Error(
          error.message +
            JSON.stringify(
              await frame
                .locator('img')
                .evaluateAll((es) =>
                  es.map((e) => ({
                    alt: e.alt,
                    width: e.naturalWidth,
                    src: e.getAttribute('src')?.slice(0, 80),
                    srcset: e.getAttribute('srcset')?.slice(0, 180),
                    current: e.currentSrc?.slice(0, 80),
                  })),
                ),
            ),
        );
      });
    assert.equal(await page.locator('.custom-html-error').count(), 0, mode);
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
      'opaque origin retained',
    );
    assert.match(
      await frame
        .locator('meta[http-equiv="Content-Security-Policy"]')
        .getAttribute('content'),
      /connect-src 'none'/,
    );
    await frame.locator('.card').first().focus();
    await page.keyboard.press('Enter');
    assert.equal(
      await frame.locator('.card').first().getAttribute('aria-pressed'),
      'true',
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await frame.locator('.card').first().click();
    assert.equal(
      await frame.locator('.card').first().getAttribute('aria-pressed'),
      'false',
    );
    assert.equal(
      await frame
        .locator('#cards')
        .evaluate(
          (e) => getComputedStyle(e).gridTemplateColumns.split(' ').length,
        ),
      2,
    );
    assert.match(
      await frame.locator('body').getAttribute('style'),
      mode.startsWith('react') ? /data:image/ : /published/,
    );
    if (mode.startsWith('react')) {
      assert.ok(maximum <= 2);
      assert.equal(
        privateRequests.filter((url) => url.includes('inline=1')).length,
        12,
      );
    }
    await page.close();
    console.log(
      'PASS: ' +
        mode +
        ' dynamic, delayed and CSS photos; keyboard/mobile flips; opaque sandbox.',
    );
  }
  failLast = true;
  const page = await browser.newPage();
  await page.goto(
    `http://127.0.0.1:${server.address().port}/${relative}/index.html?react-preview`,
  );
  await page
    .getByRole('button', { name: 'Retry images', exact: true })
    .waitFor();
  assert.match(
    await page.locator('.custom-html-error').innerText(),
    /HTTP 404/,
  );
  failLast = false;
  await page.getByRole('button', { name: 'Retry images', exact: true }).click();
  await page.locator('.custom-html-error').waitFor({ state: 'detached' });
  const frame = await page
    .locator('iframe')
    .elementHandle()
    .then((h) => h.contentFrame());
  await frame.waitForFunction(
    () =>
      document.images.length === 13 &&
      [...document.images].every((i) => i.naturalWidth > 0),
  );
  console.log(
    'PASS: missing-file diagnosis and retry restore images without changing saved code.',
  );
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
}
