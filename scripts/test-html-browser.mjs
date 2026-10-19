import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'vite';
import { createServer } from 'node:http';
import { chromium } from '../upload-helper/node_modules/playwright/index.mjs';
import { common } from './build-options.mjs';
const folder = await mkdtemp(path.resolve('work/html-browser-'));
const relative = path.relative(process.cwd(), folder).replaceAll('\\', '/');
await writeFile(
  path.join(folder, 'index.html'),
  '<!doctype html><div id="root"></div><script type="module" src="./entry.tsx"></script>',
);
await writeFile(
  path.join(folder, 'entry.tsx'),
  `
import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {CanvasSurface} from '/app/canvas-surface';
import {CustomHtmlEditor} from '/app/custom-html-editor';
import {newNode,emptyLayout} from '/app/canvas-schema';
import {htmlExample} from '/app/html-document';
import '/app/globals.css';import '/app/studio.css';
function Test(){const [node,setNode]=useState({...newNode('animation','html'),...htmlExample,minHeight:360,span:9});
const [editing,setEditing]=useState(true);
return <div className="studio" style={{position:'relative',display:'block',height:'auto',padding:30}}><button id="mode" onClick={()=>setEditing(!editing)}>Preview</button><div className="studio-artboard" style={{position:'relative',width:'100%',minHeight:400,marginTop:30}}><CanvasSurface layout={{...emptyLayout,nodes:[node],order:[node.id]}} builtins={[]} editing={editing} selected={[node.id]}/></div><CustomHtmlEditor node={node} onChange={value=>setNode({...node,...value})} onEnd={()=>{}}/></div>}
createRoot(document.getElementById('root')).render(<Test/>);`,
);
const dist = path.join(folder, 'dist');
await build({
  ...common,
  build: {
    outDir: dist,
    rolldownOptions: { input: path.join(folder, 'index.html') },
  },
});
const server = createServer(async (req, res) => {
  try {
    const file = path.join(dist, req.url.split('?')[0]);
    res.setHeader(
      'Content-Type',
      file.endsWith('.js')
        ? 'text/javascript'
        : file.endsWith('.css')
          ? 'text/css'
          : 'text/html',
    );
    res.end(await readFile(file));
  } catch {
    res.statusCode = 404;
    res.end();
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({
  headless: true,
  executablePath:
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
});
try {
  const page = await browser.newPage({
    viewport: { width: 1100, height: 1000 },
  });
  await page.goto(
    `http://127.0.0.1:${server.address().port}/${relative}/index.html`,
    { waitUntil: 'domcontentloaded' },
  );
  const host = page.locator('.custom-html-frame');
  const content = page.frameLocator('.custom-html-frame');
  await content.locator('.orbit').waitFor();
  // Selection mode intentionally shields sandbox interactions; Preview enables them.
  await page.locator('#mode').click();
  await page.screenshot({ path: path.join(folder, 'before.png') });
  await content.locator('.orbit').click();
  assert.match(await content.locator('.orbit').getAttribute('class'), /fast/);
  const frame = await host.elementHandle().then((h) => h.contentFrame());
  assert.equal(
    await frame.evaluate(() => {
      try {
        parent.document.body.dataset.compromised = 'yes';
        return false;
      } catch {
        return true;
      }
    }),
    true,
  );
  assert.equal(
    await frame.evaluate(() => {
      try {
        localStorage.setItem('test', 'bad');
        return false;
      } catch {
        return true;
      }
    }),
    true,
  );
  assert.equal(
    await frame.evaluate(async () => {
      try {
        await fetch('https://example.com/private');
        return false;
      } catch {
        return true;
      }
    }),
    true,
  );
  const size = await host.boundingBox();
  assert.ok(size.width > 400 && size.height >= 250);
  await page.locator('#mode').click();
  const previewSize = await host.boundingBox();
  assert.equal(previewSize.width, size.width);
  assert.equal(previewSize.height, size.height);
  await page.getByRole('button', { name: 'JavaScript', exact: true }).click();
  await page
    .locator('#studio-html-source')
    .fill('throw new Error("example runtime error")');
  await page
    .locator('.custom-html-error')
    .filter({ hasText: 'example runtime error' })
    .waitFor();
  await page
    .locator('#studio-html-source')
    .fill('document.querySelector("p").textContent="Updated animation"');
  await content.getByText('Updated animation').waitFor();
  assert.equal(await page.locator('.custom-html-error').count(), 0);
  await page.screenshot({ path: path.join(folder, 'custom-html.png') });
  console.log(
    'PASS: interactive HTML, code editing, debounced preview, runtime errors, dimensions, and blocked parent/storage/network access. ' +
      folder,
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
