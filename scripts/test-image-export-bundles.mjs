import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import jpeg from 'jpeg-js';
import { createBundleExports } from '../selfhost-dist/server/export-bundles.mjs';
import { createExportProcessing } from '../selfhost-dist/server/export-processing.mjs';
const dataDir = await mkdtemp(path.resolve('work/corrupt-image-export-'));
await mkdir(path.join(dataDir, 'media'));
const filename = 'truncated.jpg',
  source = '/api/media/' + filename;
const healthy = jpeg.encode(
  { width: 16, height: 16, data: Buffer.alloc(16 * 16 * 4, 200) },
  85,
).data;
const file = path.join(dataDir, 'media', filename);
await writeFile(file, healthy.subarray(0, healthy.length - 20));
const worker = createExportProcessing();
let checks = 0;
const exporter = createBundleExports({
  dataDir,
  clientDir: path.resolve('selfhost-dist/client'),
  processing: {
    run(...args) {
      checks++;
      return worker.run(...args);
    },
    close() {
      worker.close();
    },
  },
});
const input = {
  userId: 'tester',
  project: { id: 'test', name: 'test' },
  team: 'imperial-college',
  template: {
    pages: [
      'home',
      'attributions',
      'contribution',
      'engineering',
      'human-practices',
    ].map((slug) => ({
      slug,
      title: slug === 'human-practices' ? 'Human Practices' : slug,
      layers: [],
    })),
  },
  values: {
    'layout:human-practices': JSON.stringify({
      nodes: [
        {
          id: 'photo',
          name: 'Interview photograph',
          kind: 'image',
          src: source,
        },
      ],
      order: ['photo'],
    }),
  },
};
try {
  await assert.rejects(exporter.prepare(input), (error) => {
    assert.equal(error.status, 422);
    assert.match(error.message, /truncated.jpg.*image validation failed/);
    assert.equal(error.mediaIssues[0].source, source);
    assert.ok(
      error.mediaIssues[0].locations.some(
        (x) =>
          x.page === 'human-practices' &&
          x.layerId === 'photo' &&
          x.layerName === 'Interview photograph',
      ),
    );
    return true;
  });
  await writeFile(file, healthy);
  const plan = await exporter.prepare(input);
  assert.ok(plan.downloads.some((x) => x.key === 'assets'));
  assert.deepEqual(await readFile(file), healthy);
  assert.equal(checks, 2);
  const progress = [];
  await exporter.prepare({
    ...input,
    onProgress: (update) => progress.push(update.message),
  });
  assert.equal(
    checks,
    2,
    'unchanged images reuse verification during a real export',
  );
  assert.ok(
    progress.some((message) => message.startsWith('Reusing verified image:')),
  );
  await writeFile(file, healthy.subarray(0, healthy.length - 20));
  await assert.rejects(exporter.prepare(input), /image validation failed/);
  assert.equal(checks, 3, 'replaced bytes must be decoded again');
  console.log(
    'PASS: export rejects corrupt JPEG with page/layer diagnostics; valid replacement is unchanged, repeat preparation reuses verification and later corrupt replacement is rejected.',
  );
} finally {
  exporter.close();
}
