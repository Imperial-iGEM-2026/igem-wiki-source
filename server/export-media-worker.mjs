import { parentPort } from 'node:worker_threads';
import { readFile } from 'node:fs/promises';
import { runNativeImage } from './image-native-process.mjs';
parentPort.on('message', async ({ id, kind, file, omitUnchangedData }) => {
  try {
    let result =
      kind === 'pdf'
        ? await (
            await import('./media-processing.mjs')
          ).splitPdf(await readFile(file))
        : await runNativeImage(file, { omitUnchangedData });
    if (kind === 'image' && !result.changed && omitUnchangedData)
      result = { changed: false };
    for (const item of Array.isArray(result) ? result : [result])
      if (Buffer.isBuffer(item.data)) item.data = Uint8Array.from(item.data);
    const buffers = [
      ...new Set(
        (Array.isArray(result) ? result : [result])
          .filter((item) => item.data)
          .map((item) => item.data.buffer),
      ),
    ];
    // Recycle after large decodes to release their coefficient/output allocations.
    const memory = process.memoryUsage();
    const recycle =
      memory.heapUsed > 128 * 1024 ** 2 ||
      memory.arrayBuffers > 128 * 1024 ** 2;
    parentPort.postMessage({ id, result, recycle }, buffers);
  } catch (error) {
    parentPort.postMessage({
      id,
      error: ['ENOENT', 'EACCES'].includes(error.code)
        ? 'The saved file is no longer readable. Restore it and prepare a fresh export.'
        : error.message,
    });
  }
});
