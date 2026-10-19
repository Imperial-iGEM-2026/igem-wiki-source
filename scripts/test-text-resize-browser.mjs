// Browser regression: open ?refresh-during-drag, select the body and drag its
// right handle. A simulated teammate changes the section gap during the drag.
// Width must commit on pointerup, survive save/reload, and undo independently
// of the teammate's change. The authored rule deliberately uses the same
// high-specificity !important cap found on the live Education page.
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'vite';
import { createServer } from 'node:http';
import { common } from './build-options.mjs';
const folder = await mkdtemp(path.resolve('work/text-width-browser-'));
const relative = path.relative(process.cwd(), folder).replaceAll('\\', '/');
await writeFile(
  path.join(folder, 'index.html'),
  '<!doctype html><div id="root"></div><script type="module" src="./entry.tsx"></script>',
);
await writeFile(
  path.join(folder, 'entry.tsx'),
  `
import React,{useState,useEffect} from 'react';
import {createRoot} from 'react-dom/client';
import {CanvasContext} from '/app/page-canvas';
import {ImportedPage} from '/app/template-renderer';
import {templateDefaults} from '/app/templates';
import '/app/globals.css';import '/app/studio.css';
import {newNode,emptyLayout} from '/app/canvas-schema';
const initial=Object.fromEntries(Object.entries(templateDefaults('blank')).map(([id,value])=>[id,{value,version:1,author:'Test'}]));
initial['layout:home'].value=JSON.stringify({...emptyLayout,gap:16,nodes:[{...newNode('frame','section'),name:'Nested frame',span:8,layoutMode:'flow'},{...newNode('text-box','text','Final day: Speeches and sales'),name:'Final day',parentId:'frame',span:12,body:'On the final day, students gave speeches about their experience of Gridless. They then presented and sold their products to us and their parents. One team built an educational board game with levels of questions for different stages, designed to pull children away from their phones and make learning fun. The other built a grow-your-own kit with everything needed to grow salad foods, so people eat healthily because they know what goes into their food.'}],sidebar:false,order:['frame','text-box'],customCss:'[data-layer-id="frame"].canvas-section.canvas-section .media-text .custom-text {max-width:400px !important; font-size:17px !important; line-height:1.75 !important; margin:0 !important}'});
function Test(){const[data,setData]=useState(()=>JSON.parse(sessionStorage.getItem('text-width-persistence-test')||'null')||initial);
useEffect(()=>{if(!location.search.includes('refresh-during-drag'))return;let timer;const refresh=e=>{if(!e.target.closest('.studio-object-resize'))return;timer=setTimeout(()=>setData(prev=>{const row=prev['layout:home'];const layout=JSON.parse(row.value);layout.gap=layout.gap===16?18:16;return {...prev,'layout:home':{...row,value:JSON.stringify(layout),version:row.version+1}}}),30)};document.addEventListener('pointerdown',refresh,true);return()=>{clearTimeout(timer);document.removeEventListener('pointerdown',refresh,true)}},[]);
return <CanvasContext.Provider value={{data,editing:!location.search.includes('publication'),busy:false,locked:false,dirty:()=>{},save:async(id,value,version)=>{setData(prev=>{const next={...prev,[id]:{value,version:version+1,author:'Test'}};sessionStorage.setItem('text-width-persistence-test',JSON.stringify(next));return next});return true;}}}><ImportedPage data={data} page="home" field={id=>data[id]?.value||''}/></CanvasContext.Provider>}
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
await new Promise((resolve) => server.listen(52574, '127.0.0.1', resolve));

console.log(`http://127.0.0.1:${server.address().port}/${relative}/index.html`);
