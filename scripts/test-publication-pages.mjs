import assert from 'node:assert/strict';
import { publicationValues } from './publication-pages.mjs';
import { exportMedia } from './export-media.mjs';

const development = ['hp-backup-1', 'members-flip-test', 'results-rebuild-scratch'];
const live = ['results', 'testing-methods', 'contest'];
const values = {
  'site:template': 'blank',
  'pages:custom': JSON.stringify([...development, ...live].map(slug => ({ slug, title: slug }))),
  'pages:removed': '["old-page"]',
};
for (const slug of [...development, ...live]) {
  values[`layout:${slug}`] = JSON.stringify({ nodes: [{ id: slug, kind: 'image', src: `/api/media/${slug}.png` }] });
  values[`${slug}:title`] = slug;
  values[`copy:${slug}:template:results:text1`] = 'Copied text';
}
const before = JSON.stringify(values);
const result = publicationValues(values, [{ slug: 'template-backup' }]);
assert.equal(JSON.stringify(values), before, 'Saved Studio data must stay intact');
assert.deepEqual(result.excludedPages, [...development, 'template-backup'].sort());
assert.deepEqual(JSON.parse(result.values['pages:custom']).map(p => p.slug), live);
assert.ok(JSON.parse(result.values['pages:removed']).includes('old-page'));
for (const slug of development) {
  assert.ok(!Object.keys(result.values).some(k => k.includes(slug)), slug);
}
for (const slug of live) assert.equal(result.values[`layout:${slug}`], values[`layout:${slug}`]);
const refs = exportMedia(result.values);
for (const slug of development) assert.ok(!refs.has(`/api/media/${slug}.png`));
for (const slug of live) assert.ok(refs.has(`/api/media/${slug}.png`));
assert.deepEqual(publicationValues(result.values), result, 'Policy must remain stable on fresh source handoffs');
console.log('PASS: publication excludes development pages and their media without mutating Studio or scientific testing pages.');
