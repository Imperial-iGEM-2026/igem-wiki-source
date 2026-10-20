// Run after test-pdf-export.mjs with its printed fixture directory.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, writeFile, readdir, mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { PDFDocument } from 'pdf-lib';
import { chromium } from '../upload-helper/node_modules/playwright/index.mjs';
import {
  publicationRuntime,
  mappedRuntime,
  runtimeImports,
} from './publication-runtime.mjs';
import { PDF_WORKER_SOURCE } from './export-media.mjs';
import { artifactSize } from './artifact-size.mjs';

const fixture = path.resolve(process.argv[2]);
const map = JSON.parse(
  await readFile(path.join(fixture, 'source/publication/media-map.json')),
);
assert.equal(mappedRuntime(map).length, publicationRuntime.length);
assert.deepEqual(mappedRuntime({}), []);
for (const url of [
  'http://static.igem.wiki/a.js',
  'https://static.igem.wiki.evil/a.js',
  'https://user@static.igem.wiki/a.js',
  'https://static.igem.wiki/YOUR-TEAM/a.js',
]) {
  assert.throws(
    () => mappedRuntime({ [PDF_WORKER_SOURCE]: url }),
    /actual static.igem.wiki URL/,
  );
}
const plugin = runtimeImports(mappedRuntime(map));
assert.equal(plugin.resolveId('pdfjs-dist').external, true);
assert.equal(plugin.resolveId('pdfjs-dist/build/pdf.worker.min.mjs?url'), null);
assert.equal(runtimeImports([]).resolveId('pdf-lib'), null);

// Compare exactly the same website with only the previously hosted PDF worker.
const legacyMap = Object.fromEntries(
  Object.entries(map).filter(
    ([key]) =>
      key === PDF_WORKER_SOURCE ||
      !publicationRuntime.some((asset) => asset.source === key),
  ),
);
await writeFile(
  path.join(fixture, 'legacy-map.json'),
  JSON.stringify(legacyMap),
);
const legacyOut = await mkdtemp(path.join(fixture, 'legacy-render-'));
const build = spawnSync(
  process.execPath,
  [
    'scripts/export-static.mjs',
    '--snapshot',
    path.join(fixture, 'source/publication/content.json'),
    '--media-map',
    path.join(fixture, 'legacy-map.json'),
    '--media-dir',
    path.join(fixture, 'media'),
    '--base',
    '/example/',
    '--out',
    legacyOut,
  ],
  { encoding: 'utf8' },
);
assert.equal(build.status, 0, build.stdout + build.stderr);
const before = await artifactSize(legacyOut);
const after = await artifactSize(path.join(fixture, 'render'));
assert.ok(
  before.compressedEstimate - after.compressedEstimate > 500_000,
  JSON.stringify({ before, after }),
);
console.log(
  `Same fixture ZIP estimate: ${before.compressedEstimate} -> ${after.compressedEstimate} bytes (${before.compressedEstimate - after.compressedEstimate} bytes saved).`,
);

const publicRoot = path.join(fixture, 'render/public');
const server = createServer(async (req, res) => {
  try {
    let name = decodeURIComponent(
      new URL(req.url, 'http://localhost').pathname,
    ).replace(/^\/example\//, '');
    if (!name || name.endsWith('/')) name += 'index.html';
    const target = path.resolve(publicRoot, name);
    if (!target.startsWith(publicRoot + path.sep)) throw Error('Invalid path');
    res.setHeader(
      'Content-Type',
      {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.mjs': 'text/javascript',
        '.css': 'text/css',
        '.wasm': 'application/wasm',
        '.json': 'application/json',
      }[path.extname(target)] || 'application/octet-stream',
    );
    res.end(await readFile(target));
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const context = await browser.newContext({
    serviceWorkers: 'block',
    viewport: { width: 1440, height: 1000 },
  });
  const requested = new Set();
  const documents = await readdir(
    path.join(fixture, 'assets/assets/documents'),
  );
  await context.route('https://static.igem.wiki/**', async (route) => {
    const url = route.request().url();
    requested.add(url);
    const asset = publicationRuntime.find((item) => map[item.source] === url);
    let file;
    if (asset) file = path.resolve('node_modules', asset.file);
    else if (url.endsWith('/part-1.pdf'))
      file = path.join(
        fixture,
        'assets/assets/documents',
        documents.find((name) => name.endsWith('pages-1-2.pdf')),
      );
    else if (url.endsWith('/part-3.pdf'))
      file = path.join(
        fixture,
        'assets/assets/documents',
        documents.find((name) => name.endsWith('pages-3-4.pdf')),
      );
    else if (url.endsWith('/photo.jpg'))
      file = path.join(fixture, 'media/aacc.jpg');
    if (!file) return route.abort();
    await route.fulfill({
      body: await readFile(file),
      contentType: asset
        ? 'text/javascript'
        : file.endsWith('.pdf')
          ? 'application/pdf'
          : 'image/jpeg',
      headers: { 'access-control-allow-origin': '*' },
    });
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/example/`);
  await page.locator('[data-pdf-parts]').scrollIntoViewIfNeeded();
  await page.waitForSelector('.pdf-reader-sheet[data-rendered="true"] canvas', {
    timeout: 30000,
  });
  const downloadPromise = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Download complete PDF', exact: true })
    .click();
  const download = await downloadPromise;
  const merged = await PDFDocument.load(await readFile(await download.path()));
  assert.equal(merged.getPageCount(), 4);
  // Model-viewer is only imported when a model element exists at startup.
  // Load the same remote entry explicitly to exercise its standalone module.
  await page.evaluate(
    async (url) => {
      await import(url);
      await customElements.whenDefined('model-viewer');
    },
    map[
      publicationRuntime.find((item) => item.module === '@google/model-viewer')
        .source
    ],
  );
  for (const asset of publicationRuntime.filter((item) => item.forward)) {
    const result = await page.evaluate(async (url) => {
      const { default: factory } = await import(url);
      const decoder = await factory();
      const pointer = decoder._malloc(16);
      decoder.writeArrayToMemory(new Uint8Array(16), pointer);
      decoder._free(pointer);
      return (
        pointer > 0 &&
        (typeof decoder._jp2_decode === 'function' ||
          typeof decoder._jbig2_decode === 'function')
      );
    }, `/example/${asset.forward}`);
    assert.equal(result, true, asset.name);
  }
  for (const asset of publicationRuntime)
    assert.ok(requested.has(map[asset.source]), asset.name);
  assert.deepEqual(errors, []);
  console.log(
    'PASS: exported PDF renders via hosted worker, all four pages download, model viewer registers, and both forwarded PDF decoders initialize.',
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
