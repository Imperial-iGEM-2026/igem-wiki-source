import { createReadStream } from 'node:fs';
import {
  mkdir,
  readFile,
  writeFile,
  readdir,
  stat,
  unlink,
} from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

// Cache only successful, unchanged image validation, keyed by the exact bytes.
// No images, paths or project content are stored here. Bump the version whenever
// the decoding/validation policy changes so old approvals cannot bypass it.
export function createImageValidationCache(directory, { now = Date.now } = {}) {
  const version = 'native-sharp-0.35.5-strict-png-crc-v3';
  const ttl = 30 * 24 * 60 * 60_000;
  let initialized;
  const initialize = () =>
    (initialized ||= (async () => {
      await mkdir(directory, { recursive: true });
      const entries = [];
      for (const name of await readdir(directory)) {
        if (!/^[a-f0-9]{64}\.valid$/.test(name)) continue;
        const file = path.join(directory, name);
        const info = await stat(file).catch(() => null);
        if (!info) continue;
        if (now() - info.mtimeMs > ttl) await unlink(file).catch(() => {});
        else entries.push({ file, time: info.mtimeMs });
      }
      entries.sort((a, b) => b.time - a.time);
      for (const entry of entries.slice(2048))
        await unlink(entry.file).catch(() => {});
    })().catch(() => {}));
  return {
    async check(file, validate, onHit = () => {}) {
      await initialize();
      const before = await stat(file);
      const hash = createHash('sha256').update(version);
      for await (const chunk of createReadStream(file)) hash.update(chunk);
      const key = hash.digest('hex');
      const marker = path.join(directory, key + '.valid');
      try {
        const saved = JSON.parse(await readFile(marker, 'utf8'));
        if (
          saved.version === version &&
          saved.key === key &&
          saved.expires > now() &&
          saved.expires <= now() + ttl
        ) {
          onHit();
          return { changed: false, cached: true };
        }
      } catch {
        /* A missing/damaged cache entry requires strict decoding. */
      }
      const result = await validate();
      const after = await stat(file);
      if (
        !result.changed &&
        before.size === after.size &&
        before.mtimeMs === after.mtimeMs &&
        before.ctimeMs === after.ctimeMs
      ) {
        await writeFile(
          marker,
          JSON.stringify({ version, key, expires: now() + ttl }),
          { mode: 0o600 },
        ).catch(() => {});
      }
      return result;
    },
  };
}
