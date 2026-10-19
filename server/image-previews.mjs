import {
  mkdir,
  stat,
  readdir,
  unlink,
  writeFile,
  rename,
} from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { runNativeImage } from './image-native-process.mjs';

// A disposable, private cache. Originals and exported media are never modified.
export function createImagePreviews(
  dataDir,
  { process = runNativeImage, maxBytes = 128 * 1024 * 1024 } = {},
) {
  const directory = path.join(dataDir, 'image-previews');
  const pending = new Map();
  const failures = new Map();
  let tail = Promise.resolve();
  async function trim() {
    const entries = await readdir(directory);
    const files = await Promise.all(
      entries
        .filter((name) => /^[a-f0-9]{64}\.webp$/.test(name))
        .map(async (name) => {
          const file = path.join(directory, name);
          const info = await stat(file);
          return { file, size: info.size, time: info.mtimeMs };
        }),
    );
    let total = files.reduce((sum, item) => sum + item.size, 0);
    for (const item of files.sort((a, b) => a.time - b.time)) {
      if (total <= maxBytes) break;
      await unlink(item.file).catch(() => {});
      total -= item.size;
    }
  }
  return async (key, size) => {
    if (
      !/^[a-f0-9-]+\.(jpe?g|png|webp)$/.test(key) ||
      ![160, 1600].includes(size)
    )
      throw Object.assign(Error('Invalid image preview'), { status: 400 });
    const input = path.join(dataDir, 'media', key);
    const info = await stat(input).catch(() => {
      throw Object.assign(Error('Image not found'), { status: 404 });
    });
    if (!info.isFile() || info.size > 50 * 1024 * 1024)
      throw Object.assign(Error('Image is too large for an editor preview.'), {
        status: 422,
      });
    const hash = createHash('sha256')
      .update(`preview-v1:${key}:${info.size}:${info.mtimeMs}:${size}`)
      .digest('hex');
    const output = path.join(directory, hash + '.webp');
    try {
      if ((await stat(output)).isFile()) return output;
    } catch {}
    const previous = failures.get(hash);
    if (previous && previous.until > Date.now()) throw previous.error;
    if (pending.has(hash)) return pending.get(hash);
    if (pending.size >= 128)
      throw Object.assign(Error('Image previews are busy. Retry shortly.'), {
        status: 503,
      });
    const job = tail.then(async () => {
      await mkdir(directory, { recursive: true });
      const result = await process(input, {
        previewSize: size,
        timeoutMs: 30_000,
      });
      const temp = output + '.tmp';
      try {
        await writeFile(temp, result.data);
        await rename(temp, output);
      } finally {
        await unlink(temp).catch(() => {});
      }
      await trim();
      return output;
    });
    pending.set(hash, job);
    tail = job.catch(() => {});
    try {
      return await job;
    } catch (cause) {
      const error = Object.assign(
        Error('Editor preview unavailable: ' + cause.message),
        { status: 422 },
      );
      for (const [id, value] of failures)
        if (value.until <= Date.now()) failures.delete(id);
      if (failures.size >= 128) failures.delete(failures.keys().next().value);
      failures.set(hash, { error, until: Date.now() + 60_000 });
      throw error;
    } finally {
      pending.delete(hash);
    }
  };
}
