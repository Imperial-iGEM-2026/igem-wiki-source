import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
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
 assert.match(runtime,/\/assets\/wiki-[\w-]+\.js$/);
 assert.ok(styles.length);
 for(const url of [runtime,...styles]) assert.ok((await readFile(path.join(output,'public',url.slice('/team/'.length)))).length);
 const files=await readdir(path.join(output,'public/assets'));
 assert.ok(!files.includes('wiki.js') && !files.includes('style.css'));
 const scripts=files.filter(f=>f.endsWith('.js'));
 for(const f of scripts){
  const source=await readFile(path.join(output,'public/assets',f),'utf8');
  for(const match of source.matchAll(/(?:from\s*|import\s*\()?["']\.\/([^"']+\.js)["']/g)) assert.ok(files.includes(match[1]),'Missing chunk: '+match[1]);
 }
 outputs.push({runtime,styles,scripts});
}
assert.notEqual(outputs[0].runtime,outputs[1].runtime);
assert.ok(outputs[0].styles.every(url=>!outputs[1].styles.includes(url)));
assert.ok(outputs[0].scripts.every(file=>!outputs[1].scripts.includes(file)));
console.log('PASS: changed media mappings produce new runtime, chunk and CSS URLs; all referenced files exist, without duplicate legacy assets. '+dir);
