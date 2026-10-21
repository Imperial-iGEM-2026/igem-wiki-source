import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { build } from 'vite';
import { chromium } from '../upload-helper/node_modules/playwright/index.mjs';

const dir = await mkdtemp(path.resolve('work/color-close-'));
const entry = path.join(dir, 'entry.ts');
await writeFile(
  entry,
  `
import { mountColorSettings } from '../../app/site-color-settings';
const controls = mountColorSettings(() => {}, document.documentElement, true);
document.querySelector('[data-website-color-settings]').addEventListener('click', () => controls.open());
`,
);
await build({
  configFile: false,
  build: {
    outDir: path.join(dir, 'dist'),
    lib: {
      entry,
      name: 'ColourFixture',
      formats: ['iife'],
      fileName: () => 'fixture.js',
    },
  },
});
const code = await readFile(path.join(dir, 'dist/fixture.js'), 'utf8');
const html = `<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; form-action 'none'"><button id="outside">Page control</button><script>${code.replaceAll('</script', '<\\/script')}</script>`;
const server = createServer((_req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.end(
    `<iframe title="Studio sandbox" sandbox="allow-scripts" style="border:0;width:100%;height:800px" src="data:text/html;base64,${Buffer.from(html).toString('base64')}"></iframe>`,
  );
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 900 },
  });
  const violations = [];
  page.on('console', (message) => {
    if (/form.*(blocked|violat)|blocked.*form/i.test(message.text()))
      violations.push(message.text());
  });
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  const frame = page.frameLocator('iframe');
  const launcher = frame.getByRole('button', {
    name: '◐ Colours',
    exact: true,
  });
  const dialog = frame.getByRole('dialog', { name: 'Colour preferences' });
  await launcher.click();
  await dialog.waitFor();
  await frame.getByRole('button', { name: 'Close colour preferences' }).click();
  assert.equal(
    await dialog.isVisible(),
    false,
    'Close button works without sandbox form permission',
  );
  assert.equal(
    await launcher.evaluate((el) => document.activeElement === el),
    true,
    'Focus returns to the opener',
  );
  await launcher.click();
  await frame
    .getByRole('combobox', { name: 'Colour assistance' })
    .selectOption('tritanopia');
  await page.keyboard.press('Escape');
  assert.equal(await dialog.isVisible(), false, 'Escape closes the panel');
  await launcher.click();
  assert.equal(
    await frame
      .getByRole('combobox', { name: 'Colour assistance' })
      .inputValue(),
    'tritanopia',
    'Closing preserves the selected preference',
  );
  await dialog.locator('strong').click();
  assert.equal(
    await dialog.isVisible(),
    true,
    'Clicking inside keeps the panel open',
  );
  const box = await page.locator('iframe').boundingBox();
  await page.mouse.click(box.x + 5, box.y + 5);
  assert.equal(
    await dialog.isVisible(),
    false,
    'Backdrop click closes the panel',
  );
  await page.setViewportSize({ width: 390, height: 900 });
  await launcher.click();
  const close = frame.getByRole('button', { name: 'Close colour preferences' });
  await close.focus();
  await page.keyboard.press('Enter');
  assert.equal(
    await dialog.isVisible(),
    false,
    'Keyboard close works on mobile width',
  );
  assert.deepEqual(violations, [], 'Closing never submits a form');
  console.log(
    'PASS: opaque Studio sandbox, close button, Escape, backdrop, inside clicks, focus restoration, preserved preferences and mobile keyboard close.',
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
