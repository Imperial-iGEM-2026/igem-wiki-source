import assert from 'node:assert/strict';
import fs from 'node:fs';
const origin = 'http://localhost:3000';
const routes = [
  ...fs
    .readFileSync('app/wiki-data.ts', 'utf8')
    .matchAll(/page\(\s*'([^']+)'/g),
].map((m) => m[1]);
assert.equal(routes.length, 29);
for (const slug of ['', ...routes]) {
  const r = await fetch(origin + '/' + slug);
  const html = await r.text();
  assert.equal(r.status, 200, slug);
  assert.ok(html.includes('page-canvas'), slug);
}
const login = await fetch(origin + '/auth/login', { redirect: 'manual' });
assert.equal(login.status, 302);
assert.ok(login.headers.get('location').includes('signin-with-chatgpt'));
const missing = await fetch(origin + '/missing-page');
assert.ok((await missing.text()).includes('Back to the science.'));
console.log(
  'All 30 page routes include the layout canvas; login handoff and missing-page fallback pass.',
);
