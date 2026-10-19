import assert from 'node:assert/strict';
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  copyFile,
} from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import path from 'node:path';
import { generateKeyPair, SignJWT } from 'jose';
import { build } from 'vite';
import { chromium } from '../upload-helper/node_modules/playwright/index.mjs';
import { common } from './build-options.mjs';
import { createAppServer } from '../selfhost-dist/server/app.mjs';

const dir = await mkdtemp(path.resolve('work/image-preview-browser-'));
const dataDir = path.join(dir, 'data');
await mkdir(path.join(dataDir, 'media'), { recursive: true });
const sharp = createRequire(
  new URL(
    `../selfhost-dist/server/image-runtime/${process.platform}-${process.arch}/package.json`,
    import.meta.url,
  ),
)('sharp');
const original = await sharp({
  create: { width: 6000, height: 4000, channels: 3, background: '#3868c4' },
})
  .jpeg({ progressive: false })
  .toBuffer();
const keys = Array.from(
  { length: 12 },
  (_, i) => `${String(i).padStart(8, '0')}-0000-4000-8000-000000000000.jpg`,
);
for (const key of keys)
  await writeFile(path.join(dataDir, 'media', key), original);
await writeFile(
  path.join(dir, 'entry.tsx'),
  `
import React,{useState}from'react';import{createRoot}from'react-dom/client';
import{CanvasSurface}from'/app/canvas-surface';import{newNode,emptyLayout}from'/app/canvas-schema';
import{editorImageURL}from'/app/editor-image';import'/app/globals.css';
const nodes=${JSON.stringify(keys)}.map((key,i)=>({...newNode('image-'+i,'image'),src:'/api/media/'+key,span:4,minHeight:200,alt:'Photo '+i}));
const html={...newNode('html','html'),span:12,minHeight:180,html:'<img width="200" src="'+nodes[0].src+'">'};
const layout={...emptyLayout,nodes:[...nodes,html],order:[...nodes.map(n=>n.id),html.id],sidebar:false};
function App(){const[editing,setEditing]=useState(true),[count,setCount]=useState(0);return <><header style={{position:'sticky',top:0,zIndex:100,background:'white'}}><button id="mode" onClick={()=>setEditing(!editing)}>Mode</button><button id="click" onClick={()=>setCount(count+1)}>Clicks {count}</button></header><aside style={{width:180,float:'left'}}>{nodes.map(n=><img key={n.id} className="thumb" src={n.src} srcSet={editorImageURL(n.src,160)+' 1x'} width="40" height="40" loading="lazy" decoding="async"/>)}</aside><div style={{marginLeft:200,width:960}}><CanvasSurface layout={layout} builtins={[]} editing={editing}/></div></>};createRoot(document.getElementById('root')).render(<App/>);`,
);
await writeFile(
  path.join(dir, 'index.html'),
  '<!doctype html><meta name="viewport" content="width=device-width"><div id="root"></div><script type="module" src="./entry.tsx"></script>',
);
const clientDir = path.join(dir, 'dist');
await build({
  ...common,
  build: {
    outDir: clientDir,
    rolldownOptions: { input: path.join(dir, 'index.html') },
  },
});
await copyFile(
  path.join(clientDir, path.relative(process.cwd(), dir), 'index.html'),
  path.join(clientDir, 'index.html'),
);
const pair = await generateKeyPair('RS256');
const reservation = createServer();
await new Promise((resolve) => reservation.listen(0, '127.0.0.1', resolve));
const port = reservation.address().port;
await new Promise((resolve) => reservation.close(resolve));
const environment = {
  CF_ACCESS_TEAM_DOMAIN: 'https://example.cloudflareaccess.com',
  CF_ACCESS_AUD: 'preview-test',
  CF_ACCESS_ORIGIN: 'https://127.0.0.1:' + port,
  MEDIA_ORIGIN: 'https://media.example.com',
};
const token = await new SignJWT({ email: 'editor@example.com' })
  .setProtectedHeader({ alg: 'RS256' })
  .setSubject('editor')
  .setIssuer(environment.CF_ACCESS_TEAM_DOMAIN)
  .setAudience(environment.CF_ACCESS_AUD)
  .setIssuedAt()
  .setExpirationTime('10m')
  .sign(pair.privateKey);
const server = await createAppServer({
  dataDir,
  clientDir,
  environment,
  keyOverride: pair.publicKey,
});
await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const headers = {
    'cf-access-jwt-assertion': token,
    origin: environment.CF_ACCESS_ORIGIN,
  };
  const unauthorized = await fetch(
    origin + '/api/media/' + keys[0] + '?preview=160',
  );
  assert.equal(unauthorized.status, 401);
  const raw = await fetch(origin + '/api/media/' + keys[0], {
    headers,
    redirect: 'manual',
  });
  assert.equal(raw.status, 302, 'originals still use signed media links');
  const inline = await fetch(origin + '/api/media/' + keys[0] + '?inline=1', {
    headers,
    redirect: 'manual',
  });
  assert.equal(
    inline.status,
    200,
    'authenticated HTML resolution does not redirect',
  );
  assert.deepEqual(Buffer.from(await inline.arrayBuffer()), original);
  assert.match(inline.headers.get('cache-control'), /private/);
  assert.equal(
    (await fetch(origin + '/api/media/' + keys[0] + '?inline=1')).status,
    401,
  );
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
    extraHTTPHeaders: { 'cf-access-jwt-assertion': token },
  });
  const requests = [];
  const browserErrors = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text());
  });
  page.on('request', (request) => {
    if (request.url().includes('/api/media/')) requests.push(request.url());
  });
  const response = await page.goto(origin + '/workspace');
  assert.equal(response.status(), 200, await response.text());
  await page
    .waitForSelector('#click', { timeout: 10000 })
    .catch(async (error) => {
      throw Error(
        error.message +
          ' ' +
          JSON.stringify(browserErrors) +
          ' ' +
          (await page.locator('body').innerText()).slice(0, 300),
      );
    });
  await page.locator('#click').click();
  await page.getByText('Clicks 1', { exact: true }).waitFor();
  const images = page.locator('.media-image-frame > img');
  await images.last().scrollIntoViewIfNeeded();
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll('.media-image-frame > img')].length ===
        12 &&
      [...document.querySelectorAll('.media-image-frame > img')].every(
        (img) => img.complete && img.naturalWidth === 640,
      ),
    null,
    { timeout: 90000 },
  );
  const sizes = await images.evaluateAll((nodes) =>
    nodes.map((img) => ({
      width: img.naturalWidth,
      height: img.naturalHeight,
      box: img.getBoundingClientRect().width,
      source: img.getAttribute('src'),
      current: img.currentSrc,
    })),
  );
  for (const item of sizes) {
    assert.equal(item.width, 640);
    assert.ok(item.current.endsWith('?preview=640&v=2'));
    assert.ok(!item.source.includes('?'));
  }
  await page.locator('.custom-html-frame').scrollIntoViewIfNeeded();
  await page.frameLocator('.custom-html-frame').locator('img').waitFor();
  const frame = await page
    .locator('.custom-html-frame')
    .elementHandle()
    .then((handle) => handle.contentFrame());
  await frame.waitForFunction(
    () =>
      document.querySelector('img').complete &&
      document.querySelector('img').naturalWidth > 0,
  );
  assert.equal(
    await frame.locator('img').evaluate((img) => img.naturalWidth),
    1600,
  );
  await page.locator('.thumb').first().scrollIntoViewIfNeeded();
  await page.waitForFunction(() =>
    [...document.querySelectorAll('.thumb')].every(
      (img) => img.complete && img.naturalWidth === 160,
    ),
  );
  assert.ok(requests.length > 0);
  assert.ok(
    requests.every((url) => new URL(url).searchParams.has('preview')),
    'editor must not request full-resolution originals',
  );
  const derivative = await fetch(
    origin + '/api/media/' + keys[0] + '?preview=1600',
    { headers },
  );
  assert.equal(derivative.status, 200);
  assert.equal(derivative.headers.get('content-type'), 'image/webp');
  assert.match(derivative.headers.get('cache-control'), /^private/);
  assert.equal(
    (
      await fetch(origin + '/api/media/' + keys[0] + '?preview=1600', {
        headers: {
          ...headers,
          'if-none-match': derivative.headers.get('etag'),
        },
      })
    ).status,
    304,
  );
  // Preview uses the same small display copy. Large frames can request the
  // original; shrinking them again returns to a smooth, filtered small copy.
  const smaller = await sharp(original).resize(1600).jpeg().toBuffer();
  await page.route('**/api/media/**', (route) => {
    if (new URL(route.request().url()).searchParams.has('preview'))
      return route.continue();
    return route.fulfill({
      contentType: 'image/jpeg',
      body: route.request().url().includes(keys[0]) ? original : smaller,
    });
  });
  await page.locator('#mode').click();
  await page.waitForFunction(() =>
    document
      .querySelector('.media-image-frame > img')
      ?.currentSrc.endsWith('?preview=640&v=2'),
  );
  await images.first().evaluate((img) => {
    img.style.width = '1900px';
    img.style.maxWidth = 'none';
    img.style.objectFit = 'cover';
  });
  await page.waitForFunction(
    () =>
      document.querySelector('.media-image-frame > img')?.naturalWidth === 6000,
  );
  assert.equal(
    await images.first().getAttribute('src'),
    '/api/media/' + keys[0],
  );
  await images.first().evaluate((img) => {
    img.style.removeProperty('width');
    img.style.removeProperty('max-width');
    img.style.removeProperty('object-fit');
  });
  await page.waitForFunction(
    () =>
      document.querySelector('.media-image-frame > img')?.naturalWidth === 640,
  );
  assert.equal(
    Math.round(
      await images.first().evaluate((img) => img.getBoundingClientRect().width),
    ),
    Math.round(sizes[0].box),
  );
  await page.evaluate(() => {
    Object.defineProperty(window, 'devicePixelRatio', {
      value: 3,
      configurable: true,
    });
    window.dispatchEvent(new Event('resize'));
  });
  await page.waitForFunction(
    () =>
      document.querySelector('.media-image-frame > img')?.naturalWidth === 1600,
  );
  await page.evaluate(() => {
    Object.defineProperty(window, 'devicePixelRatio', {
      value: 1,
      configurable: true,
    });
    window.dispatchEvent(new Event('resize'));
  });
  await page.waitForFunction(
    () =>
      document.querySelector('.media-image-frame > img')?.naturalWidth === 640,
  );
  await page.route('**/*fail-test=1', (route) => route.abort());
  await images.first().evaluate((img) => {
    img.dataset.imageSmall += '&fail-test=1';
    window.dispatchEvent(new Event('resize'));
  });
  await page.waitForFunction(
    () =>
      document.querySelector('.media-image-frame > img')?.naturalWidth === 1600,
  );
  assert.equal(
    await images.count(),
    12,
    'failed small copy must retry without removing the image',
  );
  assert.deepEqual(
    await readFile(path.join(dataDir, 'media', keys[0])),
    original,
  );
  console.log(
    'PASS: twelve 24 MP images use smooth 640px copies in small frames, 160px thumbnails and capped HTML images; editor requests zero originals; Preview adapts to large/small frames without changing saved sources; UI click and signed original downloads work.',
  );
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
