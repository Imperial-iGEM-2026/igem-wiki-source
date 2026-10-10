import assert from 'node:assert/strict';
import { chromium } from '../upload-helper/node_modules/playwright/index.mjs';
import { createServer } from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { PDFDocument } from 'pdf-lib';
if (!process.argv[2])
  throw Error(
    'Pass the work/pdf-export-* directory printed by test-pdf-export.mjs',
  );
const root = path.resolve(process.argv[2]);
const server = createServer(async (req, res) => {
  try {
    const file = path.join(
      root,
      'render/public',
      decodeURIComponent(req.url.split('?')[0]).replace(/^\/example\//, ''),
    );
    const target = req.url.endsWith('/') ? path.join(file, 'index.html') : file;
    const bytes = await readFile(target);
    res.setHeader(
      'Content-Type',
      /\.(m?js)$/.test(target)
        ? 'text/javascript'
        : target.endsWith('.css')
          ? 'text/css'
          : 'text/html',
    );
    res.end(bytes);
  } catch {
    res.statusCode = 404;
    res.end();
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const browser = await chromium.launch({
  headless: true,
  executablePath:
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
});
try {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 900 },
    acceptDownloads: true,
  });
  await page.route('https://static.igem.wiki/**', async (route) => {
    const start = route.request().url().includes('part-1') ? '1-2' : '3-4';
    const folder = path.join(root, 'assets/assets/documents');
    const file = (await readdir(folder)).find((n) =>
      n.endsWith('pages-' + start + '.pdf'),
    );
    await route.fulfill({
      body: await readFile(path.join(folder, file)),
      contentType: 'application/pdf',
      headers: { 'Access-Control-Allow-Origin': '*' },
    });
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/example/`);
  const customFrame = page.frameLocator('.custom-html-frame');
  await customFrame
    .getByRole('button', { name: 'Animate', exact: true })
    .click();
  await customFrame
    .getByRole('button', { name: 'Animation works', exact: true })
    .waitFor();
  const viewer = page.locator('[data-pdf-parts]');
  await viewer.locator('.pdf-reader-sheet canvas').first().waitFor();
  await viewer.locator('[data-reader-page]').fill('3');
  await viewer.locator('[data-reader-page]').press('Enter');
  await viewer.locator('.pdf-reader-sheet[data-page="3"] canvas').waitFor();
  await viewer.locator('[data-reader="sidebar"]').click();
  await viewer.locator('[data-thumb] canvas').first().waitFor();
  await viewer.locator('[data-reader="plus"]').click();
  await viewer.locator('[data-reader="fit"]').click();
  await viewer.locator('[data-reader="prev"]').click();
  const downloadPromise = page.waitForEvent('download');
  await viewer.locator('[data-reader="download"]').click();
  const download = await downloadPromise;
  const file = path.join(root, 'complete.pdf');
  await download.saveAs(file);
  assert.equal(
    (await PDFDocument.load(await readFile(file))).getPageCount(),
    4,
  );
  await viewer.screenshot({ path: path.join(root, 'viewer.png') });
  console.log(
    'PASS: browser part navigation and complete four-page PDF download. ' +
      root,
  );
} finally {
  await browser.close();
  server.close();
}
