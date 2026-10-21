import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { build } from 'vite';
import { chromium } from '../upload-helper/node_modules/playwright/index.mjs';
import { common } from './build-options.mjs';
const dir = await mkdtemp(path.resolve('work/preview-sync-'));
const relative = path.relative(process.cwd(), dir).replaceAll('\\', '/');
await writeFile(
  path.join(dir, 'index.html'),
  '<!doctype html><style>html,body,#root{height:100%;margin:0}.studio-full-preview{height:90vh}</style><div id="root"></div><script type="module" src="./entry.tsx"></script>',
);
await writeFile(
  path.join(dir, 'entry.tsx'),
  `
import React,{useState}from'react';import{createRoot}from'react-dom/client';import{StudioPreview}from'/app/studio-preview';
import{templateDefaults}from'/app/templates';import{customDefaults}from'/app/custom-pages';import{newNode,CUSTOM_CONTENT}from'/app/canvas-schema';
import'/app/globals.css';import'/app/studio-polish.css';
const pages=JSON.stringify([{slug:'demo',title:'Preview demo'},{slug:'second',title:'Second page'}]);
const values={...templateDefaults('blank'),...customDefaults(pages),'pages:custom':pages};
for(const [slug,title] of [['demo','Preview demo'],['second','Second page']]){const l=JSON.parse(values['layout:'+slug]);l.nodes.find(n=>n.id==='custom-intro').title=title;values['layout:'+slug]=JSON.stringify(l)};const layout=JSON.parse(values['layout:demo']);const widget={...newNode('widget','html'),parentId:CUSTOM_CONTENT,minHeight:140,html:'<button id="counter">0</button>',javascript:"document.getElementById('counter').onclick=e=>e.target.textContent=String(Number(e.target.textContent)+1)"};layout.nodes.push(widget);layout.order.push(widget.id);values['layout:demo']=JSON.stringify(layout);
for(let i=0;i<36;i++)values['unused:'+i]='x'.repeat(80000);
const initial=Object.fromEntries(Object.entries(values).map(([k,value])=>[k,{value,version:1,author:''}]));
function App(){const[data,setData]=useState(initial),[active,setActive]=useState(true),[page,setPage]=useState('demo'),[project,setProject]=useState('one');return <><button id="open" onClick={()=>setActive(true)}>Open preview</button><button id="draft" onClick={()=>setData(d=>{const l=JSON.parse(d['layout:demo'].value);l.nodes.find(n=>n.id==='custom-intro').title='Updated draft';return {...d,'layout:demo':{value:JSON.stringify(l),version:2,author:''}}})}>Edit draft</button><button id="delete" onClick={()=>setData(d=>{const n={...d};delete n['unused:0'];return n})}>Delete row</button><button id="page" onClick={()=>setPage('second')}>Second page</button><button id="project" onClick={()=>setProject('two')}>Other project</button><StudioPreview data={data} active={active} projectId={project} page={page} onClose={()=>setActive(false)}/></>};createRoot(document.getElementById('root')).render(<App/>);`,
);
await build({
  ...common,
  build: {
    outDir: path.join(dir, 'dist'),
    rolldownOptions: {
      input: [
        path.join(dir, 'index.html'),
        path.resolve('server/preview.html'),
      ],
    },
  },
});
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/api/source-preview') { res.setHeader('Content-Type','application/json'); res.end(JSON.stringify({modifiedFiles:[]})); return; }
    if (url.pathname === '/api/search-index') {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ version: 1, documents: [
        { id: 'demo', page: 'demo', title: 'Preview demo', text: 'Draft workshop' },
        { id: 'second', page: 'second', title: 'Second page', text: 'Other page' },
      ] }));
      return;
    }
    const file = path.join(
      dir,
      'dist',
      url.pathname === '/studio-preview' ? 'server/preview.html' : url.pathname,
    );
    res.setHeader(
      'Content-Type',
      /\.m?js$/.test(file)
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
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1400, height: 1000 },
  });
  page.setDefaultTimeout(20000);
  page.on('pageerror', (error) =>
    console.error('Browser error:', error.message),
  );
  await page.addInitScript(() => {
    window.previewMessages = [];
    window.addEventListener('message', (e) => {
      if (['prion-preview-data', 'prion-preview-patch'].includes(e.data?.type))
        window.previewMessages.push({
          type: e.data.type,
          bytes: JSON.stringify(e.data).length,
          keys: Object.keys(e.data.changes || {}),
          removed: e.data.removed || [],
        });
    });
  });
  await page.goto(
    'http://127.0.0.1:' +
      server.address().port +
      '/' +
      relative +
      '/index.html',
  );
  const preview = page.frameLocator('iframe[title="Complete website preview"]');
  await preview
    .getByRole('heading', { name: 'Preview demo', exact: true })
    .waitFor();
  const handle = await page
    .locator('iframe[title="Complete website preview"]')
    .elementHandle();
  const frame = await handle.contentFrame();
  const messages = () => frame.evaluate(() => window.previewMessages);
  assert.equal(
    (await messages()).length,
    1,
    'One initial snapshot, not ready plus load duplicates',
  );
  const widget = preview.frameLocator('iframe.custom-html-frame');
  await widget.getByRole('button', { name: '0', exact: true }).click();
  await page
    .getByRole('button', { name: 'Back to editor', exact: true })
    .click();
  await page.locator('#open').click();
  await widget.getByRole('button', { name: '1', exact: true }).waitFor();
  let entries = await messages();
  assert.equal(entries.length, 2);
  assert.equal(entries[1].type, 'prion-preview-patch');
  assert.deepEqual(entries[1].keys, []);
  assert.ok(entries[1].bytes < 250);
  await page
    .getByRole('button', { name: 'Back to editor', exact: true })
    .click();
  await page.locator('#draft').click();
  assert.equal(
    (await messages()).length,
    2,
    'Inactive preview receives no draft traffic',
  );
  await page.locator('#open').click();
  await preview
    .getByRole('heading', { name: 'Updated draft', exact: true })
    .waitFor();
  entries = await messages();
  assert.deepEqual(entries.at(-1).keys, ['layout:demo']);
  await widget.getByRole('button', { name: '1', exact: true }).waitFor();
  await page.locator('#delete').click();
  await frame.waitForFunction(() =>
    window.previewMessages.at(-1)?.removed.includes('unused:0'),
  );
  await page.getByRole('button', { name: 'Mobile', exact: true }).click();
  assert.equal(
    await page
      .locator('iframe[title="Complete website preview"]')
      .evaluate((e) => e.clientWidth),
    390,
  );
  await frame.evaluate(() => location.reload());
  await preview
    .getByRole('heading', { name: 'Updated draft', exact: true })
    .waitFor();
  assert.equal(
    (await messages())[0].type,
    'prion-preview-data',
    'Iframe reload receives a complete fresh snapshot',
  );
  await page.locator('#page').click();
  await preview
    .getByRole('heading', { name: 'Second page', exact: true })
    .waitFor();
  await page.locator('#project').click();
  await frame.waitForFunction(
    () => window.previewMessages.at(-1)?.type === 'prion-preview-data',
  );
  // Search is appended to document.body, outside the React preview root.
  // It must navigate the existing snapshot, never load a protected live page
  // into the preview iframe (which Cloudflare refuses to embed).
  const previewURL = frame.url();
  const initializations = await frame.evaluate(() => window.previewMessages.length);
  for (const [query, destination, keyboard] of [
    ['workshop', 'Updated draft', false],
    ['workshop', 'Updated draft', false],
    ['second', 'Second page', true],
    ['workshop', 'Updated draft', true],
  ]) {
    await preview.locator('body').evaluate(() => window.websiteSearch.open());
    await preview.getByRole('searchbox', { name: 'Search pages' }).fill(query);
    const result = preview.locator('.website-search ol a').first();
    await result.waitFor();
    if (keyboard) {
      await result.focus();
      await page.keyboard.press('Enter');
    } else await result.click();
    await preview.getByRole('heading', { name: destination, exact: true }).waitFor();
    assert.equal(frame.url(), previewURL, 'Search must not navigate the iframe document');
    assert.equal(await frame.evaluate(() => window.previewMessages.length), initializations);
    assert.equal(await preview.locator('.website-search dialog[open]').count(), 0);
  }
  await page.screenshot({ path: path.join(dir, 'search-navigation.png') });
  console.log(
    'PASS: unchanged reopen preserves widget state; draft delta, deletion, mobile viewport, iframe reload, page/project switching, and repeated mouse/keyboard search navigation within Preview.',
  );
  console.log(
    JSON.stringify({
      initialBytes: entries[0].bytes,
      unchangedReopenBytes: entries[1].bytes,
      titleEditBytes: entries[2].bytes,
    }),
  );
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
}
