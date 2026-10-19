import assert from 'node:assert/strict';
import { exportMedia } from './export-media.mjs';
const source = '/templates/notebook-purple//logo.png';
const locations = new Map();
const values = {
  'site:header': JSON.stringify({ logo: source }),
  'pages:custom': JSON.stringify([{ slug: 'lab-notes', title: 'Lab notes' }]),
  'pages:removed': '["removed"]',
  'layout:home': JSON.stringify({
    nodes: [
      { id: 'photo', name: 'Experiment photo', kind: 'image', src: source },
    ],
  }),
  'layout:lab-notes': JSON.stringify({
    nodes: [
      { id: 'repeat', name: 'Same photo', kind: 'image', src: source },
      { id: 'hidden', hidden: true },
      { id: 'child', parentId: 'hidden', src: '/api/media/hidden.png' },
    ],
  }),
  'layout:removed': JSON.stringify({
    nodes: [{ id: 'gone', src: '/api/media/removed.png' }],
  }),
};
const template = {
  pages: [
    {
      slug: 'home',
      title: 'Home page',
      layers: [
        {
          id: 'template-photo',
          name: 'Template photograph',
          ast: { t: 'img', a: { src: source } },
        },
      ],
    },
  ],
};
const refs = exportMedia(values, template, undefined, locations);
assert.equal(refs.has(source), true);
assert.equal(refs.has('/api/media/hidden.png'), false);
assert.equal(refs.has('/api/media/removed.png'), false);
assert.equal(
  locations.get(source).length,
  5,
  'One URL retains all template, page, icon and header references',
);
assert.ok(
  locations
    .get(source)
    .some((x) => x.pageTitle === 'Lab notes' && x.layerId === 'repeat'),
);
assert.ok(
  locations
    .get(source)
    .some(
      (x) =>
        x.pageTitle === 'Home page' && x.layerName === 'Template photograph',
    ),
);
assert.ok(locations.get(source).some((x) => x.layerName === 'Header logo'));
assert.deepEqual(
  [...refs],
  [...exportMedia(values, template)],
  'Diagnostics do not change the export inventory',
);
console.log(
  'PASS: media provenance, repeated references, custom page titles, template/header references and hidden/removed filtering.',
);
