import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'vite';
import { createServer } from 'node:http';
import { PDFDocument } from 'pdf-lib';
import { chromium } from '../upload-helper/node_modules/playwright/index.mjs';
import { common } from './build-options.mjs';

const folder = await mkdtemp(path.resolve('work/pdf-editor-'));
const relative = path.relative(process.cwd(), folder).replaceAll('\\', '/');
const pdf = await PDFDocument.create();
for (let i = 0; i < 4; i++) pdf.addPage([300, 400]);
await writeFile(path.join(folder, 'document.pdf'), await pdf.save());
await writeFile(
  path.join(folder, 'index.html'),
  '<!doctype html><div id="root"></div><script type="module" src="./entry.tsx"></script>',
);
await writeFile(
  path.join(folder, 'entry.tsx'),
  `
import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {CanvasSurface} from '/app/canvas-surface';
import {emptyLayout,newNode} from '/app/canvas-schema';
import '/app/globals.css';
import '/app/studio.css';
import '/app/studio-responsive.css';
import '/app/studio-polish.css';
const layer={...newNode('reader','pdf'),src:'/${relative}/document.pdf',span:9,minHeight:540,padding:0,title:''};
const layout={...emptyLayout,nodes:[layer],order:[layer.id]};
function Test(){const [editing,setEditing]=useState(true);return <div className="studio" style={{position:'relative'}}><button id="mode" onClick={()=>setEditing(!editing)}>Toggle preview</button><div className="studio-artboard" style={{width:'min(100%,960px)',margin:'20px auto'}}><CanvasSurface layout={layout} builtins={[]} editing={editing} selected={['reader']} onSelect={()=>{throw Error('PDF controls selected the layer')}} /></div></div>}
createRoot(document.getElementById('root')).render(<Test/>);
`,
);
await build({
  ...common,
  build: {
    outDir: path.join(folder, 'dist'),
    rolldownOptions: { input: path.join(folder, 'index.html') },
  },
});
const server = createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    const pdfRequest = pathname.endsWith('/document.pdf');
    const file = pdfRequest
      ? path.join(folder, 'document.pdf')
      : path.join(folder, 'dist', pathname);
    res.setHeader(
      'Content-Type',
      pdfRequest
        ? 'application/pdf'
        : /\.(m?js)$/.test(file)
          ? 'text/javascript'
          : file.endsWith('.css')
            ? 'text/css'
            : 'text/html',
    );
    res.end(await readFile(file));
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({
  headless: true,
  channel: 'msedge',
  timeout: 20000,
});
try {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 900 },
  });
  page.setDefaultTimeout(20000);
  const errors = [];
  page.on('pageerror', (e) => {
    errors.push(e.message);
    console.error(e.message);
  });
  await page.goto(
    `http://127.0.0.1:${server.address().port}/${relative}/index.html`,
    { waitUntil: 'domcontentloaded' },
  );
  const reader = page.locator('.modern-pdf-reader');
  await reader.locator('.pdf-reader-sheet canvas').first().waitFor();
  const before = await reader.boundingBox();
  // Broad saved notebook styles must never enter the reader's internal layout.
  await page.addStyleTag({
    content: `.media-pdf div { translate:180px -120px!important; width:1400px!important; }
    .media-pdf .pdf-reader-toolbar { display:none!important; }
    .media-pdf canvas { position:absolute!important; width:1800px!important; }`,
  });
  assert.deepEqual(
    await reader.boundingBox(),
    before,
    'Saved CSS cannot displace the reader',
  );
  const toolbar = await reader.locator('.pdf-reader-toolbar').boundingBox();
  assert.ok(
    toolbar &&
      toolbar.y >= before.y &&
      toolbar.y + toolbar.height <= before.y + before.height,
    'Toolbar stays visible inside the PDF box',
  );
  assert.equal(
    await page.locator('.media-pdf > .media-download').count(),
    0,
    'Download is in the toolbar, not a detached footer',
  );
  const layer = await page.locator('[data-layer-id="reader"]').boundingBox();
  assert.ok(
    before.x >= layer.x &&
      before.y >= layer.y &&
      before.x + before.width <= layer.x + layer.width + 1 &&
      before.y + before.height <= layer.y + layer.height + 1,
    'Reader stays inside editor layer',
  );
  await reader.locator('[data-reader="sidebar"]').click();
  await reader.locator('[data-thumb] canvas').first().waitFor();
  await reader.locator('[data-reader-page]').fill('3');
  await reader.locator('[data-reader-page]').press('Enter');
  await reader.locator('.pdf-reader-sheet[data-page="3"] canvas').waitFor();
  await reader.locator('[data-reader="rotate"]').click();
  // Studio keeps Design mounted beneath its separate Preview iframe. Exercise
  // the real hiding rule: a shadow-root reset must not reveal that old reader.
  const artboard = page.locator('.studio-artboard');
  for (let cycle = 0; cycle < 3; cycle++) {
    await artboard.evaluate((el) =>
      el.classList.add('studio-workspace-hidden'),
    );
    assert.equal(
      await reader.isVisible(),
      false,
      'Hidden Design PDF must not float over Preview',
    );
    assert.equal(
      await reader.locator('.pdf-reader-toolbar').isVisible(),
      false,
      'Hidden reader controls must also disappear',
    );
    await artboard.evaluate((el) =>
      el.classList.remove('studio-workspace-hidden'),
    );
    assert.equal(
      await reader.isVisible(),
      true,
      'Back to Design restores the PDF',
    );
    assert.equal(await reader.locator('[data-reader-page]').inputValue(), '3');
    assert.deepEqual(
      await reader.boundingBox(),
      before,
      'Returning preserves reader geometry',
    );
  }
  await page.locator('#mode').click();
  const after = await reader.boundingBox();
  const previewLayer = await page
    .locator('[data-layer-id="reader"]')
    .boundingBox();
  assert.deepEqual(
    {
      width: after.width,
      height: after.height,
      x: after.x - previewLayer.x,
      y: after.y - previewLayer.y,
    },
    {
      width: before.width,
      height: before.height,
      x: before.x - layer.x,
      y: before.y - layer.y,
    },
    'Preview uses the same geometry within the layer (without editor chrome)',
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await reader.locator('[data-reader="sidebar"]').click();
  assert.ok(
    await reader.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
    'Mobile toolbar stays contained',
  );
  await reader.screenshot({ path: path.join(folder, 'editor-reader.png') });
  assert.deepEqual(errors, []);
  console.log(
    'PASS: editor controls, hidden Design reader, repeated mode switches, containment, matching preview geometry and mobile layout. ' +
      folder,
  );
} catch (error) {
  console.error(error);
  throw error;
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
