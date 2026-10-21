import { publicationRuntime } from './publication-runtime.mjs';
import jpeg from 'jpeg-js';
import assert from 'node:assert/strict';
import { PDFDocument, PDFName, PDFRawStream } from 'pdf-lib';
import { randomBytes } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { Writable } from 'node:stream';
import { spawnSync } from 'node:child_process';
import { createBundleExports } from '../selfhost-dist/server/export-bundles.mjs';
import { emptyLayout, newNode } from '../selfhost-dist/server/shared.mjs';
import { extractZip } from '../upload-helper/files.mjs';
import { PDF_WORKER_SOURCE } from './export-media.mjs';
const dir = await mkdtemp(path.resolve('work/pdf-export-'));
await mkdir(path.join(dir, 'media'));
const pdf = await PDFDocument.create();
for (let i = 0; i < 4; i++) {
  const page = pdf.addPage([300 + i, 400]);
  const content = Buffer.from(
    '%' + randomBytes(1600000).toString('hex') + '\n0 0 10 10 re S\n',
  );
  page.node.set(
    PDFName.of('Contents'),
    pdf.context.register(PDFRawStream.of(pdf.context.obj({}), content)),
  );
}
const bytes = await pdf.save();
assert.ok(bytes.length > 9000000);
await writeFile(path.join(dir, 'media/aabb.pdf'), bytes);
const layer = newNode('pdf-test', 'pdf');
layer.src = '/api/media/aabb.pdf';
const layout = structuredClone(emptyLayout);
const image = newNode('large-image', 'image');
image.src = '/api/media/aacc.jpg';
const smallJpeg = jpeg.encode(
  { width: 2, height: 2, data: Buffer.alloc(16, 255) },
  90,
).data;
await writeFile(
  path.join(dir, 'media/aacc.jpg'),
  Buffer.concat([smallJpeg, Buffer.alloc(10_000_000)]),
);
const animation = {
  ...newNode('custom-animation', 'html'),
  minHeight: 360,
  html: '<button id="animate">Animate</button><img src="/api/media/aacc.jpg">',
  css: 'button {color:blue}',
  javascript:
    'document.getElementById("animate").onclick = event => event.target.textContent="Animation works";',
};
layout.nodes = [layer, image, animation];
// Layout order uses stable node IDs.
layout.order = [layer.id, image.id, animation.id];
const exporter = createBundleExports({
  dataDir: dir,
  clientDir: path.resolve('selfhost-dist/client'),
});
const plan = await exporter.prepare({
  userId: 'test',
  project: { id: 'test', name: 'PDF test' },
  values: { 'layout:home': JSON.stringify(layout) },
  team: 'example',
});
for (const key of ['source', 'assets']) {
  const chunks = [];
  const response = new Writable({
    write(chunk, encoding, cb) {
      chunks.push(Buffer.from(chunk));
      cb();
    },
  });
  response.writeHead = () => {};
  await exporter.download({
    id: plan.id,
    key,
    userId: 'test',
    projectId: 'test',
    res: response,
  });
  const zip = path.join(dir, key + '.zip');
  await writeFile(zip, Buffer.concat(chunks));
  await extractZip(zip, path.join(dir, key));
}
const parts = JSON.parse(
  await readFile(path.join(dir, 'source/publication/pdf-parts.json'), 'utf8'),
);
assert.equal(parts['/api/media/aabb.pdf'].length, 2);
const manifest = await readFile(
  path.join(dir, 'assets/upload-manifest.csv'),
  'utf8',
);
assert.match(manifest, /pages-1-2.pdf/);
assert.match(manifest, /pages-3-4.pdf/);
assert.match(manifest, /pdfjs-6\.4\.299-worker\.js.*runtime/);
const runtimeFiles = await (await import('node:fs/promises')).readdir(path.join(dir, 'assets/assets/runtime'));
assert.equal(runtimeFiles.length, publicationRuntime.length + 1);
for (const asset of publicationRuntime) {
  const file = runtimeFiles.find((name) => name.endsWith(path.basename(asset.source)));
  assert.ok(file, asset.source);
  assert.deepEqual(await readFile(path.join(dir, 'assets/assets/runtime', file)), await readFile(path.join('node_modules', asset.file)));
}
const imageFolder = path.join(dir, 'assets/assets/images');
const imageFiles = await (
  await import('node:fs/promises')
).readdir(imageFolder);
const compressedImage = await readFile(
  path.join(
    imageFolder,
    imageFiles.find((n) => n.endsWith('aacc.jpg')),
  ),
);
assert.ok(compressedImage.length < 9_900_000);
assert.equal(jpeg.decode(compressedImage).width, 2);
const map = {
  ...Object.fromEntries(publicationRuntime.map((asset) => [asset.source, 'https://static.igem.wiki/teams/1/runtime/' + path.basename(asset.source)])),
  [PDF_WORKER_SOURCE]: 'https://static.igem.wiki/teams/1/runtime/pdf-worker.js',
  '/api/media/aacc.jpg': 'https://static.igem.wiki/teams/1/images/photo.jpg',
};
const search = JSON.parse(await readFile(path.join(dir, 'source/publication/search.json'), 'utf8'));
map[search.source] = 'https://static.igem.wiki/teams/1/runtime/' + path.basename(search.source);
for (const part of parts['/api/media/aabb.pdf'])
  map[part.source] =
    `https://static.igem.wiki/teams/1/documents/part-${part.start}.pdf`;
await writeFile(
  path.join(dir, 'source/publication/media-map.json'),
  JSON.stringify(map),
);
const result = spawnSync(
  process.execPath,
  [
    'scripts/export-static.mjs',
    '--snapshot',
    path.join(dir, 'source/publication/content.json'),
    '--media-map',
    path.join(dir, 'source/publication/media-map.json'),
    '--media-dir',
    path.join(dir, 'media'),
    '--base',
    '/example/',
    '--out',
    path.join(dir, 'render'),
  ],
  { encoding: 'utf8' },
);
assert.equal(result.status, 0, result.stdout + result.stderr);
const html = await readFile(path.join(dir, 'render/public/index.html'), 'utf8');
assert.match(
  html,
  /rel="icon" href="\/example\/templates\/notebook-purple\/studio-icon.svg"/,
);
assert.match(
  await readFile(
    path.join(dir, 'render/public/templates/notebook-purple/studio-icon.svg'),
    'utf8',
  ),
  /<svg/,
);
assert.match(html, /data-pdf-parts/);
assert.match(html, /assets\/pdfjs/);
assert.match(html, /Pages/);
assert.match(html, /custom-html-frame/);
assert.match(html, /sandbox="allow-scripts allow-same-origin allow-presentation"/);
const sharedURL = html.match(/data-html-source="([^"]+)"/)[1];
const sharedParts = JSON.parse(await readFile(path.join(dir, 'render/public', sharedURL.slice('/example/'.length)), 'utf8'));
const frameSource = (await Promise.all(sharedParts.map(async (part) => typeof part === 'string' ? part : JSON.parse(await readFile(path.join(dir, 'render/public', part.url.slice('/example/'.length)), 'utf8'))))).join('');
assert.match(frameSource, /Animation works/);
assert.ok(!frameSource.includes('/api/media/aacc.jpg'));
const js = await readFile(path.join(dir, 'render/public/assets/wiki.js'), 'utf8');
const publishedFiles = await (await import('node:fs/promises')).readdir(path.join(dir, 'render/public/assets'));
const allJs = (await Promise.all(publishedFiles.filter(name => /\.m?js$/.test(name)).map(name => readFile(path.join(dir, 'render/public/assets', name), 'utf8')))).join('\n');
assert.match(allJs, /https:\/\/static\.igem\.wiki\/teams\/1\/runtime\/pdf-worker.js/);
assert.match(allJs, /\/example\/assets\/pdf-worker-remote.mjs/);
await assert.rejects(readFile(path.join(dir, 'render/public/assets/pdf.worker.min.mjs')), { code: 'ENOENT' });
for (const asset of publicationRuntime) {
  if (asset.module) assert.ok(allJs.includes(map[asset.source]), asset.name);
  if (asset.binary) {
    await assert.rejects(readFile(path.join(dir, 'render/public', asset.binary)), { code: 'ENOENT' });
    assert.ok(allJs.includes(map[asset.source]), asset.name);
  }
  if (asset.forward) assert.equal(await readFile(path.join(dir, 'render/public', asset.forward), 'utf8'), `export { default } from ${JSON.stringify(map[asset.source])};\n`);
}
assert.ok(!publishedFiles.some((name) => /^(model-viewer|pdf|es)-[A-Za-z0-9_-]+\.js$/.test(name) && !name.startsWith('pdf-parts-viewer-')), publishedFiles.join(', '));
assert.ok(!html.includes('/api/media/aacc.jpg'));
assert.ok(!html.includes('<button id="animate">'));
assert.ok(!html.includes('src="/api/media/aabb.pdf"'));
exporter.close();
console.log(
  'PASS: two-ZIP export includes PDF worker and PDF parts; hosted mappings remove local worker; shared component reconstructs exactly. ' +
    dir,
);
