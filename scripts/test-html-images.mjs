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
const pdfURL = '/api/media/abcdef-1234.pdf';
const url = '/api/media/abcdef-1234.jpg';
const published = 'https://static.igem.wiki/teams/6377/images/html-image.jpg';
const dynamicKey = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.jpg';
const dynamicURL = '/api/media/' + dynamicKey;
const values = {
  ...templateDefaults('blank'),
  'layout:home': JSON.stringify({
    ...emptyLayout,
    nodes: [
      {
        ...newNode('html-image', 'html'),
        html: `<figure><img src="${url}" alt="Sponsor logo"><figcaption>Image in HTML</figcaption></figure><a href="${pdfURL}">Read full handbook</a>`,
        css: `.background{background-image:url("${url}")}`,
        javascript: `const files=['${dynamicKey}'];const img=new Image();img.src='/api/media/'+files[0];document.body.append(img);`,
        minHeight: 300,
      },
    ],
    order: ['html-image'],
  }),
};
const refs = exportMedia(values);
assert.equal(refs.get(url), 'image');
assert.equal(refs.get(pdfURL), 'pdf');
await writeFile(path.join(dir, 'pdf-parts.json'), JSON.stringify({ [pdfURL]: [{start:1,end:2,source:'/api/media/part-1.pdf'},{start:3,end:4,source:'/api/media/part-2.pdf'}] }));
assert.equal(refs.get(dynamicURL), 'image');
await copyFile(
  'public/templates/regelerate/sponsor-logos/neb.jpg',
  path.join(dir, 'abcdef-1234.jpg'),
);
await copyFile(path.join(dir, 'abcdef-1234.jpg'), path.join(dir, dynamicKey));
await writeFile(
  path.join(dir, 'snapshot.json'),
  JSON.stringify({ format: 'prion-wiki-source', version: 1, values }),
);
await writeFile(
  path.join(dir, 'media-map.json'),
  JSON.stringify({ [url]: published, [dynamicURL]: published, '/api/media/part-1.pdf':'https://static.igem.wiki/teams/6377/part-1.pdf', '/api/media/part-2.pdf':'https://static.igem.wiki/teams/6377/part-2.pdf' }),
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
const componentURL = /data-html-source="([^"]+)"/.exec(html)[1];
const loadPart = async (url) =>
  JSON.parse(
    await readFile(
      path.join(dir, 'export/public', url.replace('/test-team/', '')),
      'utf8',
    ),
  );
const component = (
  await Promise.all(
    (
      await loadPart(componentURL)
    ).map((part) => (typeof part === 'string' ? part : loadPart(part.url))),
  )
).join('');
assert.ok(component.includes(published));
assert.ok(!html.includes(url));
assert.ok(component.includes('Sponsor logo'));
const dynamicMap = JSON.parse(
  Buffer.from(
    /data-custom-html-media="([^"]+)"/.exec(html)[1],
    'base64',
  ).toString(),
);
assert.equal(dynamicMap[dynamicURL], published);
assert.equal((html.match(/data-layer-id="html-image"/g) || []).length, 1);
console.log(
  'PASS: uploaded image references in custom HTML/CSS are collected, copied and mapped to iGEM without adding an image section.',
);

assert.match(html, /data-custom-html-routes=/);
assert.ok(html.includes('&quot;/&quot;:&quot;/test-team/&quot;'));
const runtime = await readFile(
  path.join(dir, 'export/public/assets/wiki.js'),
  'utf8',
);
assert.ok(runtime.includes('custom-html-link'));
assert.ok(runtime.includes('userActivation'));
console.log(
  'PASS: static export includes the sandbox link handler and published route map.',
);

assert.ok(component.includes('Read full handbook'));
assert.ok(!component.includes(pdfURL));
const destination = /href="([^" ]*documents\/pdf-[a-f0-9]+\/)"/.exec(component)?.[1];
assert.ok(destination, 'Split PDF link must survive with a complete reader destination');
const reader = await readFile(path.join(dir, 'export/public', destination.replace('/test-team/', ''), 'index.html'), 'utf8');
assert.ok(reader.includes('part-1.pdf') && reader.includes('part-2.pdf'));
assert.ok(html.includes('data-custom-html-pdfs='));
console.log('PASS: custom HTML PDF links survive export and open every partition, not just the first file.');

assert.ok(runtime.includes('websiteAccessibility'));
assert.ok(runtime.includes('website-color-mode'));
console.log('PASS: exported runtime includes the visitor colour accessibility API.');
