import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'vite';
import { createServer } from 'node:http';
import { common } from './build-options.mjs';
const folder = await mkdtemp(path.resolve('work/editor-ux-browser-'));
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
initial['layout:home'].value=JSON.stringify({...emptyLayout,gap:16,nodes:[{...newNode('frame','text','Pictures and text'),name:'Text with pictures',span:12,body:('This writing stays intact while adding, moving and layering independent pictures.'+String.fromCharCode(10,10)).repeat(12)},{...newNode('photo-one','image'),parentId:'frame',name:'Blue picture',src:'/templates/regelerate/blue.svg',alt:'Blue picture',span:6},{...newNode('photo-two','image'),parentId:'frame',name:'Orange picture',src:'/templates/regelerate/orange.svg',alt:'Orange picture',span:6}],sidebar:false,order:['frame','photo-one','photo-two'],customCss:'[data-layer-id="photo-one"] {translate:200px 0} [data-layer-id="photo-two"] {translate:-100px 0}'});
function Test(){const[data,setData]=useState(()=>JSON.parse(sessionStorage.getItem('editor-ux-test')||'null')||initial);
return <CanvasContext.Provider value={{data,editing:!location.search.includes('publication'),busy:false,locked:false,dirty:()=>{},save:async(id,value,version)=>{setData(prev=>{const next={...prev,[id]:{value,version:version+1,author:'Test'}};sessionStorage.setItem('editor-ux-test',JSON.stringify(next));return next});return true;}}}><ImportedPage data={data} page="home" field={id=>data[id]?.value||''}/></CanvasContext.Provider>}
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
await new Promise((resolve) => server.listen(52576, '127.0.0.1', resolve));

console.log(`http://127.0.0.1:${server.address().port}/${relative}/index.html`);
