import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { sharedPublicationAssets } from './share-publication-assets.mjs';
const root = await mkdtemp(path.resolve('work/shared-assets-'));
const shared = sharedPublicationAssets(root, '/team/');
const source = '<html><body>α &amp; "quoted" \'text\'<script>parent.test = 1</script></body></html>';
const escape = (s) => s.replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#x27;'}[c]));
const input = `<style>.x{color:red}</style><iframe sandbox="allow-scripts allow-same-origin" data-html-document="${escape(source)}"></iframe>`;
const a = shared.rewrite(input), b = shared.rewrite(input);
assert.equal(a, b);
assert.ok(a.includes('sandbox="allow-scripts allow-same-origin"'));
assert.ok(!a.includes('srcdoc=') && !a.includes('parent.test'));
for (const css of ['.x{background:url(../image.png)}','.x{filter:url(#filter)}','@import "local.css";']) {
  const inline = `<style>${css}</style>`;
  assert.equal(shared.rewrite(inline), inline);
}
assert.equal(shared.rewrite('<style id="dynamic">.x{color:red}</style>'), '<style id="dynamic">.x{color:red}</style>');
await shared.write();
const files = await readdir(path.join(root, 'public/assets/shared'));
assert.equal(files.length, 2);
assert.equal(JSON.parse(await readFile(path.join(root, 'public/assets/shared', files.find((f) => f.endsWith('.json'))), 'utf8')).join(''), source);
console.log('PASS: shared content deduplicates; frame text round-trips exactly; sandbox, relative CSS URLs and attributed styles are preserved.');
