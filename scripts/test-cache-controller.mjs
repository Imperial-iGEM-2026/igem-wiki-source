import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import path from 'node:path';
import {writePublicationCache} from './publication-cache.mjs';
import {chromium} from '../upload-helper/node_modules/playwright/index.mjs';

const dir = await mkdtemp(path.resolve('work/cache-controller-'));
const builds = [];
for (const version of [1,2,3]) {
  const folder = path.join(dir,String(version));
  await mkdir(path.join(folder,'assets'),{recursive:true});
  await writeFile(path.join(folder,'assets/wiki.js'),`window.loadedVersion=${version}; window.loadLater=()=>import('./later.js');`);
  await writeFile(path.join(folder,'assets/later.js'),`export const version=${version};`);
  await writeFile(path.join(folder,'assets/style.css'),`body{--build:${version};background:rgb(${version},2,3)}`);
  await writeFile(path.join(folder,'index.html'),`<!doctype html><html><head><link rel="stylesheet" href="/team/assets/style.css"><script src="/team/assets/wiki.js"></script></head><body><input aria-label="Draft"><dialog><button onclick="this.parentElement.close()">Close</button></dialog><h1>Build ${version}</h1></body></html>`);
  builds.push({folder,manifest:await writePublicationCache(folder,'/team/')});
}
let deployed=0, stale=true, broken=false;
const requests=[];
const server=createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');requests.push(url.pathname+url.search);
  const relative=url.pathname.slice('/team/'.length)||'index.html';
  try {
    let bytes=await readFile(path.join(builds[deployed].folder,relative));
    if (relative==='assets/wiki.js' && (broken || stale && !url.searchParams.has('__website_asset'))) bytes=Buffer.from('window.loadedVersion=0;');
    if (relative==='assets/style.css' && stale && !url.searchParams.has('__website_asset')) bytes=Buffer.from('body{--build:0}');
    res.setHeader('content-type',relative.endsWith('.js')?'text/javascript':relative.endsWith('.css')?'text/css':relative.endsWith('.json')?'application/json':'text/html');
    res.setHeader('cache-control','public,max-age=86400');res.end(bytes);
  } catch {res.writeHead(404).end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const url='http://127.0.0.1:'+server.address().port+'/team/';
const browser=await chromium.launch({channel:'msedge',headless:true});
try {
  const context=await browser.newContext();
  const page=await context.newPage();let navigations=0;
  page.on('framenavigated',frame=>{if(frame===page.mainFrame())navigations++;});
  await page.goto(url+'?visitor=test#section');
  await page.waitForFunction(()=>window.loadedVersion===1 && window.websiteCache?.status.state==='verified');
  assert.equal(await page.evaluate(()=>getComputedStyle(document.body).getPropertyValue('--build')),'1');
  assert.ok(requests.some(u=>u.includes('wiki.js?__website_asset=')));
  assert.ok(requests.some(u=>u.includes('style.css?__website_asset=')));
  assert.equal(navigations,2,'Initial stale bytes repaired with one reload');
  assert.equal(new URL(page.url()).hash,'#section');
  assert.equal(new URL(page.url()).search,'?visitor=test');
  await page.evaluate(async()=>{await (await caches.open('another-team')).put('/unrelated',new Response('keep'));document.querySelector('dialog').showModal();});
  stale=false;deployed=1;
  await page.evaluate(()=>window.websiteCache.check());
  await page.waitForFunction(()=>window.websiteCache.status.state==='update-pending');
  assert.equal(await page.evaluate(()=>window.loadedVersion),1);
  assert.equal(await page.evaluate(async()=>(await window.loadLater()).version),1,'Old tab retains its lazy module until refreshed');
  await page.getByText('Close',{exact:true}).click();
  await page.waitForFunction(()=>window.loadedVersion===2 && window.websiteCache?.status.state==='verified');
  assert.equal(navigations,3,'One reload for new build');
  assert.equal(await page.evaluate(()=>getComputedStyle(document.body).getPropertyValue('--build')),'2');
  // Corruption in CacheStorage is repaired even without a new deployment.
  await page.evaluate(async()=>{
    const meta=await caches.open('website-cache:/team/:metadata');
    const active=await (await meta.match('/team/__cache_state?active')).json();
    await (await caches.open(active.cache)).put('/team/assets/wiki.js',new Response('corrupted'));
  });
  await page.evaluate(()=>window.websiteCache.check());
  assert.match(await page.evaluate(async()=>await(await fetch('/team/assets/wiki.js')).text()),/loadedVersion=2/);
  assert.equal(navigations,3,'No same-build reload loop');
  deployed=2;broken=true;
  const failed=await page.evaluate(()=>window.websiteCache.check());
  assert.equal(failed.ok,false,'Incomplete deployment is rejected');
  assert.match(await page.evaluate(async()=>await(await fetch('/team/assets/wiki.js')).text()),/loadedVersion=2/);
  assert.equal(await page.evaluate(async()=>await(await (await caches.open('another-team')).match('/unrelated')).text()),'keep');
  await context.setOffline(true);
  await page.reload();
  await page.waitForFunction(()=>window.loadedVersion===2);
  assert.equal(await page.evaluate(()=>getComputedStyle(document.body).getPropertyValue('--build')),'2');
  await context.close();
  deployed=0;broken=false;stale=false;
  const cleanContext=await browser.newContext();
  const clean=await cleanContext.newPage();let cleanNavigations=0;
  clean.on('framenavigated',frame=>{if(frame===clean.mainFrame())cleanNavigations++;});
  await clean.goto(url);
  await clean.waitForFunction(()=>window.websiteCache?.status.state==='verified');
  assert.equal(cleanNavigations,1,'Fresh correct assets do not require a reload');
  await clean.getByLabel('Draft').fill('Unsaved writing');
  deployed=1;
  await clean.evaluate(()=>window.websiteCache.check());
  assert.equal(await clean.evaluate(()=>window.websiteCache.status.state),'update-pending');
  assert.equal(await clean.getByLabel('Draft').inputValue(),'Unsaved writing');
  assert.equal(cleanNavigations,1,'An update must preserve unsaved input');
  await clean.evaluate(()=>window.websiteCache.reload());
  await clean.waitForFunction(()=>window.loadedVersion===2);
  await cleanContext.close();
  console.log('PASS: real browser repairs stale JS/CSS, retains stable URLs/anchors, updates once, defers dialogs, isolates old-tab modules, rejects partial updates, repairs cache corruption, preserves other caches and loads verified assets offline. '+dir);
} finally {await browser.close();await new Promise(r=>server.close(r));}
