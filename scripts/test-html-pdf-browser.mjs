import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { build } from 'vite';
import { PDFDocument } from 'pdf-lib';
import { chromium } from '../upload-helper/node_modules/playwright/index.mjs';
import { common } from './build-options.mjs';
const dir = await mkdtemp(path.resolve('work/html-pdf-browser-'));
await writeFile(
  path.join(dir, 'index.html'),
  '<div id="root"></div><script type="module" src="./entry.tsx"></script>',
);
await writeFile(
  path.join(dir, 'entry.tsx'),
  `
import React,{useState}from'react';import{createRoot}from'react-dom/client';
import{CustomHtmlEditor}from'/app/custom-html-editor';import{CustomHtmlBlock}from'/app/custom-html-block';import{newNode}from'/app/canvas-schema';
function App(){const[n,set]=useState({...newNode('pdf','html'),html:'<p>Documents</p>'});return <><CustomHtmlEditor node={n} onChange={p=>set(n=>({...n,...p}))} onEnd={()=>{}}/><CustomHtmlBlock node={n}/><output id="saved">{n.html}</output></>};createRoot(document.getElementById('root')).render(<App/>);`,
);
await build({
  ...common,
  build: {
    outDir: path.join(dir, 'dist'),
    rolldownOptions: { input: path.join(dir, 'index.html') },
  },
});
const pdf = await PDFDocument.create();
pdf.addPage([200, 200]);
const bytes = Buffer.from(await pdf.save());
let reads = 0,
  uploads = 0;
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/api/media-ticket') {
      res.writeHead(404).end();
      return;
    }
    if (url.pathname === '/api/media' && req.method === 'POST') {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      assert.deepEqual(Buffer.concat(chunks), bytes);
      uploads++;
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          url: '/api/media/abcdef-1234.pdf',
          type: 'application/pdf',
        }),
      );
      return;
    }
    if (url.pathname === '/api/media/abcdef-1234.pdf') {
      assert.equal(
        req.headers['sec-fetch-site'],
        'same-origin',
        'PDF must load in the authenticated parent, not the opaque frame',
      );
      reads++;
      res.setHeader('Content-Type', 'application/pdf');
      res.end(bytes);
      return;
    }
    const file = path.join(dir, 'dist', url.pathname);
    res.setHeader(
      'Content-Type',
      /\.m?js$/.test(file)
        ? 'text/javascript'
        : file.endsWith('.css')
          ? 'text/css'
          : 'text/html',
    );
    res.end(await readFile(file));
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage();
  await page.goto(
    `http://127.0.0.1:${server.address().port}/${path.relative(process.cwd(), dir).replaceAll('\\', '/')}/index.html`,
  );
  await page
    .getByLabel('PDF link text', { exact: true })
    .fill('Ethics handbook');
  await page
    .getByLabel('Choose a PDF for this HTML block', { exact: true })
    .setInputFiles({
      name: 'handbook.pdf',
      mimeType: 'application/pdf',
      buffer: bytes,
    });
  await page.waitForFunction(() =>
    document.querySelector('#saved')?.textContent.includes('data-studio-pdf'),
  );
  assert.equal(uploads, 1);
  assert.ok(!(await page.locator('#saved').textContent()).includes('base64'));
  const link = page
    .frameLocator('.custom-html-frame')
    .getByRole('link', { name: 'Ethics handbook' });
  await link.click();
  await page.getByRole('button', { name: 'Close PDF', exact: true }).waitFor();
  await page.waitForFunction(() =>
    document
      .querySelector('dialog>div')
      ?.shadowRoot?.querySelector('.document')
      ?.shadowRoot?.querySelector('canvas'),
  );
  assert.ok(reads > 0);
  const download = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Download complete PDF', exact: true })
    .click();
  assert.ok((await download).suggestedFilename().endsWith('.pdf'));
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('dialog'));
  // Reuse the existing library URL without uploading bytes or adding a section.
  await page
    .getByLabel('Or reuse an uploaded PDF URL', { exact: true })
    .fill('/api/media/abcdef-1234.pdf');
  await page
    .getByRole('button', { name: 'Insert PDF link', exact: true })
    .click();
  assert.equal(uploads, 1);
  await page.evaluate(() => {
    document.body.dataset.customHtmlPdfs = JSON.stringify({
      '/documents/split/': [
        { start: 1, end: 1, url: '/api/media/abcdef-1234.pdf?part=1' },
        { start: 2, end: 2, url: '/api/media/abcdef-1234.pdf?part=2' },
      ],
    });
  });
  await page
    .getByLabel('HTML source', { exact: true })
    .fill('<a href="/documents/split/">Read split PDF</a>');
  await page
    .frameLocator('.custom-html-frame')
    .getByRole('link', { name: 'Read split PDF', exact: true })
    .click();
  await page.getByRole('button', { name: 'Close PDF', exact: true }).waitFor();
  const combinedDownload = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Download complete PDF', exact: true })
    .click();
  const combined = await combinedDownload;
  const merged = await PDFDocument.load(await readFile(await combined.path()));
  assert.equal(
    merged.getPageCount(),
    2,
    'Download must contain every PDF part',
  );
  await page.getByRole('button', { name: 'Close PDF', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('dialog'));
  console.log(
    'PASS: upload/reuse a PDF in custom HTML, opaque-frame click opens the parent reader, canvas renders, complete download and Escape work.',
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
