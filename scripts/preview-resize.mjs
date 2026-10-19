import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'vite';
import { createServer } from 'node:http';
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
import {newNode,emptyLayout} from '/app/canvas-schema';
const initial=Object.fromEntries(Object.entries(templateDefaults('blank')).map(([id,value])=>[id,{value,version:1,author:'Test'}]));
initial['layout:home'].value=JSON.stringify({...emptyLayout,gap:16,nodes:[{...newNode('frame','section'),name:'Nested frame',span:8,layoutMode:'flow'},{...newNode('shape','shape'),name:'Blue rectangle',parentId:'frame',span:6,minHeight:160}],order:['frame','shape']});
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

console.log(`http://127.0.0.1:${server.address().port}/${relative}/index.html`);
