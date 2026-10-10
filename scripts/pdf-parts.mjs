import { PDFDocument } from 'pdf-lib';

// Decimal bytes: leave headroom below either interpretation of the 10 MB limit.
export const PDF_PART_BYTES = 9_000_000;
export async function splitPdf(bytes, limit = PDF_PART_BYTES) {
  const source = await PDFDocument.load(bytes, { updateMetadata: false });
  if (source.getForm().getFields().length)
    throw Error(
      'This large PDF contains interactive forms. Export a flattened reading copy before splitting.',
    );
  const parts = [];
  async function range(start, end) {
    const part = await PDFDocument.create();
    const pages = await part.copyPages(
      source,
      Array.from({ length: end - start }, (_, i) => start + i),
    );
    pages.forEach((page) => part.addPage(page));
    const data = await part.save({ useObjectStreams: true });
    if (data.length <= limit) parts.push({ start: start + 1, end, data });
    else if (end - start === 1)
      throw Error(
        `PDF page ${start + 1} alone exceeds ${limit.toLocaleString()} bytes. Compress that page's images and export again.`,
      );
    else {
      const middle = Math.floor((start + end) / 2);
      await range(start, middle);
      await range(middle, end);
    }
  }
  if (!source.getPageCount()) throw Error('The PDF has no pages.');
  await range(0, source.getPageCount());
  return parts;
}
