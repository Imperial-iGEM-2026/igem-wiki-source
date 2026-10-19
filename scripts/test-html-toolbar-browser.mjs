import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'vite';
import { createServer } from 'node:http';
import { common } from './build-options.mjs';
const folder = await mkdtemp(path.resolve('work/html-toolbar-browser-'));
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
import {newNode,emptyLayout} from '/app/canvas-schema';
const initial=Object.fromEntries(Object.entries(templateDefaults('blank')).map(([id,value])=>[id,{value,version:1,author:'Test'}]));
initial['layout:home'].value=JSON.stringify({...emptyLayout,gap:16,nodes:[{...newNode('header','section'),name:'Site header',span:12},{...newNode('logo','html'),name:'Header logo',parentId:'header',minHeight:32,html:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path d="M16 2L30 16L16 30L2 16Z" fill="none" stroke="#8654ff" stroke-width="2"/></svg>'},{...newNode('brand','button','reGELerate'),parentId:'header'}],sidebar:false,order:['header','logo','brand'],customCss:'[data-layer-id="header"] > .canvas-children{display:flex!important;align-items:center;gap:12px}[data-layer-id="logo"] .media-html{padding:0!important;gap:0}[data-layer-id="header"]{display:flex!important;align-items:center;gap:12px;padding:20px}[data-layer-id="logo"]{width:32px!important;height:32px!important;min-height:32px!important;flex:none}[data-layer-id="brand"]{width:auto;flex:none}'});
function Test(){const[data,setData]=useState(()=>JSON.parse(sessionStorage.getItem('html-toolbar-test-v2')||'null')||initial);
return <CanvasContext.Provider value={{data,editing:!location.search.includes('publication'),busy:false,locked:false,dirty:()=>{},save:async(id,value,version)=>{setData(prev=>{const next={...prev,[id]:{value,version:version+1,author:'Test'}};sessionStorage.setItem('html-toolbar-test-v2',JSON.stringify(next));return next});return true;}}}><ImportedPage data={data} page="home" field={id=>data[id]?.value||''}/></CanvasContext.Provider>}
createRoot(document.getElementById('root')).render(<Test/>);`,
);
await writeFile(
  path.join(folder, 'preview.html'),
  '<!doctype html><div id="root"></div><script type="module" src="/server/preview-client.tsx"></script>',
);
const dist = path.join(folder, 'dist');
await build({
  ...common,
  build: {
    outDir: dist,
    rollupOptions: {
      input: [
        path.join(folder, 'index.html'),
        path.join(folder, 'preview.html'),
      ],
    },
  },
});
const server = createServer(async (req, res) => {
  try {
    if (req.url.startsWith('/templates/regelerate/')) {
      res.setHeader('Content-Type', 'image/svg+xml');
      res.end(
        '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200"><rect width="320" height="200" rx="16" fill="' +
          (req.url.includes('blue') ? '#2563eb' : '#f97316') +
          '"/><circle cx="160" cy="100" r="50" fill="white"/></svg>',
      );
      return;
    }
    const file = path.join(
      dist,
      req.url.startsWith('/studio-preview')
        ? relative + '/preview.html'
        : req.url.split('?')[0],
    );
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
await new Promise((resolve) => server.listen(52577, '127.0.0.1', resolve));

console.log(`http://127.0.0.1:${server.address().port}/${relative}/index.html`);
