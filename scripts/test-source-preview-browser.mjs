import { exportSource } from './export-source.mjs';
import { PDFDocument } from 'pdf-lib';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { build } from 'vite';
import { chromium } from '../upload-helper/node_modules/playwright/index.mjs';
import { common } from './build-options.mjs';
const dir =
  process.env.SOURCE_PREVIEW_TEST_DIST ||
  (await mkdtemp(path.resolve('work/preview-sync-')));
console.log('Fixture:', dir);
const relative = path.relative(process.cwd(), dir).replaceAll('\\', '/');
await writeFile(
  path.join(dir, 'index.html'),
  '<!doctype html><style>html,body,#root{height:100%;margin:0}.studio-full-preview{height:90vh}</style><div id="root"></div><script type="module" src="./entry.tsx"></script>',
);
await writeFile(
  path.join(dir, 'entry.tsx'),
  `
import React,{useState}from'react';import{createRoot}from'react-dom/client';import{StudioPreview}from'/app/studio-preview';import{SourceStudio}from'/app/source-studio';
import{templateDefaults}from'/app/templates';import{customDefaults}from'/app/custom-pages';import{newNode,CUSTOM_CONTENT}from'/app/canvas-schema';
import'/app/globals.css';import'/app/studio-polish.css';
const pages=JSON.stringify([{slug:'demo',title:'Preview demo'},{slug:'second',title:'Second page'}]);
const values={...templateDefaults('blank'),...customDefaults(pages),'pages:custom':pages};
for(const [slug,title] of [['demo','Preview demo'],['second','Second page']]){const l=JSON.parse(values['layout:'+slug]);l.nodes.find(n=>n.id==='custom-intro').title=title;values['layout:'+slug]=JSON.stringify(l)};const layout=JSON.parse(values['layout:demo']);const widget={...newNode('widget','html'),parentId:CUSTOM_CONTENT,minHeight:140,html:'<button id="counter">0</button>',javascript:"document.getElementById('counter').onclick=e=>e.target.textContent=String(Number(e.target.textContent)+1)"};const searchWidget={...newNode('search-widget','html'),parentId:CUSTOM_CONTENT,name:'Editable search',html:'',css:'',javascript:'',minHeight:320};layout.nodes.push(widget,searchWidget);layout.order.push(widget.id,searchWidget.id);values['layout:demo']=JSON.stringify(layout);
for(let i=0;i<36;i++)values['unused:'+i]='x'.repeat(80000);
const initial=Object.fromEntries(Object.entries(values).map(([k,value])=>[k,{value,version:1,author:''}]));
function App(){const[data,setData]=useState(initial),[active,setActive]=useState(true),[page,setPage]=useState('demo'),[project,setProject]=useState('one'),[editor,setEditor]=useState(false);if(editor)return <SourceStudio projectId='one' user={{id:'test-user',name:'Test user'}} startEditing initialData={data} wiki={{slug:'demo',title:'Preview demo'}}/>;return <><button id='edit-source' onClick={()=>setEditor(true)}>Edit project source</button><button id="open" onClick={()=>setActive(true)}>Open preview</button><button id="draft" onClick={()=>setData(d=>{const l=JSON.parse(d['layout:demo'].value);l.nodes.find(n=>n.id==='custom-intro').title='Updated draft';return {...d,'layout:demo':{value:JSON.stringify(l),version:2,author:''}}})}>Edit draft</button><button id="delete" onClick={()=>setData(d=>{const n={...d};delete n['unused:0'];return n})}>Delete row</button><button id="page" onClick={()=>setPage('second')}>Second page</button><button id="project" onClick={()=>setProject('two')}>Other project</button><StudioPreview data={data} active={active} projectId={project} page={page} onClose={()=>setActive(false)}/></>};createRoot(document.getElementById('root')).render(<App/>);`,
);
if (!process.env.SOURCE_PREVIEW_TEST_DIST)
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
const pdf = await PDFDocument.create();
pdf.addPage([200, 200]);
const pdfBytes = await pdf.save();
const imageBytes = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7R8AAAAASUVORK5CYII=',
  'base64',
);
const sourceFiles = await exportSource(process.cwd());
sourceFiles['server/source-preview-entry.tsx'] = await readFile(
  'server/source-preview-entry.tsx',
  'utf8',
);
sourceFiles['app/project-components/PreviewProbe.tsx'] =
  `import {PdfReader} from '../pdf-reader';export function PreviewProbe(){return <><a className="source-probe" href="/second">Source override works</a>{Array.from({length:16},(_,i)=><img className="probe-image" key={i} src={'/api/media/photo-'+i+'.png'} width="20"/>)}<PdfReader src="/api/media/test.pdf" title="Preview PDF"/></>}`;
sourceFiles['app/home.tsx'] =
  "import {PreviewProbe} from './project-components/PreviewProbe';\n" +
  sourceFiles['app/home.tsx'].replace(
    '{template ? (',
    '<PreviewProbe/>{template ? (',
  );
sourceFiles['app/globals.css'] +=
  '\n.source-probe{display:block;color:rgb(111,22,155);padding:13px}';
const compiler = JSON.parse(
  await readFile(
    'selfhost-dist/client/assets/source-preview/manifest.json',
    'utf8',
  ),
);
const savedRows = new Map();
let revision = 'first',
  sourceReads = 0;
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/api/projects') {res.setHeader('Content-Type','application/json');res.end(JSON.stringify({defaultId:'one',projects:[{id:'one',name:'Test project'}]}));return;}
    if (url.pathname === '/api/content') {
      res.setHeader('Content-Type','application/json');
      if(req.method==='POST') {
        assert.equal(req.headers['x-prion-project'],'one');
        let body='';for await(const chunk of req) body+=chunk;
        const value=JSON.parse(body);
        if(value.presence){res.end('{}');return;}
        const row={id:value.id,value:value.value,version:value.version+1,author:'Test user'};
        savedRows.set(row.id,row);res.end(JSON.stringify(row));return;
      }
      res.end(JSON.stringify({rows:[...savedRows.values()],people:[]}));return;
    }
    if (url.pathname === '/api/live') {
      if(req.method==='POST'){res.end('{}');return;}
      res.setHeader('Content-Type','text/event-stream');res.write('event: hello\ndata: {}\n\n');return;
    }
    if (url.pathname.startsWith('/api/media/')) {
      res.setHeader(
        'Content-Type',
        url.pathname.endsWith('.pdf') ? 'application/pdf' : 'image/png',
      );
      res.end(
        url.pathname.endsWith('.pdf') ? Buffer.from(pdfBytes) : imageBytes,
      );
      return;
    }
    if (url.pathname.startsWith('/templates/')) {
      res.setHeader('Content-Type', 'image/png');
      res.end(imageBytes);
      return;
    }
    if (url.pathname === '/api/source-preview') {
      if (url.searchParams.has('files')) sourceReads++;
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          revision,
          modifiedFiles: [{ path: 'app/site-header.tsx', version: 1 }],
          ...(url.searchParams.has('files')
            ? { files: sourceFiles, compiler }
            : {}),
        }),
      );
      return;
    }
    if (url.pathname === '/api/search-index') {
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          version: 1,
          documents: [
            {
              id: 'second',
              page: 'second',
              title: 'Second page',
              text: 'Other page',
            },
          ],
        }),
      );
      return;
    }
    const file = url.pathname.startsWith('/assets/source-preview/')
      ? path.join('selfhost-dist/client', url.pathname)
      : path.join(
          dir,
          'dist',
          url.pathname === '/studio-preview'
            ? 'server/preview.html'
            : url.pathname,
        );
    res.setHeader(
      'Content-Type',
      /\.m?js$/.test(file)
        ? 'text/javascript'
        : file.endsWith('.wasm')
          ? 'application/wasm'
          : file.endsWith('.css')
            ? 'text/css'
            : 'text/html',
    );
    res.end(await readFile(file));
  } catch (e) {
    res.writeHead(404).end(String(e));
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1400, height: 1000 },
  });
  page.setDefaultTimeout(60000);
  page.on('pageerror', (e) => console.error('BROWSER', e.stack));
  page.on('console', (m) => {
    if (m.type() === 'error') console.error('CONSOLE', m.text().slice(0, 1200));
  });
  await page.goto(
    'http://127.0.0.1:' +
      server.address().port +
      '/' +
      relative +
      '/index.html',
  );
  // Website version automatically uses source overrides without a separate opt-in.
  const preview = page.frameLocator('iframe[title="Developer source preview"]');
  try {
    await preview.getByText('Source override works', { exact: true }).waitFor();
  } catch (e) {
    console.error(
      'STATUS',
      await page.locator('.studio-source-preview').innerText(),
    );
    console.error((await preview.locator('body').innerText()).slice(0, 1500));
    throw e;
  }
  assert.equal(
    await preview
      .locator('.source-probe')
      .evaluate((e) => getComputedStyle(e).color),
    'rgb(111, 22, 155)',
  );
  await page.screenshot({ path: path.join(dir, 'source-preview.png') });
  assert.equal(await page.locator('.studio-preview-version').count(), 0);
  await page.getByRole('button', { name: 'Back to editor' }).click();
  await page.locator('#open').click();
  await preview.getByText('Source override works', { exact: true }).waitFor();
  assert.equal(
    sourceReads,
    1,
    'Reopening an unchanged preview reuses the compiled source',
  );
  const f = await (
    await page
      .locator('iframe[title="Developer source preview"]')
      .elementHandle()
  ).contentFrame();
  await f.waitForFunction(
    () =>
      [...document.querySelectorAll('.probe-image')].length === 16 &&
      [...document.querySelectorAll('.probe-image')].every(
        (i) => i.complete && i.naturalWidth > 0,
      ),
  );
  await preview.locator('.partitioned-pdf canvas').first().waitFor();
  await preview.locator('[data-layer-id=widget] iframe.custom-html-frame').scrollIntoViewIfNeeded();
  const custom = preview.frameLocator('[data-layer-id=widget] iframe.custom-html-frame');
  await custom.getByRole('button', { name: '0', exact: true }).click();
  await custom.getByRole('button', { name: '1', exact: true }).waitFor();
  const customSearch = await custom.locator('body').evaluate(async () => window.websiteSearch.search('Other page'));
  assert.equal(customSearch[0].page, 'second', 'Custom HTML can render real search results through the read-only API');
  assert.equal(
    await f.evaluate(() => {
      try {
        void parent.document;
        return false;
      } catch {
        return true;
      }
    }),
    true,
    'Opaque preview cannot access editor DOM',
  );
  assert.equal(
    await f.evaluate(async () => {
      try {
        await fetch('/api/content', { method: 'POST' });
        return false;
      } catch {
        return true;
      }
    }),
    true,
    'Preview cannot mutate server',
  );
  await f.evaluate(() => window.websiteAccessibility.setColorMode('high-contrast'));
  await preview.locator('html[data-website-color-mode="high-contrast"]').waitFor();
  await f.evaluate(() => window.websiteAccessibility.setColorMode('default'));
  await f.evaluate(() => window.websiteSearch.open());
  await preview
    .getByRole('searchbox', { name: 'Search pages' })
    .fill('Other page');
  await preview.locator('.website-search ol a').first().click();
  await preview
    .getByRole('heading', { name: 'Second page', exact: true })
    .waitFor();
  assert.ok(f.url().startsWith('data:'), 'Internal links remain in preview');
  await page.getByRole('button', { name: 'Mobile', exact: true }).click();
  assert.equal(
    await page
      .locator('iframe[title="Developer source preview"]')
      .evaluate((e) => e.clientWidth),
    390,
  );
  revision = 'newer';
  await page.evaluate(() => dispatchEvent(new Event('focus')));
  await page
    .getByRole('status')
    .filter({ hasText: 'New source changes available' })
    .waitFor();
  await page.locator('#edit-source').click();
  const editor = page.frameLocator('iframe[title="Website editor"]');
  await editor.getByText('Website Studio',{exact:true}).waitFor();
  await page.screenshot({path:path.join(dir,'source-editor.png')});
  assert.equal(await editor.locator('.studio-source-status').count(),0);
  assert.equal(await editor.locator('.source-probe').evaluate(e=>getComputedStyle(e).color),'rgb(111, 22, 155)');
  await editor.getByText('Overview',{exact:true}).click();
  await editor.getByLabel('Heading',{exact:true}).fill('Saved in source editor');
  await editor.getByLabel('Heading',{exact:true}).press('Tab');
  for(let i=0;i<80&&!savedRows.size;i++) await new Promise(r=>setTimeout(r,100));
  assert.match(savedRows.get('layout:demo')?.value || '', /Saved in source editor/);
  await editor.getByText('Editable search',{exact:true}).click();
  await editor.getByRole('button',{name:'Insert editable search interface',exact:true}).click();
  await editor.getByRole('button',{name:'Interact with HTML',exact:true}).click();
  const searchWidget = editor.frameLocator('[data-layer-id="search-widget"] iframe.custom-html-frame');
  await searchWidget.getByRole('searchbox').fill('Other page');
  await searchWidget.getByRole('button',{name:'Search',exact:true}).click();
  await searchWidget.getByRole('link',{name:'Second page',exact:true}).waitFor();
  await editor.getByRole('button',{name:'Done interacting',exact:true}).click();
  await editor.getByRole('button',{name:'Preview',exact:true}).click();
  const nested = editor.frameLocator('iframe[title="Developer source preview"]');
  await nested.getByRole('heading',{name:'Saved in source editor',exact:true}).waitFor();
  await nested.getByText('Source override works',{exact:true}).waitFor();
  assert.equal(await editor.locator('.studio-preview-version').count(),0);
  const ef = await (await page.locator('iframe[title="Website editor"]').elementHandle()).contentFrame();
  assert.equal(await ef.evaluate(async()=>{try{await fetch('/api/mcp-links',{method:'POST',body:'{}'});return false}catch{return true}}),true);
  assert.equal(await ef.evaluate(async()=>{try{await fetch('/api/projects',{method:'POST',body:'{}'});return false}catch{return true}}),true);
  console.log('PASS source editor selection, edit, save, matching nested preview and protected APIs');
  await editor.getByRole('button',{name:'Back to editor',exact:true}).click();

  await editor.getByRole('button',{name:'Connect AI',exact:true}).click();
  await page.getByRole('dialog').waitFor();
  assert.equal(await editor.getByRole('dialog').count(),0, 'Connection approval stays outside project source');
  await page.keyboard.press('Escape');
  sourceFiles['app/project-components/PreviewProbe.tsx'] =
    'export function broken( {';
  revision = 'broken';
  await page
    .getByRole('button', { name: 'Rebuild source preview', exact: true })
    .click();
  await page
    .getByRole('alert')
    .filter({ hasText: 'PreviewProbe.tsx' })
    .waitFor();
  assert.equal(await page.locator('.studio-preview-version').count(), 0);
  console.log(
    'PASS source overrides, imported component, custom CSS, opaque isolation, read-only fetch, internal navigation, responsive width, diagnostics without version chooser',
  );
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}
