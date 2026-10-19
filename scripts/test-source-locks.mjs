import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { Worker } from 'node:worker_threads';
import path from 'node:path';
import { createProjectSource } from '../server/project-source.mjs';
const dir = mkdtempSync(path.resolve('work/source-lock-test-'));
const sourceFile = path.join(dir, 'source.json'), database = path.join(dir, 'locks.sqlite');
const file = 'app/page-index.css';
writeFileSync(sourceFile, JSON.stringify({ [file]: 'nav { color: blue; }' }));
const db = new DatabaseSync(database);
db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000');
let clock = Date.now();
const alice = { id: 'alice-link', name: 'Alice dev', approvedBy: 'Alice', expiresAt: clock + 86400000 };
const bob = { id: 'bob-link', name: 'Bob dev', approvedBy: 'Bob', expiresAt: clock + 86400000 };
const store = createProjectSource({ db, sourceFile, now: () => clock });
const argsFor = () => { const s = store.read('one', { path: file }); return { path: file, ifVersion: s.version, ifBaseHash: s.baseHash, content: 'red' }; };
try {
  assert.throws(() => store.write('one', 'Alice', argsFor(), alice), /valid source-file lock/);
  const lease = store.acquire('one', alice, { path: file, editorName: 'Sidebar work' });
  assert.equal(lease.lock.expiresAt, clock + 300000);
  assert.equal(store.read('one', { path: file }, bob.id).lock.owner.editorName, 'Sidebar work');
  assert.equal(store.list('one', alice.id).find(f => f.path === file).lock.ownedByThisLink, true);
  assert.ok(!JSON.stringify(store.status('one', undefined, bob.id)).includes(lease.lockToken));
  assert.throws(() => store.acquire('one', bob, { path: file }), /already reserved/);
  assert.throws(() => store.acquire('one', alice, { path: file }), /already reserved/);
  for (const method of ['write', 'replace', 'restore']) {
    const args = { ...argsFor(), lockToken: lease.lockToken, oldText: 'blue', newText: 'red', targetVersion: 0 };
    assert.throws(() => store[method]('one', 'Bob', args, bob), /valid source-file lock/);
  }
  assert.throws(() => store.release('one', bob, { path: file, lockToken: lease.lockToken }), /valid source-file lock/);
  assert.throws(() => store.renew('one', alice, { path: file, lockToken: 'wrong' }), /valid source-file lock/);
  assert.throws(() => store.renew('one', alice, { path: file, lockToken: lease.lockToken, ttlSeconds: 901 }), /30–900/);
  const independent = store.acquire('two', bob, { path: file });
  store.release('two', bob, { path: file, lockToken: independent.lockToken });
  clock += 200000;
  store.renew('one', alice, { path: file, lockToken: lease.lockToken, ttlSeconds: 300 });
  clock += 200000;
  const saved = store.write('one', 'Alice', { ...argsFor(), lockToken: lease.lockToken }, alice);
  assert.equal(saved.version, 1);
  assert.equal(store.status('one', file).updatedBy, 'Alice');
  // Restart preserves the current reservation; no in-memory-only mutex.
  const db2 = new DatabaseSync(database);
  const restarted = createProjectSource({ db: db2, sourceFile, now: () => clock });
  assert.equal(restarted.status('one', file).lock.owner.linkId, alice.id);
  db2.close();
  clock += 100000; // exact expiry boundary
  assert.equal(store.status('one', file).lock.status, 'unlocked');
  assert.throws(() => store.renew('one', alice, { path: file, lockToken: lease.lockToken }), /valid source-file lock/);
  const next = store.acquire('one', bob, { path: file, ttlSeconds: 30 });
  assert.throws(() => store.write('one', 'Alice', { ...argsFor(), lockToken: lease.lockToken }, alice), /valid source-file lock/);
  store.write('one', 'Bob', { ...argsFor(), lockToken: next.lockToken, content: 'black' }, bob);
  store.release('one', bob, { path: file, lockToken: next.lockToken });
  const newer = store.acquire('one', bob, { path: file });
  assert.notEqual(newer.lockToken, next.lockToken);
  assert.throws(() => store.release('one', bob, { path: file, lockToken: next.lockToken }), /valid source-file lock/);
  store.releaseOwner(bob.id);
  assert.equal(store.status('one', file).lock.status, 'unlocked');
  const shortLived = store.acquire('one', { ...alice, expiresAt: clock + 12000 }, { path: file });
  assert.equal(shortLived.lock.expiresAt, clock + 12000);
  store.releaseOwner(alice.id);
  const addedPath = 'app/project-components/New.tsx';
  store.acquire('one', alice, { path: addedPath });
  assert.ok(store.list('one').some(f => f.path === addedPath && f.lock.status === 'locked'));

  // Two independent SQLite connections compete at the same moment.
  const moduleURL = new URL('../server/project-source.mjs', import.meta.url).href;
  const workers = [alice, bob].map(owner => new Worker(`
    const { parentPort, workerData } = require('node:worker_threads');
    const { DatabaseSync } = require('node:sqlite');
    (async () => {
      const { createProjectSource } = await import(workerData.moduleURL);
      const db = new DatabaseSync(workerData.database); db.exec('PRAGMA busy_timeout=5000');
      const store = createProjectSource({ db, sourceFile: workerData.sourceFile });
      parentPort.once('message', () => {
        try { const result=store.acquire('race', workerData.owner, {path:workerData.file}); parentPort.postMessage({ok:true,result}); }
        catch(e) { parentPort.postMessage({ok:false,status:e.status,message:e.message}); }
        finally { db.close(); }
      });
      parentPort.postMessage('ready');
    })().catch(e => { throw e; });`, { eval: true, workerData: { owner, moduleURL, database, sourceFile, file } }));
  await Promise.all(workers.map(worker => new Promise((resolve, reject) => { worker.once('message', resolve); worker.once('error', reject); })));
  const results = workers.map(worker => new Promise((resolve, reject) => { worker.once('message', resolve); worker.once('error', reject); }));
  workers.forEach(worker => worker.postMessage('go'));
  const race = await Promise.all(results);
  assert.equal(race.filter(r => r.ok).length, 1);
  assert.equal(race.find(r => !r.ok).status, 409);
  await Promise.all(workers.map(worker => worker.terminate()));
  console.log('PASS: competing developers/connections, ownership, renewal, exact expiry, stale tokens, rollback protection, project isolation, link-expiry cap, restart persistence and lock status.');
} finally { db.close(); }
