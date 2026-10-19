import assert from 'node:assert/strict';
import { mkdtemp, writeFile, copyFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  templateDefaults,
  newNode,
  emptyLayout,
} from '../selfhost-dist/server/shared.mjs';
import { exportMedia } from './export-media.mjs';
const dir = await mkdtemp(path.resolve('work/html-image-export-'));
const url = '/api/media/abcdef-1234.jpg';
const published = 'https://static.igem.wiki/teams/6377/images/html-image.jpg';
const values = {
  ...templateDefaults('blank'),
  'layout:home': JSON.stringify({
    ...emptyLayout,
    nodes: [
      {
        ...newNode('html-image', 'html'),
        html: `<figure><img src="${url}" alt="Sponsor logo"><figcaption>Image in HTML</figcaption></figure>`,
        css: `.background{background-image:url("${url}")}`,
        minHeight: 300,
      },
    ],
    order: ['html-image'],
  }),
};
const refs = exportMedia(values);
assert.equal(refs.get(url), 'image');
await copyFile(
  'public/templates/regelerate/sponsor-logos/neb.jpg',
  path.join(dir, 'abcdef-1234.jpg'),
);
await writeFile(
  path.join(dir, 'snapshot.json'),
  JSON.stringify({ format: 'prion-wiki-source', version: 1, values }),
);
await writeFile(
  path.join(dir, 'media-map.json'),
  JSON.stringify({ [url]: published }),
);
const result = spawnSync(
  process.execPath,
  [
    'scripts/export-static.mjs',
    '--snapshot',
    path.join(dir, 'snapshot.json'),
    '--media-map',
    path.join(dir, 'media-map.json'),
    '--media-dir',
    dir,
    '--base',
    '/test-team/',
    '--out',
    path.join(dir, 'export'),
  ],
  { encoding: 'utf8' },
);
assert.equal(result.status, 0, result.stdout + result.stderr);
const html = await readFile(path.join(dir, 'export/public/index.html'), 'utf8');
assert.ok(html.includes(published));
assert.ok(!html.includes(url));
assert.ok(html.includes('Sponsor logo'));
assert.equal((html.match(/data-layer-id="html-image"/g) || []).length, 1);
console.log(
  'PASS: uploaded image references in custom HTML/CSS are collected, copied and mapped to iGEM without adding an image section.',
);

assert.match(html, /data-custom-html-routes=/);
assert.ok(html.includes('&quot;/&quot;:&quot;/test-team/&quot;'));
const runtime = await readFile(path.join(dir, 'export/public/assets/wiki.js'), 'utf8');
assert.ok(runtime.includes('custom-html-link'));
assert.ok(runtime.includes('userActivation'));
console.log('PASS: static export includes the sandbox link handler and published route map.');
