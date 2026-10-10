import assert from 'node:assert/strict';
import { readFile,readdir,stat,writeFile,mkdir } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const fixture=JSON.parse(await readFile('work/test-snapshot.json','utf8'));
const layout=JSON.parse(fixture.values['layout:home']);
layout.customCss='[data-layer-id="explore"] > section:nth-of-type(1) > h2:nth-of-type(1) { letter-spacing: -0.5px; } .feature h2 { color: #aabbcc; } @media (max-width: 760px) { .topic-grid { gap: 11px; } }';
const template=layout.nodes[0];
Object.assign(template,{tabletSpan:4,mobileSpan:12,paddingX:32,radius:16,fontSize:22,textColor:'#123456'});
for(const [kind,src] of [['video','https://video.igem.org/videos/embed/test-video'],['audio','https://static.igem.wiki/test/audio.mp3'],['pdf','https://static.igem.wiki/test/report.pdf'],['model','https://static.igem.wiki/test/model.glb'],['embed','https://video.igem.org/videos/embed/test-embed']])layout.nodes.push({...template,id:'test-'+kind,kind,src,title:'Test '+kind});
layout.nodes.push({...template,id:'nested-frame',kind:'section',src:'',layoutMode:'free'}, {...template,id:'nested-text',kind:'text',src:'',parentId:'nested-frame',body:'Nested exported content',x:15,y:30,freeWidth:40}, {...template,id:'nested-button',kind:'button',src:'',parentId:'nested-frame',linkTo:'/engineering',linkLabel:'Explore engineering'});
fixture.values['site:header']=JSON.stringify({name:'Imperial iGEM',logo:layout.nodes.find(n=>n.src?.startsWith('/api/media/'))?.src || '/prion-hero.png'});
fixture.values['layout:home']=JSON.stringify(layout);
const nonce=Date.now();const snapshot=`work/static-fixture-${nonce}.json`,output=`work/static-check-${nonce}`;
await writeFile(snapshot,JSON.stringify(fixture));
const compile=spawnSync(process.execPath,['scripts/export-static.mjs','--snapshot',snapshot,'--base','/test-team/','--out',output,'--igem'],{encoding:'utf8'});
if(compile.status!==2)throw Error(compile.stdout+compile.stderr);
const pub=path.resolve(output,'public'),files=[];
async function walk(dir){for(const entry of await readdir(dir,{withFileTypes:true})){const p=path.join(dir,entry.name);if(entry.isDirectory())await walk(p);else files.push(p);}}
await walk(pub);
const pages=files.filter(file=>file.endsWith('index.html'));assert.equal(pages.length,30);
const home=await readFile(path.join(pub,'index.html'),'utf8');
assert.ok(home.includes('Imperial iGEM'));
assert.ok(home.includes('Nested exported content'));
assert.ok(home.includes('Explore engineering'));
assert.ok(home.includes('href="/test-team/engineering/"') || home.includes('href="/test-team/engineering"'));
assert.ok(home.includes('First saved snapshot title')||home.includes('Second saved snapshot title'));
assert.ok(home.includes('grid-column:span 6'));assert.ok(home.includes('gap:18px'));assert.ok(home.indexOf('Exported image')<home.search(/<section[^>]*\sid="explore"/));
for(const style of ['--node-tablet-span:4','--node-mobile-span:12','padding-inline:32px','border-radius:16px','--node-font-size:22px','--node-color:#123456'])assert.ok(home.includes(style),style);
assert.ok(!home.includes('HIDDEN-DO-NOT-PUBLISH'));
assert.ok(home.includes('[data-page-css="home"] .feature h2'));assert.ok(home.includes('color: #aabbcc'));assert.ok(home.includes('@media (max-width: 760px)'));assert.ok(!home.includes('Design assistant'));assert.ok(home.includes('[data-layer-id="explore"] > section:nth-of-type(1) > h2:nth-of-type(1)'));assert.ok(!home.includes('studio-context-menu'));
for(const marker of ['<audio','<iframe','<model-viewer','src="https://video.igem.org/videos/embed/test-video"','class="static-nav"'])assert.ok(home.includes(marker),marker);
assert.ok(!home.includes('<video src="https://video.igem.org/videos/embed/'));
for(const file of pages){
  const html=await readFile(file,'utf8');assert.ok(!/\/(api|auth)\//.test(html));assert.ok(!/Sign in|Edit this page|Connecting workspace|Loading 3D viewer/.test(html));
  for(const match of html.matchAll(/(?:href|src)="(\/[^"#]*)(?:#[^"]*)?"/g)){
    const url=match[1];assert.ok(url.startsWith('/test-team/'),url);let target=path.join(pub,url.slice('/test-team/'.length));if((await stat(target)).isDirectory())target=path.join(target,'index.html');assert.ok((await stat(target)).isFile(),target);
  }
}
const report=JSON.parse(await readFile(path.join(output,'publication-report.json'),'utf8'));assert.equal(report.submissionReady,false);assert.ok(report.issues.length);
const runtime=await readFile(path.join(pub,'assets/wiki.js'),'utf8');assert.ok(!runtime.includes('/api/content'));assert.ok(!runtime.includes('Cloudflare Access'));
const second=spawnSync(process.execPath,['scripts/export-static.mjs','--snapshot',snapshot,'--out',output],{encoding:'utf8'});assert.notEqual(second.status,0);assert.ok(second.stderr.includes('not empty'));
console.log('PASS: 30 static routes, base paths and local assets, saved layout/order, hidden content excluded, media tags, no editor/auth API dependencies, iGEM preflight failure and overwrite protection.');
