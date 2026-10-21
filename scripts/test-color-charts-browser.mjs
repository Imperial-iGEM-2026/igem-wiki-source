import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { build } from 'vite';
import { chromium } from '../upload-helper/node_modules/playwright/index.mjs';
import { PNG } from 'pngjs';

const dir = await mkdtemp(path.resolve('work/color-charts-'));
const image =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="#b464c8"/></svg>',
  );
const widget = {
  html: `<div id="card"><span>Authored card</span></div><div role="img" aria-label="Experiment results" id="chart"><div id="bar" style="height:40px;width:80px;background:#b464c8"></div><span id="legend">Treatment A: 80</span><svg width="40" height="40"><rect width="40" height="40" fill="#b464c8"/></svg></div><img id="photo" src="${image}"/><div class="photo-bg" id="background"></div><div data-preserve-colors><img id="preserved" src="${image}"/></div><div id="late"></div><div data-website-chart="palette" id="palette-chart"><svg width="40" height="40"><rect id="palette-bar" width="40" height="40" style="fill:var(--website-chart-series-1,#b464c8)"/></svg></div>`,
  css: `body{background:#241242;color:#fff;font:16px sans-serif}#card{background:#4c2a85;color:#fff}#chart{background:#241242;color:#fff;width:180px}#photo{width:40px;height:40px;filter:none!important}.photo-bg{width:40px;height:40px;background-image:url("${image}")}`,
  javascript: `window.chartEvents=[];addEventListener('website:colormodechange',event=>chartEvents.push(event.detail));`,
};
const entry = path.join(dir, 'entry.ts');
await writeFile(
  entry,
  `
import {startWebsiteAccessibility} from '../../app/site-accessibility';
import {htmlDocument,htmlFrameURL} from '../../app/html-document';
const frame=document.createElement('iframe');frame.className='custom-html-frame';frame.title='Widget';frame.setAttribute('sandbox','allow-scripts allow-same-origin');frame.style.cssText='width:600px;height:650px;border:0';frame.addEventListener('load',()=>frame.contentWindow.postMessage({type:'custom-html-visibility',visible:true},'*'));frame.src=htmlFrameURL(htmlDocument(${JSON.stringify(widget)}),location.href);document.body.appendChild(frame);
const state=document.createElement('button');state.setAttribute('aria-pressed','true');state.innerHTML='<span>Selected control</span>';document.body.appendChild(state);
window.stopColours=startWebsiteAccessibility('chart-fixture');
`,
);
await build({
  configFile: false,
  build: {
    outDir: path.join(dir, 'dist'),
    lib: {
      entry,
      name: 'ChartFixture',
      formats: ['iife'],
      fileName: () => 'fixture.js',
    },
  },
});
const code = await readFile(path.join(dir, 'dist/fixture.js'), 'utf8');
const server = createServer((_req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.end(
    `<meta charset="utf-8"><body><script>${code.replaceAll('</script', '<\\/script')}</script>`,
  );
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1100, height: 900 },
  });
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  const frame = page.frameLocator('iframe');
  await frame.locator('#photo').waitFor();
  const pixel = async (locator) => {
    const png = PNG.sync.read(await locator.screenshot());
    const at =
      (Math.floor(png.height / 2) * png.width + Math.floor(png.width / 2)) * 4;
    return [...png.data.subarray(at, at + 3)];
  };
  const samples = ['#photo', '#background', '#bar', '#chart svg'].map((s) =>
    frame.locator(s),
  );
  const originals = [];
  for (const sample of samples) originals.push(await pixel(sample));
  const preserved = await pixel(frame.locator('#preserved'));
  for (const mode of [
    'high-contrast',
    'protanopia',
    'deuteranopia',
    'tritanopia',
    'grayscale',
  ]) {
    await page.evaluate(
      (mode) => window.websiteAccessibility.setColorMode(mode),
      mode,
    );
    await frame.locator(`html[data-website-color-mode="${mode}"]`).waitFor();
    await frame.locator('#background[data-website-auto-media]').waitFor();
    assert.equal(
      await frame
        .locator('#bar')
        .evaluate((e) => getComputedStyle(e).backgroundColor),
      'rgb(180, 100, 200)',
      'HTML bars keep their colours',
    );
    assert.equal(
      await frame.locator('#legend').evaluate((e) => getComputedStyle(e).color),
      'rgb(255, 255, 255)',
      'Chart text keeps its authored contrast',
    );
    assert.equal(
      await frame
        .locator('#chart svg')
        .evaluate((e) => getComputedStyle(e).filter),
      'none',
      'Chart contents are not filtered twice',
    );
    if (mode !== 'high-contrast') {
      assert.equal(
        await frame
          .locator('body')
          .evaluate((e) => getComputedStyle(e).backgroundColor),
        'rgb(36, 18, 66)',
      );
      assert.equal(
        await frame
          .locator('#card')
          .evaluate((e) => getComputedStyle(e).backgroundColor),
        'rgb(76, 42, 133)',
      );
    }
    for (let i = 0; i < samples.length; i++)
      assert.notDeepEqual(
        await pixel(samples[i]),
        originals[i],
        `${mode} visibly affects widget media/chart ${i}`,
      );
    assert.deepEqual(await pixel(frame.locator('#preserved')), preserved);
    assert.equal(
      await frame
        .locator('#palette-chart')
        .evaluate((e) => getComputedStyle(e).filter),
      'none',
    );
    assert.equal(
      await frame
        .locator('#palette-bar')
        .evaluate((e) => getComputedStyle(e).fill),
      'rgb(0, 103, 165)',
    );
    await page.evaluate(() => window.websiteAccessibility.setColorStrength(0));
    for (let i = 0; i < samples.length; i++)
      assert.deepEqual(
        await pixel(samples[i]),
        originals[i],
        `Zero strength restores ${i}`,
      );
    await page.evaluate(() => window.websiteAccessibility.setColorStrength(1));
  }
  await frame.locator('#late').evaluate((e) => {
    const child = document.createElement('div');
    child.className = 'photo-bg';
    child.id = 'late-photo';
    e.appendChild(child);
  });
  await frame.locator('#late-photo[data-website-auto-media]').waitFor();
  assert.notDeepEqual(await pixel(frame.locator('#late-photo')), originals[1]);
  await page.evaluate(() =>
    window.websiteAccessibility.setColorMode('high-contrast'),
  );
  assert.equal(
    await page
      .getByRole('button', { name: 'Selected control' })
      .locator('span')
      .evaluate((e) => getComputedStyle(e).color),
    'rgb(255, 255, 255)',
  );
  assert.equal(
    await page
      .getByRole('button', { name: 'Selected control' })
      .locator('span')
      .evaluate((e) => getComputedStyle(e).backgroundColor),
    'rgba(0, 0, 0, 0)',
  );
  const palette = await frame
    .locator('body')
    .evaluate(() => window.websiteAccessibility.getChartPalette());
  assert.equal(palette.length, 6);
  for (const item of palette) {
    const rgb = item.color
      .slice(1)
      .match(/../g)
      .map((v) => parseInt(v, 16) / 255);
    const linear = rgb.map((v) =>
      v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4,
    );
    const luminance =
      linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
    assert.ok(
      1.05 / (luminance + 0.05) >= 3,
      'Chart colours contrast with white plot backgrounds',
    );
  }
  assert.equal(new Set(palette.map((item) => item.dash)).size, 6);
  assert.equal(
    await frame
      .locator('body')
      .evaluate(() => window.chartEvents.at(-1).chartPalette.length),
    6,
  );
  await page.evaluate(() =>
    window.websiteAccessibility.setColorMode('default'),
  );
  await frame.locator('html[data-website-color-mode="default"]').waitFor();
  assert.equal(await frame.locator('[data-website-auto-media]').count(), 0);
  for (let i = 0; i < samples.length; i++)
    assert.deepEqual(await pixel(samples[i]), originals[i]);
  assert.equal(
    await frame.locator('#photo').evaluate((e) => getComputedStyle(e).filter),
    'none',
    'Author CSS is restored',
  );
  await page.screenshot({ path: path.join(dir, 'restored.png') });
  console.log(
    'PASS: authored HTML charts and dark backgrounds, images overriding widget CSS, CSS/lazy background images, single filtering, palette redraw API, selected controls, opt-outs, zero strength and exact restoration.',
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
