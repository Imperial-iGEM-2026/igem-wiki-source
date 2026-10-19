import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { writeFile, mkdir } from 'node:fs/promises';
import { layerTreeRows } from '../app/studio-layer-tree.ts';
import { coalesceRefresh } from '../app/content-sync.ts';

// Original traversal is retained as a behavioural oracle and benchmark baseline.
function previousTree(layout, collapsed) {
  const rows = [], seen = new Set(), nodes = new Map(layout.nodes.map(n => [n.id, n]));
  function visit(parentId, parentItemId, depth = 0) {
    for (const id of layout.order) {
      const node = nodes.get(id);
      if (!node || node.deleted || seen.has(id) || node.parentId !== parentId || node.parentItemId !== parentItemId) continue;
      seen.add(id); rows.push({ type: 'layer', id, depth });
      if (collapsed.includes(id)) continue;
      if (node.kind === 'accordion') {
        (node.items || []).forEach((item, index) => {
          rows.push({ type: 'item', id, item, index, depth: depth + 1 });
          visit(id, item.id, depth + 2);
        });
        rows.push({ type: 'add-item', id, depth: depth + 1 });
      } else visit(id, undefined, depth + 1);
    }
  }
  visit(); return rows;
}
const nodes = [
  { id: 'a', kind: 'accordion', items: [{ id: 'two' }, { id: 'one' }] },
  { id: 'image', kind: 'image', parentId: 'a', parentItemId: 'one' },
  { id: 'frame', kind: 'section', parentId: 'a', parentItemId: 'two' },
  { id: 'child', kind: 'text', parentId: 'frame' },
  { id: 'deleted', kind: 'section', deleted: true },
  { id: 'hidden-child', kind: 'image', parentId: 'deleted' },
  { id: 'orphan', kind: 'text', parentId: 'missing' },
];
for (const order of [nodes.map(n => n.id), nodes.map(n => n.id).reverse()]) {
  const layout = { nodes, order: [...order, 'a', 'missing'] };
  for (const collapsed of [[], ['a'], ['frame']])
    assert.deepEqual(layerTreeRows(layout, collapsed), previousTree(layout, collapsed));
}
const samples = [];
for (const count of [100, 1000, 5000]) {
  const nodes = Array.from({ length: count }, (_, i) => ({ id: 'node-' + i, kind: 'text' }));
  const layout = { nodes, order: nodes.map(n => n.id) };
  const timed = fn => {
    fn(layout, []);
    const times = Array.from({ length: 5 }, () => {
      const start = performance.now(); fn(layout, []); return performance.now() - start;
    }).sort((a, b) => a - b);
    return times[2];
  };
  assert.deepEqual(layerTreeRows(layout, []), previousTree(layout, []));
  samples.push({ layers: count, beforeMs: timed(previousTree), afterMs: timed(layerTreeRows) });
  let visits = 0;
  const order = new Proxy(layout.order, { get(target, key, receiver) {
    if (typeof key === 'string' && /^\d+$/.test(key)) visits++;
    return Reflect.get(target, key, receiver);
  } });
  layerTreeRows({ ...layout, order }, []);
  assert.equal(visits, count, 'Each ordered ID should be indexed only once');
}

let active = 0, maxActive = 0, calls = 0;
const releases = [];
const refresh = coalesceRefresh(async () => {
  calls++; active++; maxActive = Math.max(active, maxActive);
  await new Promise(resolve => releases.push(resolve)); active--;
});
const first = refresh();
for (let i = 0; i < 100; i++) assert.equal(refresh(), first);
assert.equal(calls, 1);
releases.shift()();
await new Promise(setImmediate);
assert.equal(calls, 2, 'Refresh again after an in-flight revision');
releases.shift()(); await first;
assert.equal(maxActive, 1);
const third = refresh(); releases.shift()(); await third;
assert.equal(calls, 3);
let fail = true;
const retry = coalesceRefresh(async () => { if (fail) throw Error('offline'); });
await assert.rejects(retry(), /offline/); fail = false; await retry();
await mkdir('work', { recursive: true });
await writeFile('work/studio-performance.json', JSON.stringify({ samples, refreshBurst: { requests: 101, fetches: 2, maxActive } }, null, 2));
console.log('PASS: layer order, subsections, collapse/deletion, linear traversal, refresh coalescing and recovery.');
console.table(samples);
