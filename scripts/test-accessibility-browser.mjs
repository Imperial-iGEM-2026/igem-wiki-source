import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { build } from 'vite';
import { chromium } from '../upload-helper/node_modules/playwright/index.mjs';
import { common } from './build-options.mjs';
const dir = await mkdtemp(path.resolve('work/accessibility-browser-'));
await writeFile(
  path.join(dir, 'index.html'),
  '<div id="root"></div><script type="module" src="./entry.tsx"></script>',
);
await writeFile(
  path.join(dir, 'entry.tsx'),
  `
import React from'react';import{createRoot}from'react-dom/client';import{CustomHtmlBlock}from'/app/custom-html-block';import{newNode}from'/app/canvas-schema';import{startWebsiteAccessibility}from'/app/site-accessibility';
const html='<button data-website-color-toggle>Widget colours</button><p style="color:rgb(180,100,200)">Widget text</p><svg width="20" height="20"><rect width="20" height="20" fill="#ee0099"/></svg>';
createRoot(document.getElementById('root')).render(<><button data-website-color-toggle>High contrast colours</button><p id="text" style={{color:'rgb(180,100,200)'}}>Readable text</p><a id="link" href="#target">Read more</a><div data-preserve-colors><p id="diagram" style={{color:'rgb(190,20,90)'}}>Diagram label</p></div><img id="photo" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20'%3E%3Crect width='20' height='20' fill='red'/%3E%3C/svg%3E"/><CustomHtmlBlock node={{...newNode('widget','html'),html}}/></>);
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
const server = createServer(async (req, res) => {
  try {
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
  await page.goto(
    `http://127.0.0.1:${server.address().port}/${path.relative(process.cwd(), dir).replaceAll('\\', '/')}/index.html`,
  );
  const widget = page.frameLocator('.custom-html-frame');
  await widget.getByText('Widget text', { exact: true }).waitFor();
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
    'none',
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
    'PASS: API/toggle, persistence, exact default restoration, Custom HTML propagation, preserved media/figures, rejected foreign messages and palette contrast.',
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
