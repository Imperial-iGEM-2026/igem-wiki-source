import assert from 'node:assert/strict';
import {buildSearchIndex,newNode,emptyLayout} from '../selfhost-dist/server/shared.mjs';
import {readFile,mkdtemp} from 'node:fs/promises';
import path from 'node:path';
import {build} from 'vite';
import {chromium} from '../upload-helper/node_modules/playwright/index.mjs';
const text={...newNode('text','text'),title:'Fibril assembly',body:'Café protein hydrogel and crosslinking. 蛋白质'};
const hidden={...newNode('hidden','section'),hidden:true};
const child={...newNode('child','text'),parentId:'hidden',body:'SECRET_SUBTREE'};
const html={...newNode('html','html'),html:'<p>Accessible workshop &amp; education</p><script>SECRET_SCRIPT</script><style>SECRET_CSS</style>'};
const deleted={...newNode('deleted','text'),deleted:true,body:'SECRET_DELETED'};
const values={'site:template':'blank','pages:custom':JSON.stringify([{slug:'education',title:'Education'},{slug:'removed',title:'Removed'}]),'pages:removed':'["removed"]','layout:education':JSON.stringify({...emptyLayout,nodes:[text,hidden,child,html,deleted],order:['text','hidden','child','html','deleted']}),'layout:removed':JSON.stringify({...emptyLayout,nodes:[{...text,body:'SECRET_PAGE'}]})};
const development=['hp-backup-1','members-flip-test','results-rebuild-scratch'];
const regular=['contest','testing-methods'];
values['pages:custom']=JSON.stringify([...JSON.parse(values['pages:custom']),...[...development,...regular].map(slug=>({slug,title:slug}))]);
for(const slug of development)values['layout:'+slug]=JSON.stringify({...emptyLayout,nodes:[{...text,body:'SECRET_DEVELOPMENT'}]});
const before=JSON.stringify(values);
const index=buildSearchIndex(values),serialized=JSON.stringify(index);
assert.equal(JSON.stringify(values),before,'Indexing must not alter saved pages');
assert.ok(!index.documents.some(d=>development.includes(d.page)));
assert.ok(regular.every(slug=>index.documents.some(d=>d.page===slug)),'Only whole slug segments identify development copies');
assert.ok(serialized.includes('Café'));assert.ok(serialized.includes('Accessible workshop & education'));
assert.ok(!serialized.includes('SECRET_'));assert.ok(!index.documents.some(d=>d.page==='removed'));
assert.deepEqual(buildSearchIndex(values),index);
const dir=await mkdtemp(path.resolve('work/search-test-'));
await build({configFile:false,publicDir:false,logLevel:'error',build:{outDir:dir,emptyOutDir:false,minify:true,lib:{entry:path.resolve('app/site-search.ts'),formats:['es'],fileName:()=> 'search.js'}}});
const js=await readFile(path.join(dir,'search.js'),'utf8');
const {createWebsiteSearch}=await import((await import('node:url')).pathToFileURL(path.join(dir,'search.js')));
const quality=createWebsiteSearch(async()=>({version:1,documents:[
 {id:'main',page:'human-practices',title:'Human Practices',text:'Streptavidin hydrogel interviews'},
 {id:'section',page:'human-practices',title:'Human Practices · Interviews',text:'Streptavidin hydrogel interviews'},
 {id:'backup',page:'hp-backup-3',title:'Human Practices backup · Streptavidin hydrogel',text:'Streptavidin hydrogel interviews'},
 {id:'other',page:'description',title:'Description · Human Practices at a glance',text:'Science and human practices'},
 {id:'science',page:'simulations',title:'Simulations · HyFiP-LDF',text:'Biotin–streptavidin modelling'},
]}));
assert.equal((await quality.search('human practices'))[0].page,'human-practices');
assert.equal((await quality.search('Streptavidin HYDROGEL'))[0].page,'human-practices');
assert.equal((await quality.search('streptavidn'))[0].correction,'streptavidin');
assert.equal((await quality.search('hyfip ldf'))[0].page,'simulations');
assert.equal((await quality.search('our human practices'))[0].page,'human-practices');
const distinct=await quality.search('hydrogel');assert.equal(distinct.length,new Set(distinct.map(r=>r.page)).size);
assert.deepEqual(await quality.search('nonexistentthing'),[]);
assert.equal((await quality.search('hydrogel',{limit:1})).length,1);
// Optional local snapshot exercises relevance without committing private page content.
if(process.argv[2]) {
 const start=performance.now(),real=buildSearchIndex(JSON.parse(await readFile(process.argv[2],'utf8')));
 const actual=createWebsiteSearch(async()=>real);
 assert.ok(!real.documents.some(d=>/(?:^|-)(?:backup|test|scratch)(?:-|$)/i.test(d.page)),'No development pages in the exported index');
 const cases=[['human practices','human-practices'],['education','education'],['lab notebook','notebook'],['sponsor','sponsors'],['ethics','ethics'],['great exhibition road festival','education']];
 for(const [query,page] of cases)assert.equal((await actual.search(query))[0]?.page,page,query);
 assert.equal((await actual.search('streptavidn'))[0]?.correction,'streptavidin');
 for(const query of ['hydrogel','streptavidin','HyFiP','fibril']) {
  const found=await actual.search(query);assert.ok(found.length,query);
  assert.ok(!/(backup|test|scratch)/.test(found[0].page),query);
  assert.equal(found.length,new Set(found.map(r=>r.page)).size);
 }
 console.log(`PASS: real project relevance checks; ${real.documents.length} documents, ${Buffer.byteLength(JSON.stringify(real))} index bytes, ${Math.round(performance.now()-start)}ms including indexing and queries.`);
}
assert.ok(js.length<25000,'Search UI should remain small');
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage();
 await page.setContent('<html><body><button id="before">Before search</button></body></html>');
 await page.addStyleTag({content:await readFile(path.join(dir,'sites-project.css'),'utf8')});
 await page.evaluate(({js,index})=>new Promise((resolve,reject)=>{window.__index=index;window.__loads=0;const url=URL.createObjectURL(new Blob([js],{type:'text/javascript'}));import(url).then(m=>{window.__cleanup=m.startWebsiteSearch(async()=>{window.__loads++;return window.__index},'/imperial-college/');resolve()}).catch(reject)}),{js,index});
 assert.equal(await page.evaluate(()=>window.__loads),0);
 const found=await page.evaluate(()=>window.websiteSearch.search('cafe protein'));
 assert.equal(found[0].url,'/imperial-college/education/');
 assert.ok((await page.evaluate(()=>window.websiteSearch.search('蛋白质'))).length);
 assert.deepEqual(await page.evaluate(()=>window.websiteSearch.search('SECRET_SCRIPT')),[]);
 assert.equal(await page.evaluate(()=>window.__loads),1);
 await page.keyboard.press('Control+k');await page.getByRole('searchbox').fill('workshop');
 await page.getByRole('link').filter({hasText:'Education'}).waitFor();
 assert.equal(await page.getByRole('link').count(),1);
 await page.screenshot({path:path.join(dir,'search-desktop.png')});
 await page.setViewportSize({width:375,height:667});
 const rect=await page.locator('dialog').boundingBox();assert.ok(rect.x>=0 && rect.x+rect.width<=375);
 await page.screenshot({path:path.join(dir,'search-mobile.png')});
 await page.keyboard.press('Escape');assert.equal(await page.locator('dialog').evaluate(d=>d.open),false);
 await page.evaluate(()=>window.__cleanup());assert.equal(await page.locator('.website-search').count(),0);
 // Design uses the same project dialog, bounded to the visible scaled canvas.
 await page.setViewportSize({width:1200,height:800});
 await page.setContent('<button id="studio-control" style="position:fixed;left:10px;top:10px">Studio control</button><div class="studio-workspace"><div class="studio-stage" style="position:absolute;left:230px;top:100px;width:700px;height:550px;overflow:auto"><div class="studio-artboard" style="width:1000px;height:1600px;transform:scale(.65);transform-origin:top left"></div></div></div>');
 await page.addStyleTag({content:await readFile(path.join(dir,'sites-project.css'),'utf8')});
 await page.addStyleTag({content:'.website-search dialog{width:900px;max-height:90vh;margin:5vh auto;border-radius:28px}'});
 await page.evaluate(({js,index})=>new Promise((resolve,reject)=>{const url=URL.createObjectURL(new Blob([js],{type:'text/javascript'}));import(url).then(m=>{window.__cleanup=m.startWebsiteSearch(async()=>index,'/',document.body,u=>u,false);window.websiteSearch.open();resolve()}).catch(reject)}),{js,index});
 const assertContained=async()=>{
   const bounds=await page.evaluate(()=>{
     const d=document.querySelector('dialog').getBoundingClientRect(),a=document.querySelector('.studio-artboard').getBoundingClientRect(),s=document.querySelector('.studio-stage').getBoundingClientRect();
     return {ok:d.left>=Math.max(0,a.left,s.left)-1 && d.right<=Math.min(innerWidth,a.right,s.right)+1 && d.top>=Math.max(0,a.top,s.top)-1 && d.bottom<=Math.min(innerHeight,a.bottom,s.bottom)+1,modal:document.querySelector('dialog').matches(':modal'),chrome:document.elementFromPoint(20,20)?.id};
   });
   assert.ok(bounds.ok,'Search fits visible artboard');assert.equal(bounds.modal,false);assert.equal(bounds.chrome,'studio-control');
 };
 await assertContained();
 await page.getByRole('searchbox').fill('workshop');await page.getByRole('link').filter({hasText:'Education'}).waitFor();
 await page.screenshot({path:path.join(dir,'search-design.png')});
 await page.evaluate(()=>{document.querySelector('.studio-artboard').style.transform='scale(.4)';document.querySelector('.studio-stage').scrollTop=120;});
 await page.waitForTimeout(80);await assertContained();
 await page.setViewportSize({width:650,height:500});await page.waitForTimeout(80);await assertContained();
 await page.getByRole('button',{name:'Close search'}).click();
 assert.equal(await page.locator('.website-search-editor-open').count(),0);
 await page.evaluate(()=>window.websiteSearch.open());await page.getByRole('searchbox').press('Escape');
 assert.equal(await page.locator('.website-search-editor-open').count(),0);
 await page.evaluate(()=>window.websiteSearch.open());
 await page.evaluate(()=>document.querySelector('.studio-workspace').classList.add('studio-workspace-hidden'));
 await page.waitForTimeout(80);assert.equal(await page.locator('.website-search-editor-open').count(),0,'Preview switch removes editor overlay');
 await page.evaluate(()=>window.__cleanup());assert.equal(await page.locator('.website-search').count(),0);
 console.log('PASS: Design search stays in the canvas across zoom, scroll and resize; Studio chrome stays usable; close, Escape and preview switch clean up.');
 await page.evaluate(({js,index})=>new Promise((resolve,reject)=>{const url=URL.createObjectURL(new Blob([js],{type:'text/javascript'}));import(url).then(m=>{let count=0;window.__retry=m.createWebsiteSearch(async()=>{if(!count++)throw Error('offline');return index});resolve()}).catch(reject)}),{js,index});
 await assert.rejects(page.evaluate(()=>window.__retry.search('protein')),/offline/);
 assert.ok((await page.evaluate(()=>window.__retry.search('protein'))).length);
 console.log('PASS: hidden/deleted content excluded, Custom HTML text extracted, stable index, accent/CJK matching, lazy cached loads, keyboard UI, scoped URLs, error retry. Search JS '+js.length+' bytes.');
}finally{await browser.close();}
