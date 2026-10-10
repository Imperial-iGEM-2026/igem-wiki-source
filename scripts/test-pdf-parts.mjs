import assert from 'node:assert/strict';
import { PDFDocument, PDFName, PDFRawStream } from 'pdf-lib';
import { randomBytes } from 'node:crypto';
import { splitPdf } from './pdf-parts.mjs';
const pdf = await PDFDocument.create();
for (let i = 0; i < 8; i++) {
  const page = pdf.addPage([300 + i, 400]);
  const stream = PDFRawStream.of(
    pdf.context.obj({}),
    Buffer.from('%' + randomBytes(3000).toString('hex') + '\n0 0 10 10 re S\n'),
  );
  page.node.set(PDFName.of('Contents'), pdf.context.register(stream));
}
const bytes = await pdf.save();
const parts = await splitPdf(bytes, 15000);
assert.ok(parts.length > 1);
const merged = await PDFDocument.create();
let next = 1;
for (const part of parts) {
  assert.ok(part.data.length <= 15000);
  assert.equal(part.start, next);
  const loaded = await PDFDocument.load(part.data);
  assert.equal(loaded.getPageCount(), part.end - part.start + 1);
  (await merged.copyPages(loaded, loaded.getPageIndices())).forEach((page) =>
    merged.addPage(page),
  );
  next = part.end + 1;
}
assert.equal(next, 9);
assert.deepEqual(
  merged.getPages().map((p) => p.getWidth()),
  pdf.getPages().map((p) => p.getWidth()),
);
await assert.rejects(splitPdf(bytes, 1000), /page 1 alone exceeds/);
await assert.rejects(splitPdf(Buffer.from('not a pdf')), /PDF/);
const form = await PDFDocument.create();
form.addPage();
form.getForm().createTextField('name');
await assert.rejects(splitPdf(await form.save(), 1000), /interactive forms/);
console.log(
  'PASS: PDF byte limits, ordered page ranges, complete merge, oversized page, corrupt input and forms.',
);
