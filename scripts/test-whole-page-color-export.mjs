import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { chromium } from '../upload-helper/node_modules/playwright/index.mjs';
import { PNG } from 'pngjs';
import {
  templateDefaults,
  newNode,
  emptyLayout,
} from '../selfhost-dist/server/shared.mjs';
const dir = await mkdtemp(path.resolve('work/color-export-'));
const svg =
  '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="#b464c8"/></svg>';
const image = 'https://static.igem.wiki/teams/fixture/colour.svg';
const nodes = [
  { ...newNode('picture', 'image'), src: image, alt: 'Export photo', span: 4 },
  {
    ...newNode('widget', 'html'),
    minHeight: 200,
    html: `<button id="logo" aria-label="Logo"></button><div id="bar"></div>`,
    css: `#logo,#bar{width:40px;height:40px;background:#b464c8}#logo{background-image:url("${image}")}`,
  },
];
const values = {
  ...templateDefaults('blank'),
  'layout:home': JSON.stringify({
    ...emptyLayout,
    nodes,
    order: nodes.map((n) => n.id),
    sidebar: false,
  }),
};
await writeFile(
  path.join(dir, 'snapshot.json'),
  JSON.stringify({ format: 'prion-wiki-source', version: 1, values }),
);
const result = spawnSync(
  process.execPath,
  [
    'scripts/export-static.mjs',
    '--snapshot',
    path.join(dir, 'snapshot.json'),
    '--base',
    '/',
    '--out',
    path.join(dir, 'export'),
  ],
  { encoding: 'utf8' },
);
assert.equal(result.status, 0, result.stdout + result.stderr);
const publicDir = path.join(dir, 'export/public');
const server = createServer(async (req, res) => {
  try {
    let name = new URL(req.url, 'http://test').pathname;
    if (name.endsWith('/')) name += 'index.html';
    const file = path.join(publicDir, name);
    res.setHeader(
      'Content-Type',
      /\.m?js$/.test(file)
        ? 'text/javascript'
        : file.endsWith('.css')
          ? 'text/css'
          : file.endsWith('.svg')
            ? 'image/svg+xml'
            : 'text/html',
    );
    res.end(await readFile(file));
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });
  await page.route(image, (route) =>
    route.fulfill({ contentType: 'image/svg+xml', body: svg }),
  );
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  const widget = page.frameLocator('[data-layer-id="widget"] iframe');
  await widget.locator('#logo').waitFor();
  assert.equal(await page.locator('.website-color-launcher').isVisible(), false, 'Export hides default Colours launcher');
  assert.equal(await page.locator('.website-search-open').isVisible(), false, 'Export hides default Search launcher');
  await page.evaluate(() => {
    const e = document.createElement('div');
    e.id = 'fixed-probe';
    e.style.cssText =
      'position:fixed;top:13px;left:9px;width:30px;height:30px;background:#b464c8;z-index:99999';
    document.body.append(e);
    document.body.style.minHeight = '2500px';
    const d = document.createElement('dialog');
    d.id = 'dialog-probe';
    d.style.cssText =
      'background:#b464c8;width:60px;height:60px;border:0;padding:0';
    document.body.append(d);
  });
  await page.addStyleTag({
    content: '#dialog-probe::backdrop{background:transparent}',
  });
  const samples = [
    page.getByAltText('Export photo'),
    widget.locator('#logo'),
    widget.locator('#bar'),
    page.locator('#fixed-probe'),
  ];
  const pixel = async (e) => {
    const p = PNG.sync.read(await e.screenshot());
    const i =
      (Math.floor(p.height / 2) * p.width + Math.floor(p.width / 2)) * 4;
    return [...p.data.subarray(i, i + 3)];
  };
  const original = [];
  for (const s of samples) original.push(await pixel(s));
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
    for (let i = 0; i < samples.length; i++) {
      const rgb = await pixel(samples[i]);
      assert.notDeepEqual(rgb, original[i]);
      if (mode === 'grayscale')
        assert.ok(Math.max(...rgb) - Math.min(...rgb) <= 1);
    }
    assert.equal(
      await widget.locator('html').evaluate((e) => getComputedStyle(e).filter),
      'none',
    );
    await page.locator('#dialog-probe').evaluate((e) => e.showModal());
    assert.deepEqual(
      await pixel(page.locator('#dialog-probe')),
      await pixel(page.locator('#fixed-probe')),
      'Top-layer receives the same single filter as website',
    );
    await page.locator('#dialog-probe').evaluate((e) => e.close());
    await page.evaluate(() => window.websiteAccessibility.setColorStrength(0));
    for (let i = 0; i < samples.length; i++)
      assert.deepEqual(await pixel(samples[i]), original[i]);
    await page.evaluate(() => window.websiteAccessibility.setColorStrength(1));
  }
  await page.evaluate(() => scrollTo(0, 800));
  assert.equal((await page.locator('#fixed-probe').boundingBox()).y, 13);
  await page.locator('#dialog-probe').evaluate((e) => e.showModal());
  const dialogRgb = await pixel(page.locator('#dialog-probe'));
  assert.ok(
    Math.max(...dialogRgb) - Math.min(...dialogRgb) <= 1,
    'Top-layer website dialog also grayscale',
  );
  await page.locator('#dialog-probe').evaluate((e) => e.close());
  await page.evaluate(() =>
    window.websiteAccessibility.setColorMode('high-contrast'),
  );
  assert.equal(
    await page.locator('html').evaluate((e) => getComputedStyle(e).filter),
    'none',
  );
  await page.evaluate(() =>
    window.websiteAccessibility.setColorMode('default'),
  );
  for (let i = 0; i < samples.length; i++)
    assert.deepEqual(await pixel(samples[i]), original[i]);
  console.log(
    'PASS: actual exported runtime, native image, opaque HTML logo/background/unmarked chart, all presets, zero strength, fixed header while scrolling, top-layer dialog and restoration.',
  );
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}
