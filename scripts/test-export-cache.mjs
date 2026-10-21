import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import {createHash} from 'node:crypto';
const dir = await mkdtemp(path.resolve('work/export-cache-'));
const snapshot = path.join(dir, 'snapshot.json');
await writeFile(snapshot, JSON.stringify({format:'prion-wiki-snapshot',version:1,values:{'site:template':'blank'}}));
const outputs=[];
for (const version of ['before','after']) {
 const map=path.join(dir,version+'.json');
 await writeFile(map,JSON.stringify({'/templates/runtime/pdfjs-6.4.299-worker.js':'https://static.igem.wiki/team/'+version+'/worker.js'}));
 const output=path.join(dir,version);
 const run=spawnSync(process.execPath,['scripts/export-static.mjs','--snapshot',snapshot,'--media-map',map,'--base','/team/','--out',output],{encoding:'utf8'});
 assert.equal(run.status,0,run.stdout+run.stderr);
 const html=await readFile(path.join(output,'public/index.html'),'utf8');
 const runtime=html.match(/<script type="module" src="([^"]+)"/)[1];
 const styles=[...html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map(m=>m[1]).filter(url=>/\/assets\/[^/]+\.css$/.test(url));
 assert.equal(runtime,'/team/assets/wiki.js');
 assert.ok(styles.length);
 for(const url of [runtime,...styles]) assert.ok((await readFile(path.join(output,'public',url.slice('/team/'.length)))).length);
 const files=await readdir(path.join(output,'public/assets'));
 assert.ok(files.includes('wiki.js') && files.includes('style.css'));
 const manifest=JSON.parse(await readFile(path.join(output,'public/cache-manifest.json'),'utf8'));
 assert.ok(html.includes(manifest.revision));
 for(const entry of [...manifest.assets,...manifest.pages]) {
  if(!entry.url.startsWith('/team/')) continue;
  const relative=entry.url.slice('/team/'.length);
  const bytes=await readFile(path.join(output,'public',relative.endsWith('/')||!relative ? relative+'index.html' : relative));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),entry.sha256,entry.url);
 }
 assert.ok(manifest.assets.some(a=>a.url.includes('/'+version+'/worker.js')));
 outputs.push({revision:manifest.revision});
 const scripts=files.filter(f=>f.endsWith('.js'));
 for(const f of scripts){
  const source=await readFile(path.join(output,'public/assets',f),'utf8');
  for(const match of source.matchAll(/(?:from\s*|import\s*\()?["']\.\/([^"']+\.js)["']/g)) assert.ok(files.includes(match[1]),'Missing chunk: '+match[1]);
 }
 Object.assign(outputs.at(-1),{runtime,styles,scripts});
}
assert.equal(outputs[0].runtime,outputs[1].runtime);
assert.deepEqual(outputs[0].styles,outputs[1].styles);
assert.deepEqual(outputs[0].scripts,outputs[1].scripts);
assert.notEqual(outputs[0].revision,outputs[1].revision);
console.log('PASS: changed mappings retain stable filenames and update manifest hashes; all local files and final page hashes verified. '+dir);
