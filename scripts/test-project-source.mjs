import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createProjectSource } from '../server/project-source.mjs';
const dir = mkdtempSync(path.resolve('work/source-test-'));
const sourceFile = path.join(dir, 'source.json');
const base = { 'app/page-index.css': 'nav { color: blue; }', 'app/luca-template.json': '{"id":"luca"}', 'scripts/build-igem.mjs': 'build()', 'package.json': '{}' };
writeFileSync(sourceFile, JSON.stringify(base));
const db = new DatabaseSync(path.join(dir, 'test.sqlite'));
try {
  const store = createProjectSource({ db, sourceFile });
  const owner = { id: 'ada', name: 'Ada dev', approvedBy: 'Ada', expiresAt: Date.now() + 86400000 };
  const tokens = new Map();
  const locked = args => {
    if (!tokens.has(args.path)) tokens.set(args.path, store.acquire('one', owner, { path: args.path }).lockToken);
    return { ...args, lockToken: tokens.get(args.path) };
  };
  const first = store.read('one', { path: 'app/page-index.css' });
  const args = { path: first.path, ifVersion: first.version, ifBaseHash: first.baseHash, content: 'nav { color: red; }' };
  store.write('one', 'Ada', locked(args), owner);
  assert.equal(store.read('two', { path: first.path }).content, base[first.path]);
  assert.equal(store.overlay('one', base)[first.path], args.content);
  assert.deepEqual(store.overlay('two', base), base);
  assert.throws(() => store.write('one', 'Ada', locked(args), owner), /conflict/);
  for (const name of ['../secret', '/etc/passwd', 'C:/secret', 'app/../secret', 'app\\page-index.css', 'app/%2e%2e/secret', 'server/app.mjs', '.env'])
    assert.throws(() => store.read('one', { path: name }), /path|available/);
  const pkg = store.read('one', { path: 'package.json' });
  assert.throws(() => store.write('one', 'Ada', { ...args, path: pkg.path, ifVersion: pkg.version, ifBaseHash: pkg.baseHash }), /Only wiki/);
  let current = store.read('one', { path: first.path });
  store.replace('one', 'Ada', locked({ path: first.path, ifVersion: current.version, ifBaseHash: current.baseHash, oldText: 'red', newText: 'black' }), owner);
  assert.equal(store.history('one', first.path)[0].version, 1);
  current = store.read('one', { path: first.path });
  store.restore('one', 'Ada', locked({ path: first.path, ifVersion: current.version, ifBaseHash: current.baseHash, targetVersion: 1 }), owner);
  assert.equal(store.read('one', { path: first.path }).content, args.content);
  current = store.read('one', { path: first.path });
  store.restore('one', 'Ada', locked({ path: first.path, ifVersion: current.version, ifBaseHash: current.baseHash, targetVersion: 0 }), owner);
  assert.deepEqual(store.overlay('one', base), base);
  const added = store.read('one', { path: 'app/project-components/Example.tsx' });
  assert.equal(added.exists, false);
  store.write('one', 'Ada', locked({ path: added.path, ifVersion: added.version, ifBaseHash: added.baseHash, content: 'export default () => null;' }), owner);
  assert.ok(store.overlay('one', base)[added.path]);
  const json = store.read('one', { path: 'app/luca-template.json' });
  assert.throws(() => store.write('one', 'Ada', locked({ path: json.path, ifVersion: json.version, ifBaseHash: json.baseHash, content: '{' }), owner), /Invalid JSON/);
  // Updating the server must not silently combine stale overrides with new code.
  current = store.read('one', { path: first.path });
  store.write('one', 'Ada', locked({ ...args, ifVersion: current.version }), owner);
  assert.throws(() => store.overlay('one', { ...base, [first.path]: 'new release' }), /conflicts/);
  const large = 'x'.repeat(100000);
  const big = store.read('one', { path: 'app/project-components/large.json' });
  store.write('one', 'Ada', locked({ path: big.path, ifVersion: big.version, ifBaseHash: big.baseHash, content: JSON.stringify(large) }), owner);
  const chunk1 = store.read('one', { path: big.path });
  const chunk2 = store.read('one', { path: big.path, offset: chunk1.nextOffset });
  assert.equal(chunk1.content + chunk2.content, JSON.stringify(large));
  // Persistence through restart, no disk source mutations.
  const restarted = createProjectSource({ db, sourceFile });
  assert.equal(restarted.read('one', { path: added.path }).content, 'export default () => null;');
  console.log('PASS: project source isolation, path restrictions, versions, history, restore, JSON validation, pagination, release conflicts and persistence.');
} finally { db.close(); }
