import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createExportProcessing } from '../server/export-processing.mjs';
const dir = await mkdtemp(path.resolve('work/media-queue-'));
const worker = path.join(dir, 'worker.mjs');
await writeFile(
  worker,
  `import { parentPort, threadId } from 'node:worker_threads';
let busy = false;
parentPort.on('message', ({id, file}) => {
  if (busy) throw Error('Concurrent decode on one worker');
  busy = true;
  if(file === 'crash') throw Error('decoder failed');
  if(file === 'hang') return;
  setTimeout(() => { busy = false; parentPort.postMessage({id, result:{file,threadId},recycle:file==='recycle'}); },20);
});`,
);
const processing = createExportProcessing({
  workerURL: pathToFileURL(worker),
  timeoutMs: 3000,
  idleMs: 3000,
});
try {
  const [a, b] = await Promise.all([
    processing.run('image', 'first'),
    processing.run('image', 'second'),
  ]);
  assert.equal(a.file, 'first');
  assert.equal(b.file, 'second');
  assert.equal(a.threadId, b.threadId);
  const failed = assert.rejects(
    processing.run('image', 'crash'),
    /decoder failed/,
  );
  const recovered = processing.run('image', 'recovered');
  await failed;
  const c = await recovered;
  assert.notEqual(c.threadId, a.threadId);
  const recycle = await processing.run('image', 'recycle');
  const next = await processing.run('image', 'after-recycle');
  assert.notEqual(recycle.threadId, next.threadId);
  const one = assert.rejects(processing.run('image', 'hang'), /shutting down/);
  const two = assert.rejects(
    processing.run('image', 'queued'),
    /shutting down/,
  );
  processing.close();
  await Promise.all([one, two]);
  await assert.rejects(processing.run('image', 'closed'), /shutting down/);
} finally {
  processing.close();
}
const timed = createExportProcessing({
  workerURL: pathToFileURL(worker),
  timeoutMs: 300,
  idleMs: 3000,
});
try {
  await assert.rejects(timed.run('image', 'hang'), /exceeded/);
  assert.equal(
    (await timed.run('image', 'after-timeout')).file,
    'after-timeout',
  );
} finally {
  timed.close();
}
console.log(
  'PASS: worker reuse, serialization, crash recovery, recycling, timeout recovery and close reject queued work.',
);
