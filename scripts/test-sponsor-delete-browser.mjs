import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'vite';
import { createServer } from 'node:http';
import { chromium } from '../upload-helper/node_modules/playwright/index.mjs';
import { common } from './build-options.mjs';
const folder = await mkdtemp(path.resolve('work/sponsor-delete-browser-'));
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
import {CanvasContext} from '/app/page-canvas';
import {ImportedPage} from '/app/template-renderer';
import {templateDefaults} from '/app/templates';
import '/app/globals.css';import '/app/studio.css';
const initial=Object.fromEntries(Object.entries(templateDefaults('notebook-white')).map(([id,value])=>[id,{value,version:1,author:'Test'}]));
function Test(){const[data,setData]=useState(()=>JSON.parse(sessionStorage.getItem('sponsor-test')||'null')||initial);
return <CanvasContext.Provider value={{data,editing:true,busy:false,locked:false,dirty:()=>{},save:async(id,value,version)=>{setData(prev=>{const next={...prev,[id]:{value,version:version+1,author:'Test'}};sessionStorage.setItem('sponsor-test',JSON.stringify(next));return next});return true;}}}><ImportedPage data={data} page="home" field={id=>data[id]?.value||''}/></CanvasContext.Provider>}
createRoot(document.getElementById('root')).render(<Test/>);`,
);
const dist = path.join(folder, 'dist');
await build({
  ...common,
  build: {
    outDir: dist,
    rollupOptions: { input: path.join(folder, 'index.html') },
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
  page.on('pageerror', (error) => console.error(error));
  const layer = page.locator('[data-studio-layer="import-main-4"]');
  await layer.waitFor();
  await layer
    .getByRole('button')
    .filter({ hasText: 'Thank you for supporting us.' })
    .click();
  await page.keyboard.press('Delete');
  await layer.waitFor({ state: 'hidden', timeout: 5000 });
  assert.equal(
    await page.locator('[data-layer-id="import-main-4"]').count(),
    0,
  );
  console.log('PASS keyboard delete');
  await page.getByRole('button', { name: /Undo/ }).first().click();
  await layer.waitFor();
  await layer
    .getByRole('button', { name: 'Hide Thank you for supporting us.' })
    .click();
  await layer.click({ button: 'right' });
  await page.getByRole('menuitem', { name: /Delete/ }).click();
  await layer.waitFor({ state: 'hidden', timeout: 5000 });
  console.log('PASS already-hidden section context menu delete');
  await page.getByRole('button', { name: /Undo/ }).first().click();
  await layer.waitFor();
  await layer
    .getByRole('button', { name: 'Show Thank you for supporting us.' })
    .click();
  const child = page
    .locator('[data-studio-layer^="template-sponsor-import-main-4-"]')
    .first();
  await child.getByRole('button', { name: /^Lock / }).click();
  await layer.click({ button: 'right' });
  await page
    .getByRole('menuitem', { name: 'Delete section', exact: true })
    .click();
  await page.getByRole('alert').filter({ hasText: 'is locked' }).waitFor();
  await layer.waitFor();
  await child.getByRole('button', { name: /^Unlock / }).click();
  const heading = page
    .locator('.studio-artboard [data-layer-id="import-main-4"] h2')
    .first();
  await heading.click({ button: 'right' });
  await page
    .getByRole('menuitem', { name: 'Delete entire section', exact: true })
    .click();
  await layer.waitFor({ state: 'hidden', timeout: 5000 });
  await page.getByRole('button', { name: 'Save now', exact: true }).click();
  await page.getByRole('button', { name: 'Saved', exact: true }).waitFor();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('.studio-layer-list').waitFor();
  assert.equal(await layer.count(), 0);
  assert.equal(
    await page.locator('[data-layer-id="import-main-4"]').count(),
    0,
  );
  console.log(
    'PASS locked-child feedback, explicit entire-section action, save and reload',
  );
  await page.screenshot({ path: path.join(folder, 'deleted.png') });
} catch (error) {
  console.error(error);
  throw error;
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
