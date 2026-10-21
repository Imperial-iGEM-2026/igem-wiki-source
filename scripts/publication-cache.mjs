import {createHash} from 'node:crypto';
import {readFile, writeFile, readdir} from 'node:fs/promises';
import path from 'node:path';
import {installExportCache} from '../app/export-cache-worker.js';
import {startExportCache} from '../app/export-cache-client.js';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export async function writePublicationCache(folder, base, external = []) {
  await writeFile(path.join(folder, 'cache-worker.js'), `(${installExportCache.toString()})(${JSON.stringify(base)});\n`);
  await writeFile(path.join(folder, 'cache-client.js'), `(${startExportCache.toString()})(${JSON.stringify(base)});\n`);
  const assets = [...external], pages = [];
  async function walk(directory = '') {
    for (const entry of (await readdir(path.join(folder, directory), {withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))) {
      const name = directory + entry.name;
      if (entry.isDirectory()) await walk(name + '/');
      else if (/\.(?:js|mjs|css|html)$/.test(name)) {
        const bytes = await readFile(path.join(folder, name));
        if (name.endsWith('.html')) pages.push({name, html:bytes.toString('utf8')});
        else assets.push({url:base + name, sha256:hash(bytes), bytes:bytes.length});
      }
    }
  }
  await walk();
  assets.sort((a,b)=>a.url.localeCompare(b.url));
  // Hash original HTML before adding the build marker; final page hashes below
  // cover exactly the bytes served, without a self-referential digest.
  const revision = hash(JSON.stringify({base, assets, pages:pages.map(p=>[p.name,hash(p.html)])}));
  const manifest = {version:1, base, revision, assets, pages:[]};
  for (const page of pages) {
    const html = page.html.replace('</head>', `<meta name="website-build" content="${revision}"><script defer src="${base}cache-client.js"></script></head>`);
    await writeFile(path.join(folder, page.name), html);
    manifest.pages.push({url:base + page.name.replace(/(^|\/)index\.html$/, '$1'), sha256:hash(html), bytes:Buffer.byteLength(html)});
  }
  await writeFile(path.join(folder,'cache-manifest.json'), JSON.stringify(manifest));
  return manifest;
}
