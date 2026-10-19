/* oxlint-disable typescript/unbound-method -- Instrumented DOM methods are called with their original receiver. */
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { build } from 'vite';
import { chromium } from '../upload-helper/node_modules/playwright/index.mjs';
import { common } from './build-options.mjs';
const baseline = process.argv.includes('--baseline');
const dir = await mkdtemp(path.resolve('work/scroll-performance-'));
const sections = Array.from(
  { length: 200 },
  (_, i) =>
    `<section class="canvas-section" style="min-height:300px"><h2 class="bench-heading" id="s${i}">Section ${i + 1}</h2><p>Research, methods and results.</p></section>`,
).join('');
await writeFile(
  path.join(dir, 'entry.js'),
  `import {startPageIndex} from '/app/page-index.js';import '/app/page-index.css';window.stopIndex=startPageIndex(document.querySelector('[data-template-theme]'));`,
);
await writeFile(
  path.join(dir, 'index.html'),
  `<!doctype html><meta name="viewport" content="width=device-width"><style>body{margin:0;font:16px Arial}main{padding:24px}[data-page-index-grid]{display:grid;grid-template-columns:200px minmax(0,1fr);gap:32px}[data-page-index-grid][data-page-index-collapsed=true]{grid-template-columns:48px minmax(0,1fr)}section{border-top:1px solid #ddd}.wiki-header{position:sticky;top:0;background:white;height:60px;z-index:5}</style><div data-template-theme="luca"><header class="wiki-header">Research website</header><main><div data-page-index-grid><aside data-page-index-sidebar><div data-page-index-host></div></aside><article><div id="late-media"></div>${sections}<details><summary>Extra methods</summary><h2 id="extra-heading">Expanded methods</h2><p>Additional details</p></details></article></div></main></div><script type="module" src="./entry.js"></script>`,
);
await build({
  ...common,
  build: {
    outDir: path.join(dir, 'dist'),
    rolldownOptions: { input: path.join(dir, 'index.html') },
  },
});
const relative = path.relative(process.cwd(), dir).replaceAll('\\', '/');
const server = createServer(async (req, res) => {
  try {
    const name = req.url.split('?')[0];
    res.setHeader(
      'Content-Type',
      name.endsWith('.js')
        ? 'text/javascript'
        : name.endsWith('.css')
          ? 'text/css'
          : 'text/html',
    );
    res.end(await readFile(path.join(dir, 'dist', name)));
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 800 },
  });
  await page.goto(
    `http://127.0.0.1:${server.address().port}/${relative}/index.html`,
  );
  await page.locator('.wiki-page-index a').first().waitFor();
  const result = await page.evaluate(async () => {
    const frames = async (n = 2) => {
      while (n--) await new Promise(requestAnimationFrame);
    };
    await frames(8);
    let reads = 0,
      removes = 0;
    const rect = Element.prototype.getBoundingClientRect,
      remove = Element.prototype.removeAttribute;
    Element.prototype.getBoundingClientRect = function () {
      if (this.matches('.bench-heading')) reads++;
      return rect.call(this);
    };
    Element.prototype.removeAttribute = function (name) {
      if (name === 'data-proximity') removes++;
      return remove.call(this, name);
    };
    const start = performance.now();
    for (let i = 0; i < 100; i++) {
      window.scrollTo({ top: 120 + i * 200, behavior: 'instant' });
      await frames();
    }
    const result = {
      headings: 200,
      scrollSteps: 100,
      headingReads: reads,
      tooltipAttributeRemovals: removes,
      elapsedMs: performance.now() - start,
    };
    Element.prototype.getBoundingClientRect = rect;
    Element.prototype.removeAttribute = remove;
    return result;
  });
  console.log(JSON.stringify(result, null, 2));
  await writeFile(
    `work/scroll-performance-${baseline ? 'before' : 'after'}.json`,
    JSON.stringify(result, null, 2),
  );
  if (!baseline) {
    assert.ok(
      result.headingReads < 400,
      'Stable scroll should reuse heading geometry',
    );
    assert.equal(
      result.tooltipAttributeRemovals,
      0,
      'No tooltip mutations while it is closed',
    );
    const check = async () => {
      await page.waitForFunction(() => {
        const offset =
          window.scrollY +
          Math.max(
            24,
            document.querySelector('.wiki-header').getBoundingClientRect()
              .bottom + 16,
          ) +
          32;
        const headings = [...document.querySelectorAll('.bench-heading')];
        const expected =
          headings
            .filter((h) => h.getBoundingClientRect().top + scrollY <= offset)
            .at(-1) || headings[0];
        return (
          document
            .querySelector('.wiki-page-index a[aria-current]')
            ?.getAttribute('href') ===
          '#' + expected.id
        );
      });
    };
    await check();
    await page.evaluate(() => {
      document.querySelector('#late-media').style.height = '1800px';
    });
    await check();
    await page
      .getByRole('button', { name: 'Hide page index', exact: true })
      .click();
    await check();
    await page.setViewportSize({ width: 1100, height: 700 });
    await check();
    await page.evaluate(() => {
      document.querySelector('details').open = true;
    });
    await page.locator('.wiki-page-index a[href="#extra-heading"]').waitFor();
    await page.evaluate(() => {
      document.querySelector('details').open = false;
    });
    await page
      .locator('.wiki-page-index a[href="#extra-heading"]')
      .waitFor({ state: 'detached' });
    await page.evaluate(() => {
      window.scrollTo({
        top: document.documentElement.scrollHeight,
        behavior: 'instant',
      });
    });
    await page.waitForFunction(
      () =>
        document
          .querySelector('.wiki-page-index a[aria-current]')
          ?.getAttribute('href') === '#s199',
    );
    await page.evaluate(() => window.stopIndex());
    assert.equal(await page.locator('.wiki-page-index').count(), 0);
    console.log(
      'PASS: cached scrolling, late media, collapse/reflow, resize, accordion visibility, last section and cleanup.',
    );
  }
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
}
