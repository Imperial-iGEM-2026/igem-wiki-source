import assert from 'node:assert/strict';
import { build } from 'esbuild-wasm';
const bundle = await build({entryPoints:['app/source-editor-policy.ts'],bundle:true,write:false,format:'esm',platform:'node'});
const {sourceEditorRequest: policy} = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const origin = 'https://studio.example';
const url = new URL('/api/content?project=other',origin);
const request = policy(url,'POST',JSON.stringify({id:'layout:home',value:'{}',version:2,projectId:'other'}),'mine',origin);
assert.equal(url.searchParams.get('project'),'mine');
assert.equal(request.headers['X-Prion-Project'],'mine');
assert.equal(JSON.parse(request.body).projectId,'mine');
assert.equal(request.headers.Authorization,undefined);
for(const path of ['/api/mcp-links','/api/template-change','/api/projects','/api/session','/api/export/bundles','/api/source-preview'])
  assert.equal(policy(new URL(path,origin),'POST','{}','mine',origin),null,path);
assert.equal(policy(new URL('/api/content','https://other.example'),'GET',undefined,'mine',origin),null);
assert.equal(policy(new URL('/api/content',origin),'GET',undefined,'',origin),null);
assert.equal(policy(new URL('/api/projects',origin),'POST',JSON.stringify({action:'rename',id:'other',name:'x'}),'mine',origin),null);
assert.ok(policy(new URL('/api/projects',origin),'POST',JSON.stringify({action:'rename',id:'mine',name:'x'}),'mine',origin));
assert.throws(()=>policy(new URL('/api/content',origin),'POST','[]','mine',origin));
console.log('PASS project-scoped editor requests, own-project rename, credential/admin isolation and request validation');
