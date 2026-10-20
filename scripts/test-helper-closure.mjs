import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir, symlink } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { extractZip } from '../upload-helper/files.mjs';
const root = await mkdtemp(path.resolve('work/helper-closure-'));
await extractZip('selfhost-dist/client/upload-helper.zip',root);
await symlink(path.resolve('upload-helper/node_modules'),path.join(root,'regelerate-upload-helper/node_modules'),'junction');
await import(pathToFileURL(path.join(root,'regelerate-upload-helper/sites.mjs')));
const {publicationSources} = await import(pathToFileURL(path.join(root,'regelerate-upload-helper/files.mjs')));
const source = JSON.parse(await readFile('selfhost-dist/server/export-source.json','utf8'));
source['publication/pdf-parts.json']='{}';
for (const [name, data] of Object.entries(source)) {
 const file=path.join(root,'source',name);await mkdir(path.dirname(file),{recursive:true});await writeFile(file,data);
}
const files=await publicationSources(path.join(root,'source'));
const names=new Set(files.map(f=>f.path));
for(const file of files.filter(f=>f.path.startsWith('scripts/'))) {
 for(const match of file.content.matchAll(/(?:from\s*|import\s*)['"](\.\.?\/[^'"]+\.mjs)['"]/g)) {
 const target=path.posix.normalize(path.posix.join(path.posix.dirname(file.path),match[1]));
 assert.ok(names.has(target),`${file.path} is missing ${target}`);
 }
}
for(const name of ['app/custom-html-block.tsx','app/html-document.ts','app/pdf-reader.css','scripts/pdf-parts.mjs','scripts/image-export.mjs','publication/pdf-parts.json','publication/katex-LICENSE.txt','publication/pdf-processing-LICENSES.txt']) assert.ok(names.has(name),name);
console.log('PASS: packaged helper publishes all compiler modules, PDF manifest and licences.');
