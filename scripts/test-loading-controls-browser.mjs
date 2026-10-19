import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE
    ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href
    : 'playwright'
);
if (!process.env.EDITOR_FIXTURE_URL)
  throw Error(
    'Start scripts/test-editor-ux-browser.mjs and set EDITOR_FIXTURE_URL to its printed URL.',
  );
const browser = await chromium.launch({
  channel: process.env.BROWSER_CHANNEL || 'msedge',
  headless: true,
});
try {
  const page = await browser.newPage({
      viewport: { width: 1500, height: 950 },
    }),
    errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(process.env.EDITOR_FIXTURE_URL);
  await page.getByRole('button', { name: /^Pages/ }).click();
  await page.getByRole('button', { name: /Loading animation/ }).click();
  await page.getByRole('switch', { name: 'Enable loading animation' }).click();
  await page
    .getByLabel('Welcome message', { exact: true })
    .fill('Welcome to Imperial iGEM');
  await page
    .getByLabel('Logo or animated image URL')
    .fill('/templates/regelerate/blue.svg');
  await page.getByLabel('Minimum display time (ms)').fill('3000');
  await page.getByLabel('Animation style').selectOption('custom');
  await page
    .getByLabel('Custom animation CSS')
    .fill(
      '.loader-mark { width:180px; height:120px; animation: float 1s infinite alternate; } @keyframes float { to { transform: translateY(-12px); } }',
    );
  await page
    .getByRole('button', { name: 'Preview animation', exact: true })
    .click();
  await page.locator('[data-site-loading]').waitFor();
  assert.equal(
    await page.evaluate(
      () =>
        Object.keys(sessionStorage).filter((k) =>
          k.startsWith('studio:site-loading'),
        ).length,
    ),
    0,
  );
  await page.screenshot({ path: 'work/loading-animation-preview.png' });
  await page.getByRole('button', { name: 'Close preview' }).click();
  await page
    .getByRole('button', { name: 'Preview animation', exact: true })
    .click();
  await page.locator('[data-site-loading]').waitFor();
  await page.keyboard.press('Escape');
  await page
    .getByRole('button', { name: 'Save animation', exact: true })
    .click();
  const saved = await page.evaluate(
    () =>
      JSON.parse(
        JSON.parse(sessionStorage.getItem('editor-ux-test'))['site:header']
          .value,
      ).loading,
  );
  assert.equal(saved.enabled, true);
  assert.equal(saved.frequency, 'session');
  assert.equal(saved.message, 'Welcome to Imperial iGEM');
  await page.reload();
  await page.getByRole('button', { name: /^Pages/ }).click();
  await page.getByRole('button', { name: /Loading animation/ }).click();
  assert.equal(
    await page.getByLabel('Welcome message', { exact: true }).inputValue(),
    saved.message,
  );
  assert.equal(
    await page.getByLabel('Custom animation CSS').inputValue(),
    saved.customCss,
  );
  assert.equal(
    await page.locator('[data-site-loading]').count(),
    0,
    'Editor never automatically overlays animation',
  );
  await page.getByLabel('Welcome message', { exact: true }).fill('Discard me');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  assert.equal(
    await page.getByLabel('Welcome message', { exact: true }).inputValue(),
    saved.message,
  );
  await page.screenshot({ path: 'work/loading-animation-editor.png' });
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  const preview = page.frameLocator('iframe[title="Complete website preview"]');
  await preview.locator('[data-site-loading]').waitFor();
  await preview.getByRole('button', { name: 'Skip animation' }).click();
  assert.equal(errors.length, 0, errors.join('\n'));
  console.log(
    'PASS: Editor enable/customize, isolated custom CSS replay, save, reload, cancel, no editor interruption, and full-page Preview.',
  );
} finally {
  await browser.close();
}
