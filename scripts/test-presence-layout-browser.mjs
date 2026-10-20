import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { build } from 'vite';
import { chromium } from '../upload-helper/node_modules/playwright/index.mjs';
import { common } from './build-options.mjs';

const dir = await mkdtemp(path.resolve('work/presence-layout-'));
await writeFile(path.join(dir, 'index.html'), '<div id="root"></div><script type="module" src="./entry.tsx"></script>');
await writeFile(path.join(dir, 'entry.tsx'), `
import React from 'react';
import {createRoot} from 'react-dom/client';
import {Popover,PopoverTrigger,PopoverContent,PopoverTitle} from '/components/ui/popover';
import '/app/globals.css';
const name='vasily.vanifilatoV25.very-long-email-address@imperial.ac.uk';
createRoot(document.getElementById('root')).render(<div style={{display:'flex',justifyContent:'flex-end',padding:12}}>
  <Popover><PopoverTrigger>Editing sessions</PopoverTrigger>
    <PopoverContent className="studio-presence-list" align="end" sideOffset={8}>
      <PopoverTitle>Editing now</PopoverTitle><ul>{Array.from({length:20},(_,i)=><li key={i}>
        <button type="button" title={name+' — Human Practices'} onClick={()=>document.body.dataset.visited=String(i)}>
          <i style={{background:'#6b52c8'}}>V</i><span><strong>{name}</strong><small>On Human Practices · A long selected section title that should also truncate</small></span><em>Go</em>
        </button></li>)}</ul>
    </PopoverContent>
  </Popover></div>);
`);
await build({...common, build:{outDir:path.join(dir,'dist'),rolldownOptions:{input:path.join(dir,'index.html')}}});
const server = createServer(async (req,res)=>{
  try {
    const file=path.join(dir,'dist',new URL(req.url,'http://localhost').pathname);
    res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');
    res.end(await readFile(file));
  } catch {res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({channel:'msedge',headless:true});
try {
  const page=await browser.newPage();
  for(const viewport of [{width:1440,height:900},{width:800,height:600},{width:320,height:480}]) {
    await page.setViewportSize(viewport);
    await page.goto(`http://127.0.0.1:${server.address().port}/${path.relative(process.cwd(),dir).replaceAll('\\','/')}/index.html`);
    await page.getByRole('button',{name:'Editing sessions',exact:true}).click();
    const panel=page.locator('.studio-presence-list');
    await panel.waitFor();
    const dimensions=await panel.evaluate(el=>{
      const rect=el.getBoundingClientRect(), list=el.querySelector('ul');
      return {
        left:rect.left,right:rect.right,bottom:rect.bottom,
        overflow:list.scrollWidth-list.clientWidth,
        scrolls:list.scrollHeight>list.clientHeight,
        contained:[...el.querySelectorAll('li button,li em')].every(child=>{
          const box=child.getBoundingClientRect();return box.left>=rect.left && box.right<=rect.right;
        }),
        truncated:el.querySelector('strong').scrollWidth>el.querySelector('strong').clientWidth,
      };
    });
    assert.ok(dimensions.left>=0 && dimensions.right<=viewport.width,JSON.stringify(dimensions));
    assert.ok(dimensions.bottom<=viewport.height,JSON.stringify(dimensions));
    assert.ok(dimensions.contained,'Actions stay inside the popup');
    assert.ok(dimensions.truncated,'Long names ellipsize');
    assert.ok(dimensions.overflow<=1,'No horizontal overflow');
    assert.ok(dimensions.scrolls,'Long presence list scrolls vertically');
    await panel.locator('li button').last().click();
    assert.equal(await page.locator('body').getAttribute('data-visited'),'19');
    await page.keyboard.press('Escape');
    await panel.waitFor({state:'hidden'});
  }
  console.log('PASS: presence popup bounds, long names, action visibility, vertical scrolling and navigation at desktop/tablet/mobile widths.');
} finally {await browser.close(); await new Promise(resolve=>server.close(resolve));}
