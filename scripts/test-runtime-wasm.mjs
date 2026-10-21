import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { PDFDocument, cmyk } from 'pdf-lib';
import { chromium } from '../upload-helper/node_modules/playwright/index.mjs';
import { publicationRuntime, pdfWorkerModule } from './publication-runtime.mjs';
import { verifyRuntimeAsset, repositoryFile } from '../upload-helper/files.mjs';

assert.ok(repositoryFile('scripts/publication-pages.mjs'));
const binaries = publicationRuntime.filter(asset => asset.binary);
for (const asset of binaries) {
  const bytes = await readFile('node_modules/' + asset.file);
  const row = { kind: 'runtime', localFile: 'node_modules/' + asset.file, url: 'https://static.igem.wiki/team/runtime/' + asset.source.split('/').pop() };
  const reply = (body = bytes, mime = 'application/wasm', cors = '*') => async () => new Response(body, { headers: { 'content-type': mime, 'access-control-allow-origin': cors } });
  await verifyRuntimeAsset(row, reply());
  await verifyRuntimeAsset(row, reply(bytes, 'application/octet-stream'));
  await assert.rejects(verifyRuntimeAsset(row, reply(bytes, 'text/html')), /WebAssembly/);
  await assert.rejects(verifyRuntimeAsset(row, reply(bytes, 'application/wasm', 'https://wrong.invalid')), /CORS/);
  await assert.rejects(verifyRuntimeAsset(row, reply(bytes.subarray(0, 10))), /does not match/);
}
const pdf = await PDFDocument.create();
pdf.addPage([100, 100]).drawRectangle({ x: 0, y: 0, width: 100, height: 100, color: cmyk(0, 1, 1, 0) });
const pdfBytes = await pdf.save();
const requests = [];
let origin, remote, mapped;
const server = createServer(async (req, res) => {
  try {
    requests.push({ url: req.url, header: req.headers['x-probe'] });
    res.setHeader('access-control-allow-origin', '*');
    if (req.url === '/') { res.setHeader('content-type', 'text/html'); return res.end('<html><body>PDF runtime test</body></html>'); }
    if (req.url === '/sample.pdf') { res.setHeader('content-type', 'application/pdf'); return res.end(pdfBytes); }
    if (req.url === '/worker.mjs' || req.url === '/probe-worker.mjs') {
      res.setHeader('content-type', 'text/javascript');
      return res.end(pdfWorkerModule(req.url === '/worker.mjs' ? remote + '/upstream-worker.mjs' : origin + '/probe.mjs', mapped, '/team/'));
    }
    if (req.url === '/probe.mjs') {
      res.setHeader('content-type', 'text/javascript');
      return res.end(`
        const results = [];
        for (const name of ${JSON.stringify(binaries.map(asset => asset.binary))}) {
          const response = await fetch('/team/' + name);
          const bytes = await response.arrayBuffer();
          await WebAssembly.compile(bytes);
          const xhr = new XMLHttpRequest(); xhr.open('GET', '/team/' + name, false); xhr.responseType = 'arraybuffer'; xhr.send();
          results.push([name, bytes.byteLength, xhr.response.byteLength]);
        }
        await fetch(new Request(${JSON.stringify(origin + '/unrelated')}, {headers:{'x-probe':'preserved'}}));
        postMessage(results);
        export const WorkerMessageHandler = {};
      `);
    }
    if (req.url === '/unrelated') return res.end('ok');
    let file;
    if (req.url === '/upstream-worker.mjs') file = 'pdfjs-dist/build/pdf.worker.min.mjs';
    if (req.url === '/pdf.mjs') file = 'pdfjs-dist/build/pdf.mjs';
    const asset = mapped.find(asset => new URL(asset.url).pathname === req.url);
    if (asset) file = asset.file;
    if (req.url === '/team/assets/pdfjs/iccs/CGATS001Compat-v2-micro.icc') file = 'pdfjs-dist/iccs/CGATS001Compat-v2-micro.icc';
    if (!file) { res.statusCode = 404; return res.end(); }
    res.setHeader('content-type', file.endsWith('.wasm') ? 'application/wasm' : file.endsWith('.icc') ? 'application/octet-stream' : 'text/javascript');
    res.end(await readFile('node_modules/' + file));
  } catch (error) { res.statusCode = 500; res.end(String(error)); }
});
await new Promise(resolve => server.listen(0, resolve));
origin = `http://127.0.0.1:${server.address().port}`;
remote = `http://localhost:${server.address().port}`;
mapped = binaries.map(asset => ({ ...asset, url: remote + '/uploads/unique-' + asset.source.split('/').pop() }));
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage();
  await page.goto(origin);
  const results = await page.evaluate(() => new Promise((resolve, reject) => {
    const worker = new Worker('/probe-worker.mjs', { type: 'module' });
    worker.onmessage = event => { worker.terminate(); resolve(event.data); };
    worker.onerror = error => { worker.terminate(); reject(Error(error.message)); };
  }));
  assert.equal(results.length, binaries.length);
  for (const [name, fetched, sync] of results) assert.equal(fetched, sync, name);
  assert.ok(requests.some(request => request.url === '/unrelated' && request.header === 'preserved'));
  const beforePdf = requests.length;
  const rendered = await page.evaluate(async () => {
    const pdfjs = await import('/pdf.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = '/worker.mjs';
    const task = pdfjs.getDocument({ url: '/sample.pdf', useWorkerFetch: true, wasmUrl: location.origin + '/team/assets/pdfjs/wasm/', iccUrl: location.origin + '/team/assets/pdfjs/iccs/' });
    const doc = await task.promise;
    const page = await doc.getPage(1);
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 100;
    const context = canvas.getContext('2d');
    await page.render({ canvasContext: context, viewport: page.getViewport({ scale: 1 }) }).promise;
    const pixel = [...context.getImageData(50, 50, 1, 1).data];
    await task.destroy(); return pixel;
  });
  assert.ok(rendered[0] > 150 && rendered[1] < 120 && rendered[2] < 120 && rendered[3] === 255, String(rendered));
  assert.ok(requests.slice(beforePdf).some(request => request.url.includes('qcms_bg.wasm')), 'Real PDF colour conversion must use the uploaded WASM');
  assert.ok(!requests.some(request => /^\/team\/assets\/pdfjs\/wasm\/.*\.wasm$/.test(request.url)), 'No deleted local WASM should be requested');
  console.log('PASS: all three uploaded WASM modules compile via worker fetch/XHR; real PDF worker renders CMYK; helper checks MIME, CORS and bytes.');
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
