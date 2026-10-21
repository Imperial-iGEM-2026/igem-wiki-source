import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { build } from 'vite';
import { chromium } from '../upload-helper/node_modules/playwright/index.mjs';
import { common } from './build-options.mjs';
import { PDFDocument, rgb } from 'pdf-lib';
import { PNG } from 'pngjs';
const dir = await mkdtemp(path.resolve('work/accessibility-browser-'));
await writeFile(
  path.join(dir, 'index.html'),
  '<div id="root"></div><script type="module" src="./entry.tsx"></script>',
);
await writeFile(
  path.join(dir, 'entry.tsx'),
  `
import React from'react';import{createRoot}from'react-dom/client';import{CustomHtmlBlock}from'/app/custom-html-block';import{newNode}from'/app/canvas-schema';import{startWebsiteAccessibility}from'/app/site-accessibility';import{PdfReader}from'/app/pdf-reader';
const html='<button data-website-color-toggle>Widget colours</button><p style="color:rgb(180,100,200)">Widget text</p><svg width="20" height="20"><rect width="20" height="20" fill="#ee0099"/></svg><video width="40" height="40"></video><canvas width="40" height="40"></canvas><img id="widget-photo" width="40" height="40" src="data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2740%27 height=%2740%27%3E%3Crect width=%2740%27 height=%2740%27 fill=%27%23b464c8%27/%3E%3C/svg%3E"/>';
createRoot(document.getElementById('root')).render(<><button data-website-color-toggle>High contrast colours</button><p id="text" style={{color:'rgb(180,100,200)'}}>Readable text</p><a id="link" href="#target">Read more</a><div data-preserve-colors><p id="diagram" style={{color:'rgb(190,20,90)'}}>Diagram label</p><svg id="preserved-logo" width="20" height="20"><rect width="20" height="20" fill="#b464c8"/></svg></div><img id="photo" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20'%3E%3Crect width='20' height='20' fill='%23b464c8'/%3E%3C/svg%3E"/><svg id="logo" width="40" height="40"><rect width="40" height="40" fill="#b464c8"/><svg width="10" height="10"/></svg><video id="video" width="40" height="40" muted autoPlay/><iframe id="embedded-video" title="External player" sandbox="" srcDoc={'<body style="margin:0;background:rgb(180,100,200)">Video player</body>'} width="120" height="80"/><object id="pdf-object" type="application/pdf" data="/fixture.pdf" width="100" height="80"/><div id="background-logo" data-website-media style={{width:40,height:40,backgroundImage:'linear-gradient(#b464c8,#b464c8)'}}/><CustomHtmlBlock node={{...newNode('widget','html'),html,css:'#widget-photo {filter:none!important}'}}/><div data-preserve-colors><CustomHtmlBlock node={{...newNode('preserved-widget','html'),html:'<img alt="Preserved widget photo" src="data:image/svg+xml,%3Csvg xmlns=\"http://www.w3.org/2000/svg\"/%3E"/>'}}/></div><div style={{width:360}}><PdfReader src="/fixture.pdf" title="Test PDF"/></div></>);
startWebsiteAccessibility('fixture');
`,
);
await build({
  ...common,
  build: {
    outDir: path.join(dir, 'dist'),
    rolldownOptions: { input: path.join(dir, 'index.html') },
  },
});
const pdf = await PDFDocument.create();
pdf
  .addPage([200, 200])
  .drawRectangle({
    x: 0,
    y: 0,
    width: 200,
    height: 200,
    color: rgb(0.7, 0.4, 0.8),
  });
const pdfBytes = Buffer.from(await pdf.save());
const server = createServer(async (req, res) => {
  try {
    if (req.url === '/fixture.pdf') {
      res.setHeader('Content-Type', 'application/pdf');
      res.end(pdfBytes);
      return;
    }
    const file = path.join(
      dir,
      'dist',
      new URL(req.url, 'http://localhost').pathname,
    );
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
  page.on('pageerror', (error) => console.log('PAGE ERROR', error.message));
  await page.goto(
    `http://127.0.0.1:${server.address().port}/${path.relative(process.cwd(), dir).replaceAll('\\', '/')}/index.html`,
  );
  const widget = page.frameLocator(
    '.custom-html-block:not([data-preserve-colors] *) .custom-html-frame',
  );
  await widget.getByText('Widget text', { exact: true }).waitFor();
  await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 40;
    canvas.getContext('2d').fillStyle = 'rgb(180,100,200)';
    canvas.getContext('2d').fillRect(0, 0, 40, 40);
    const video = document.querySelector('#video');
    video.srcObject = canvas.captureStream(1);
    await video.play();
  });
  const pdfCanvas = page.locator('.pdf-reader-sheet canvas').first();
  await page.locator('.partitioned-pdf').scrollIntoViewIfNeeded();
  await pdfCanvas.waitFor();
  const pixel = async (locator) => {
    const png = PNG.sync.read(await locator.screenshot());
    const i =
      (Math.floor(png.height * 0.7) * png.width + Math.floor(png.width * 0.7)) *
      4;
    return [...png.data.subarray(i, i + 3)];
  };
  const samples = [
    page.locator('#photo'),
    page.locator('#logo'),
    page.locator('#video'),
    page.locator('#embedded-video'),
    pdfCanvas,
    widget.locator('svg:not([aria-hidden])'),
    widget.locator('#widget-photo'),
  ];
  const originals = [];
  for (const sample of samples) originals.push(await pixel(sample));
  await page
    .getByRole('button', { name: 'High contrast colours', exact: true })
    .click();
  assert.equal(
    await page.locator('#text').evaluate((el) => getComputedStyle(el).color),
    'rgb(23, 32, 51)',
  );
  assert.equal(
    await page.locator('#link').evaluate((el) => getComputedStyle(el).color),
    'rgb(0, 71, 171)',
  );
  assert.ok(
    (
      await page
        .locator('#link')
        .evaluate((el) => getComputedStyle(el).textDecorationLine)
    ).includes('underline'),
  );
  await widget
    .locator('html[data-website-color-mode="high-contrast"]')
    .waitFor();
  assert.equal(
    await widget
      .getByText('Widget text', { exact: true })
      .evaluate((el) => getComputedStyle(el).color),
    'rgb(23, 32, 51)',
  );
  assert.equal(
    await widget.locator('rect').evaluate((el) => getComputedStyle(el).fill),
    'rgb(238, 0, 153)',
  );
  assert.equal(
    await page.locator('#diagram').evaluate((el) => getComputedStyle(el).color),
    'rgb(190, 20, 90)',
  );
  assert.equal(
    await page.locator('#photo').evaluate((el) => getComputedStyle(el).filter),
    'contrast(1.25)',
  );
  for (const selector of [
    '#logo',
    '#video',
    '#embedded-video',
    '#pdf-object',
    '#background-logo',
    '.partitioned-pdf',
  ])
    assert.equal(
      await page
        .locator(selector)
        .first()
        .evaluate((el) => getComputedStyle(el).filter),
      'contrast(1.25)',
      selector,
    );
  for (const selector of ['#preserved-logo', '#logo svg', '.custom-html-frame'])
    assert.ok(
      (
        await page
          .locator(selector)
          .evaluateAll((els) => els.map((el) => getComputedStyle(el).filter))
      ).every((value) => value === 'none'),
      selector + ' must not be filtered twice or when exempt',
    );
  for (const selector of ['svg:not([aria-hidden])', 'video', 'canvas'])
    assert.equal(
      await widget
        .locator(selector)
        .evaluate((el) => getComputedStyle(el).filter),
      'contrast(1.25)',
    );
  const preserved = page.frameLocator(
    '[data-preserve-colors] .custom-html-frame',
  );
  await preserved.locator('html[data-website-color-mode="default"]').waitFor();
  assert.equal(
    await preserved
      .locator('img')
      .evaluate((el) => getComputedStyle(el).filter),
    'none',
  );
  for (let i = 0; i < samples.length; i++)
    assert.notDeepEqual(
      await pixel(samples[i]),
      originals[i],
      'Rendered pixels change for media ' + i,
    );
  await page.evaluate(() =>
    window.websiteAccessibility.setColorMode('default'),
  );
  for (let i = 0; i < samples.length; i++)
    assert.deepEqual(
      await pixel(samples[i]),
      originals[i],
      'Original media pixels restored ' + i,
    );
  const modePixels = [];
  for (const mode of [
    'protanopia',
    'deuteranopia',
    'tritanopia',
    'grayscale',
  ]) {
    await page.evaluate(
      (mode) => window.websiteAccessibility.setColorMode(mode),
      mode,
    );
    await widget
      .locator('html[data-website-color-mode="' + mode + '"]')
      .waitFor();
    for (let i = 0; i < samples.length; i++)
      assert.notDeepEqual(
        await pixel(samples[i]),
        originals[i],
        mode + ' visibly affects media ' + i,
      );
    modePixels.push(await pixel(page.locator('#photo')));
    await page.evaluate(() => window.websiteAccessibility.setColorStrength(0));
    for (let i = 0; i < samples.length; i++)
      assert.deepEqual(
        await pixel(samples[i]),
        originals[i],
        'Zero strength restores media ' + i,
      );
    await page.evaluate(() => window.websiteAccessibility.setColorStrength(1));
  }
  assert.equal(
    new Set(modePixels.map((p) => p.join(','))).size,
    4,
    'Assistance presets produce distinct outputs',
  );
  await page.getByRole('button', { name: '◐ Colours', exact: true }).click();
  await page
    .getByLabel('Colour assistance', { exact: true })
    .selectOption('deuteranopia');
  await page.getByRole('slider').press('End');
  for (let step = 0; step < 7; step++)
    await page.getByRole('slider').press('ArrowLeft');
  assert.equal(
    await page.evaluate(() => window.websiteAccessibility.getColorStrength()),
    0.65,
  );
  await page.screenshot({
    path: path.join(dir, 'colour-preferences-desktop.png'),
  });
  await page.setViewportSize({ width: 375, height: 667 });
  const bounds = await page
    .getByRole('dialog', { name: 'Colour preferences' })
    .boundingBox();
  assert.ok(
    bounds.x >= 0 &&
      bounds.x + bounds.width <= 375 &&
      bounds.y >= 0 &&
      bounds.y + bounds.height <= 667,
  );
  await page.screenshot({
    path: path.join(dir, 'colour-preferences-mobile.png'),
  });
  await page.keyboard.press('Escape');
  await page.reload();
  await page.waitForFunction(
    () =>
      window.websiteAccessibility?.getColorMode() === 'deuteranopia' &&
      window.websiteAccessibility.getColorStrength() === 0.65,
  );
  await widget
    .locator('html[data-website-color-mode="deuteranopia"]')
    .waitFor();
  await widget
    .locator('body')
    .evaluate(() => window.websiteAccessibility.setColorMode('tritanopia'));
  await page.waitForFunction(
    () => window.websiteAccessibility.getColorMode() === 'tritanopia',
  );
  await page.evaluate(() => window.websiteAccessibility.openSettings());
  await page.getByRole('button', { name: 'Reset to original' }).click();
  assert.equal(
    await page.evaluate(() => window.websiteAccessibility.getColorMode()),
    'default',
  );
  assert.equal(
    await page.evaluate(() => window.websiteAccessibility.getColorStrength()),
    1,
  );
  await page.keyboard.press('Escape');
  for (const value of [-1, 2, NaN, Infinity, '0.5'])
    assert.equal(
      await page.evaluate((value) => {
        try {
          window.websiteAccessibility.setColorStrength(value);
          return false;
        } catch {
          return true;
        }
      }, value),
      true,
    );
  console.log(
    'PASS: distinct assistance presets, zero strength, chooser keyboard/mobile layout, persistence, Custom HTML API and invalid strength rejection.',
  );
  await page.evaluate(() =>
    window.websiteAccessibility.setColorMode('high-contrast'),
  );
  await page.reload();
  await page.waitForFunction(
    () => window.websiteAccessibility?.getColorMode() === 'high-contrast',
  );
  await widget
    .getByRole('button', { name: 'Widget colours', exact: true })
    .click();
  await page.waitForFunction(
    () => window.websiteAccessibility.getColorMode() === 'default',
  );
  assert.equal(
    await page.locator('#text').evaluate((el) => getComputedStyle(el).color),
    'rgb(180, 100, 200)',
  );
  // Messages from unrelated windows cannot change the website's appearance.
  await page.evaluate(() =>
    window.postMessage(
      { type: 'website-color-set', mode: 'high-contrast' },
      '*',
    ),
  );
  assert.equal(
    await page.evaluate(() => window.websiteAccessibility.getColorMode()),
    'default',
  );
  assert.equal(
    await page.evaluate(() => {
      try {
        window.websiteAccessibility.setColorMode('invalid');
        return false;
      } catch {
        return true;
      }
    }),
    true,
  );
  const luminance = (hex) => {
    const c = hex
      .match(/\w\w/g)
      .map((v) => parseInt(v, 16) / 255)
      .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  for (const color of ['172033', '0047ab', '9c3f00'])
    assert.ok(1.05 / (luminance(color) + 0.05) >= 4.5);
  console.log(
    'PASS: API/toggle, persistence, media filters and pixel restoration for images, SVG, playing video, opaque embedded player and rendered PDF; Custom HTML once-only propagation, preserved subtrees, rejected foreign messages and palette contrast.',
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
