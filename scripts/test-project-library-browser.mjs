import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'vite';
import { createServer } from 'node:http';
import { chromium } from '../upload-helper/node_modules/playwright/index.mjs';
import { common } from './build-options.mjs';
const folder = await mkdtemp(path.resolve('work/project-library-browser-'));
const relative = path.relative(process.cwd(), folder).replaceAll('\\', '/');
await writeFile(
  path.join(folder, 'index.html'),
  '<!doctype html><div id="root"></div><script type="module" src="./entry.tsx"></script>',
);
await writeFile(
  path.join(folder, 'entry.tsx'),
  `
import React from 'react';
import {createRoot} from 'react-dom/client';
import {TemplateLibrary} from '/app/template-library';
import '/app/globals.css';import '/app/studio.css';
const initial={projects:[{id:'research',name:'Our research',templateId:'regelerate',appearanceId:'notebook-white'},{id:'other',name:'Other project',templateId:'swiss'}],defaultId:'research',templates:[{id:'regelerate',name:'Original notebook',pageCount:20},{id:'notebook-white',name:'White notebook',pageCount:20},{id:'swiss',name:'Swiss',pageCount:20}]};
createRoot(document.getElementById('root')).render(<TemplateLibrary initial={initial} name="Editor"/>);`,
);
const dist = path.join(folder, 'dist');
await build({
  ...common,
  build: {
    outDir: dist,
    rollupOptions: { input: path.join(folder, 'index.html') },
  },
});
const server = createServer(async (req, res) => {
  try {
    const file = path.join(dist, req.url.split('?')[0]);
    res.setHeader(
      'Content-Type',
      file.endsWith('.js')
        ? 'text/javascript'
        : file.endsWith('.css')
          ? 'text/css'
          : 'text/html',
    );
    res.end(await readFile(file));
  } catch {
    res.statusCode = 404;
    res.end();
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({
  headless: true,
  executablePath:
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
});
try {
  const page = await browser.newPage({
    viewport: { width: 1100, height: 1000 },
  });
  await page.goto(
    `http://127.0.0.1:${server.address().port}/${relative}/index.html`,
    { waitUntil: 'domcontentloaded' },
  );
  // Changed projects must only appear under their currently applied template.
  await page.getByRole('button', { name: /Original notebook/ }).click();
  assert.equal(
    await page
      .getByRole('dialog')
      .getByRole('link', { name: /Our research/ })
      .count(),
    0,
  );
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: /White notebook/ }).click();
  await page
    .getByRole('dialog')
    .getByRole('link', { name: /Our research/ })
    .waitFor();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page
    .getByRole('button', { name: 'More actions for Our research' })
    .click();
  await page.getByRole('menuitem', { name: 'Rename project' }).click();
  const input = page.getByRole('textbox', { name: 'Project name' });
  assert.equal(await input.inputValue(), 'Our research');
  await input.fill('Other project');
  assert.equal(
    await page.getByRole('button', { name: 'Save name' }).isDisabled(),
    true,
  );
  await page.getByRole('alert').filter({ hasText: 'already exists' }).waitFor();
  await input.fill('');
  assert.equal(
    await page.getByRole('button', { name: 'Save name' }).isDisabled(),
    true,
  );
  await input.fill('Research 2026');
  let requests = 0;
  await page.route('**/api/projects', async (route) => {
    const body = route.request().postDataJSON();
    assert.equal(body.action, 'rename');
    assert.equal(body.id, 'research');
    assert.equal(body.name, 'Research 2026');
    requests++;
    if (requests === 1)
      return route.fulfill({
        status: 500,
        json: { error: 'Temporary save failure' },
      });
    await route.fulfill({
      json: {
        projects: [
          {
            id: 'research',
            name: body.name,
            templateId: 'regelerate',
            appearanceId: 'notebook-white',
          },
        ],
        defaultId: 'research',
        templates: [
          { id: 'regelerate', name: 'Original notebook', pageCount: 20 },
          { id: 'notebook-white', name: 'White notebook', pageCount: 20 },
        ],
      },
    });
  });
  await input.press('Enter');
  await page
    .getByRole('alert')
    .filter({ hasText: 'Temporary save failure' })
    .waitFor();
  assert.equal(await input.inputValue(), 'Research 2026');
  await page.getByRole('button', { name: 'Save name' }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await page
    .getByRole('button', { name: 'More actions for Research 2026' })
    .waitFor();
  assert.equal(requests, 2);
  await page
    .getByRole('button', { name: 'More actions for Research 2026' })
    .click();
  await page.getByRole('menuitem', { name: 'Rename project' }).click();
  await input.fill('Discarded');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  assert.equal(requests, 2);
  await page
    .getByRole('button', { name: 'More actions for Research 2026' })
    .waitFor();
  await page.screenshot({ path: path.join(folder, 'project-library.png') });
  console.log(
    'PASS: current-template matching, rename menu/dialog, duplicate/blank validation, retry, Enter, cancel and immediate list update.',
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
