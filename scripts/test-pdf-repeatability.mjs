import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { PDFDocument, PDFName, PDFRawStream } from 'pdf-lib';
import { splitPdf } from './pdf-parts.mjs';
import { assetURL } from '../upload-helper/sites.mjs';

const implementations = [['source', splitPdf]];
if (process.argv.includes('--built')) {
  implementations.push(['server worker', (await import('../selfhost-dist/server/media-processing.mjs')).splitPdf]);
}
for (const [name, split] of implementations) {
  await test(`${name}: unchanged PDF parts remain identical across exports and reuse hosted URLs`, async (t) => {
    t.mock.timers.enable({ apis: ['Date'], now: Date.UTC(2026, 0, 1) });
    const source = await PDFDocument.create();
    for (let i = 0; i < 4; i++) {
      const page = source.addPage([300 + i, 400]);
      const stream = Buffer.from('%' + randomBytes(2000).toString('hex') + '\n0 0 10 10 re S\n');
      page.node.set(PDFName.of('Contents'), source.context.register(PDFRawStream.of(source.context.obj({}), stream)));
    }
    const bytes = await source.save();
    const first = await split(bytes, 6000);
    t.mock.timers.tick(86400_000);
    const second = await split(bytes, 6000);
    assert.equal(first.length, 4);
    assert.deepEqual(second.map(({ start, end }) => [start, end]), [[1, 1], [2, 2], [3, 3], [4, 4]]);
    for (let i = 0; i < first.length; i++) {
      assert.deepEqual(second[i].data, first[i].data);
      const hash = (data) => createHash('sha256').update(data).digest('hex');
      const url = `https://static.igem.wiki/teams/6377/documents/rgel-${hash(first[i].data).slice(0, 24)}.pdf`;
      assert.equal(assetURL([url], { hash: hash(second[i].data), kind: 'pdf' }), url);
      const part = await PDFDocument.load(second[i].data, { updateMetadata: false });
      assert.equal(part.getPageCount(), 1);
      assert.equal(part.getPage(0).getWidth(), 300 + i);
      assert.equal(part.getCreationDate(), undefined);
      assert.equal(part.getModificationDate(), undefined);
    }
    source.getPage(0).setWidth(777);
    const changed = await split(await source.save(), 6000);
    assert.notDeepEqual(changed[0].data, first[0].data);
  });
}
