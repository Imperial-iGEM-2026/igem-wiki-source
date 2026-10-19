// Serve actual editor components for browser pointer/keyboard and preview parity checks.
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'node:http';
import { build } from 'vite';
import { common } from './build-options.mjs';
const folder = await mkdtemp(path.resolve('work/html-position-'));
const relative = path.relative(process.cwd(), folder).replaceAll('\\', '/');
await writeFile(path.join(folder, 'index.html'), '<!doctype html><meta charset="utf-8"><title>Custom HTML positioning</title><div id="root"></div><script type="module" src="./entry.tsx"></script>');
await writeFile(path.join(folder, 'entry.tsx'), String.raw`
import React,{useRef,useState}from'react';import{createRoot}from'react-dom/client';
import{CanvasSurface}from'/app/canvas-surface';import{newNode,emptyLayout}from'/app/canvas-schema';
import{useCanvasObjectMove}from'/app/selection-move';import{pickDesignTarget}from'/app/studio-target';
import{applySelectionStyle}from'/app/selection-style';import{HtmlPositionControls}from'/app/html-position-controls';import'/app/globals.css';
const nodes=[{...newNode('html-demo','html'),span:12,minHeight:240,html:'<h2>Custom HTML animation</h2><p>Drag anywhere on this block to move it.</p><button onclick="this.textContent=\'Clicked\'">Interactive content</button>',css:'body{font:18px system-ui;margin:0;padding:24px;background:#eef4ff;color:#193456}h2{font-size:24px}'},{...newNode('next','text','Following section'),body:'Its layout should stay unchanged.'}];
const initial={...emptyLayout,sidebar:false,nodes,order:nodes.map(n=>n.id)};
function App(){const board=useRef(null),[layout,setLayout]=useState(initial),[target,setTarget]=useState(null),[locked,setLocked]=useState(false),[history,setHistory]=useState([]);
function move(t,x,y){if(locked)return;setHistory(h=>[...h,layout]);setLayout({...layout,customCss:applySelectionStyle(layout.customCss||'',t.selector,'translate',x+'px '+y+'px')})}
useCanvasObjectMove({artboard:board,target,zoom:1,disabled:false,canMove:()=>!locked,onSelect:setTarget,onMove:move});
const active={...layout,nodes:layout.nodes.map(n=>n.id==='html-demo'?{...n,locked}:n)};
return <div style={{padding:24,fontFamily:'system-ui'}}><h1 style={{fontSize:32}}>Custom HTML — move the whole block</h1><p>Editor on the left, Preview on the right. Both render the same saved layout.</p><div style={{display:'flex',gap:24}}><section className="studio" style={{width:560,position:"relative",inset:"auto",background:"white"}}><h2>Editor</h2><button onClick={()=>{setLayout(history.at(-1)||initial);setHistory(history.slice(0,-1))}}>Undo move</button><button onClick={()=>setLocked(!locked)}>{locked?'Unlock':'Lock'} block</button><div ref={board} tabIndex={0} className="studio-artboard" style={{position:'relative',left:'auto',top:'auto',transform:'none',width:540,border:'1px solid #ccd4df',marginTop:16}}><CanvasSurface layout={active} builtins={[]} templateId="blank" page="home" editing editorViewport viewport={540} selected={target?[target.layerId]:[]} onElementSelect={el=>setTarget(pickDesignTarget(el))}/></div><HtmlPositionControls artboard={board} id="html-demo" revision={layout} viewport={540} disabled={locked} onMove={(x,y)=>move({layerId:'html-demo',selector:'[data-layer-id="html-demo"]'},x,y)}/></section><section style={{width:540}}><h2>Preview</h2><CanvasSurface layout={layout} builtins={[]} templateId="blank" page="home" publication viewport={540}/></section></div><pre id="result">{JSON.stringify({target:target?.selector,css:layout.customCss||'',locked},null,2)}</pre></div>}
createRoot(document.getElementById('root')).render(<App/>);
`);
await build({ ...common, build: { outDir: path.join(folder, 'dist'), rolldownOptions: { input: path.join(folder, 'index.html') } } });
const server = createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    res.setHeader('Content-Type', pathname.endsWith('.js') ? 'text/javascript' : pathname.endsWith('.css') ? 'text/css' : 'text/html');
    res.end(await readFile(path.join(folder, 'dist', pathname === '/' ? relative + '/index.html' : pathname)));
  } catch { res.statusCode = 404; res.end(); }
});
await new Promise(resolve => server.listen(57826, '127.0.0.1', resolve));
console.log('http://127.0.0.1:57826/');
