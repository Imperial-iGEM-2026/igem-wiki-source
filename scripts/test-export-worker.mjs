import assert from 'node:assert/strict';
import { PDFDocument, PDFName, PDFRawStream } from 'pdf-lib';
import { randomBytes } from 'node:crypto';
import { mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { PNG } from 'pngjs';
import { createExportProcessing } from '../selfhost-dist/server/export-processing.mjs';
const dir = await mkdtemp(path.resolve('work/export-worker-'));
const document = await PDFDocument.create();
for (let i = 0; i < 12; i++) {
  const page = document.addPage([300 + i, 400]);
  page.node.set(
    PDFName.of('Contents'),
    document.context.register(
      PDFRawStream.of(
        document.context.obj({}),
        Buffer.from(
          '%' + randomBytes(550000).toString('hex') + '\n0 0 10 10 re S\n',
        ),
      ),
    ),
  );
}
const file = path.join(dir, 'large.pdf');
await writeFile(file, await document.save());
const processing = createExportProcessing();
let ticks = 0;
const timer = setInterval(() => ticks++, 10);
try {
  const parts = await processing.run('pdf', file);
  assert.ok(parts.length > 1);
  assert.equal(parts[0].start, 1);
  assert.equal(parts.at(-1).end, 12);
  assert.ok(parts.every((p) => p.data.length <= 9000000));
  assert.ok(ticks > 0, 'main event loop remains responsive');
  const image = path.join(dir, 'small.png');
  const invalidPng = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aBaoAAAAASUVORK5CYII=',
    'base64',
  );
  await writeFile(image, invalidPng);
  await assert.rejects(processing.run('image', image), /small.png: image validation failed/);
  const imageBytes = PNG.sync.write({width:1,height:1,data:Buffer.from([255,255,255,255])});
  await writeFile(image, imageBytes);
  assert.deepEqual(
    Buffer.from((await processing.run('image', image)).data),
    imageBytes,
  );
  const bad = path.join(dir, 'broken.pdf');
  await writeFile(bad, 'not a PDF');
  await assert.rejects(processing.run('pdf', bad));
  console.log(
    `PASS: large PDF split in worker, complete ordered parts under 9 MB; main thread ticked ${ticks} times while processing.`,
  );
} finally {
  clearInterval(timer);
  processing.close();
}
