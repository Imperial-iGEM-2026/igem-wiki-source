import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { defaultLoading, validLoading } from '../app/site-loading.js';
import { exportMedia } from './export-media.mjs';
import { createAppServer } from '../selfhost-dist/server/app.mjs';
import { generateKeyPair, SignJWT } from 'jose';
import {
  templateDefaults,
  validHeader,
} from '../selfhost-dist/server/shared.mjs';

assert.equal(defaultLoading.frequency, 'session');
assert.equal(defaultLoading.enabled, false);
assert.equal(defaultLoading.firstVisitExpiryMinutes, 30);
assert.ok(validLoading({...defaultLoading, showSkip:false, showSymbol:false}));
assert.ok(validLoading(defaultLoading));
assert.ok(validHeader({ loading: defaultLoading }));
for (const patch of [
  { duration: -1 },
  { showSkip: 'false' },
  { showSymbol: 0 },
  { firstVisitExpiryMinutes: 0 },
  { firstVisitExpiryMinutes: 10081 },
  { firstVisitExpiryMinutes: 1.5 },
  { timeout: 11000 },
  { timeout: 500 },
  { frequency: 'unknown' },
  { enabled: 'true' },
  { image: 'javascript:alert(1)' },
  { image: '//outside.test/image.svg' },
  { customCss: '@import "https://outside.test/x.css";' },
  { customCss: '.loader-mark { background: url(https://outside.test/img) }' },
  { customCss: '</style><script>alert(1)</script>' },
  { unknown: true },
]) {
  assert.equal(
    validLoading({ ...defaultLoading, ...patch }),
    false,
    JSON.stringify(patch),
  );
  assert.equal(
    validHeader({ loading: { ...defaultLoading, ...patch } }),
    false,
  );
}
assert.ok(
  validLoading({
    ...defaultLoading,
    animation: 'custom',
    customCss:
      '.loader-mark { animation: bounce 1s infinite; } @keyframes bounce { to { transform: translateY(-8px) } }',
  }),
);
const loading = {
  ...defaultLoading,
  enabled: true,
  duration: 1500,
  image: '/templates/notebook-purple/favicon.svg',
  message: 'Welcome to our project',
};
const values = {
  ...templateDefaults('blank'),
  'site:header': JSON.stringify({ loading }),
};
assert.equal(exportMedia(values, { pages: [] }).get(loading.image), 'image');
const dir = await mkdtemp(path.resolve('work/loading-export-'));
await writeFile(
  path.join(dir, 'snapshot.json'),
  JSON.stringify({ format: 'prion-wiki-source', version: 1, values }),
);
const result = spawnSync(
  process.execPath,
  [
    'scripts/export-static.mjs',
    '--snapshot',
    path.join(dir, 'snapshot.json'),
    '--base',
    '/test-team/',
    '--out',
    path.join(dir, 'export'),
  ],
  { encoding: 'utf8' },
);
assert.equal(result.status, 0, result.stdout + result.stderr);
const html = await readFile(path.join(dir, 'export/public/index.html'), 'utf8');
assert.match(
  html,
  /<script src="\/test-team\/assets\/site-loading.js"><\/script>/,
);
const boot = await readFile(
  path.join(dir, 'export/public/assets/site-loading.js'),
  'utf8',
);
assert.ok(!boot.includes('/api/media/'));
assert.ok(
  !boot.includes('"image":' + JSON.stringify(loading.image)),
  'Export replaces the animation image with its exported URL',
);
assert.ok(boot.includes('publication:/test-team/'));
assert.ok(boot.includes('"frequency":"session"'));
await writeFile('work/loading-export-latest.json', JSON.stringify({ dir }));
console.log(
  'PASS: loading settings validation, server header validation, asset collection and complete static export.',
);
console.log(dir);

// Exercise the actual versioned API against a fresh project, not just its schema.
const keys = await generateKeyPair('RS256');
const environment = {
  CF_ACCESS_TEAM_DOMAIN: 'https://example.cloudflareaccess.com',
  CF_ACCESS_AUD: 'loading-test',
  CF_ACCESS_ORIGIN: 'https://editor.example.com',
};
const jwt = await new SignJWT({ email: 'editor@example.com' })
  .setProtectedHeader({ alg: 'RS256' }).setSubject('editor')
  .setIssuer(environment.CF_ACCESS_TEAM_DOMAIN).setAudience(environment.CF_ACCESS_AUD)
  .setIssuedAt().setExpirationTime('10m').sign(keys.privateKey);
const server = await createAppServer({
  dataDir: await mkdtemp(path.resolve('work/loading-api-')),
  clientDir: path.resolve('selfhost-dist/client'), environment, keyOverride: keys.publicKey,
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const request = (route, body, project) => fetch(origin + route, {
  method: body ? 'POST' : 'GET',
  headers: { 'cf-access-jwt-assertion': jwt, origin: environment.CF_ACCESS_ORIGIN,
    'X-Prion-Layout-Protocol': '2', 'Content-Type': 'application/json',
    ...(project ? { 'X-Prion-Project': project } : {}) },
  body: body ? JSON.stringify(body) : undefined,
});
try {
  const created = await request('/api/projects', { action: 'create', name: 'Loading test', templateId: 'blank' });
  assert.equal(created.status, 201);
  const { id } = await created.json();
  const before = await (await request('/api/content', null, id)).json();
  const header = before.rows.find((row) => row.id === 'site:header');
  const savedValue = JSON.stringify({ ...JSON.parse(header.value), loading });
  const change = { id: 'site:header', value: savedValue, version: header.version };
  assert.equal((await request('/api/content', change, id)).status, 200);
  assert.equal((await request('/api/content', change, id)).status, 409, 'Stale animation saves must conflict');
  const after = await (await request('/api/content', null, id)).json();
  const saved = after.rows.find((row) => row.id === 'site:header');
  assert.deepEqual(JSON.parse(saved.value).loading, loading);
  assert.equal((await request('/api/content', { ...change, version: saved.version,
    value: JSON.stringify({ loading: { ...loading, timeout: 60000 } }) }, id)).status, 400);
  console.log('PASS: fresh-project API save/read, version conflicts and invalid animation rejection.');
} finally {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
