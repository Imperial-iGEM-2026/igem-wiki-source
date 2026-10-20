import { createHash } from 'node:crypto';
import { readFile, lstat } from 'node:fs/promises';
import path from 'node:path';

export const GIT_FILE_BYTES = 10_000_000;
export const SOURCE_PART_BYTES = 512 * 1024;
const hash = (text) => createHash('sha256').update(text).digest('hex');
const json = (data) => JSON.stringify(data, null, 2) + '\n';
const partName = /^content-parts\/[a-f0-9]{64}\.json$/;
const object = (value) => value && typeof value === 'object' && !Array.isArray(value);

export function validateSource(source) {
  if (!object(source) || source.format !== 'prion-wiki-source' ||
      source.version !== 1 || !object(source.values) ||
      Object.keys(source).some((key) => !['format', 'version', 'values'].includes(key)) ||
      Object.values(source.values).some((value) => typeof value !== 'string'))
    throw Error('Use reviewed prion-wiki-source data with only format, version and string values. Never commit a portable/private snapshot or embedded media.');
  return source;
}

// Content remains editable JSON text. Hash-named parts are deterministic, and
// long individual values can span parts without changing a single character.
export function partitionSource(source, { force = false } = {}) {
  validateSource(source);
  const original = json(source);
  if (!force && Buffer.byteLength(original) < 4_000_000)
    return [{ path: 'publication/content.json', content: original }];
  const files = new Map(), parts = [];
  let values = Object.create(null);
  const flush = () => {
    if (!Object.keys(values).length) return;
    const content = json({ values });
    const sha256 = hash(content);
    const file = `content-parts/${sha256}.json`;
    const bytes = Buffer.byteLength(content);
    if (bytes > SOURCE_PART_BYTES) throw Error('Publication source part exceeds its size budget.');
    files.set('publication/' + file, content);
    parts.push({ file, bytes, sha256 });
    values = Object.create(null);
  };
  for (const [key, value] of Object.entries(source.values)) {
    if (Buffer.byteLength(key) > 4096) throw Error('Publication source key is too long.');
    let start = 0;
    do {
      let end = Math.min(start + 64 * 1024, value.length);
      if (end < value.length && /[\uD800-\uDBFF]/.test(value[end - 1])) end--;
      const text = value.slice(start, end);
      if (Object.hasOwn(values, key) ||
          Buffer.byteLength(json({ values: { ...values, [key]: text } })) > SOURCE_PART_BYTES)
        flush();
      values[key] = text;
      start = end;
    } while (start < value.length);
  }
  flush();
  const manifest = json({ format: 'prion-wiki-source', version: 2, parts });
  if (Buffer.byteLength(manifest) >= GIT_FILE_BYTES)
    throw Error('Publication source index is too large; reduce the exported content.');
  return [
    { path: 'publication/content.json', content: manifest },
    ...Array.from(files, ([file, content]) => ({ path: file, content })),
  ];
}

export async function resolveSource(source, readPart) {
  if (source?.version !== 2) return validateSource(source);
  if (source.format !== 'prion-wiki-source' || !Array.isArray(source.parts) ||
      !source.parts.length ||
      Object.keys(source).some((key) => !['format', 'version', 'parts'].includes(key)))
    throw Error('Invalid partitioned publication source index.');
  const pieces = new Map();
  for (const part of source.parts) {
    if (!object(part) || !partName.test(part.file) ||
        !/^[a-f0-9]{64}$/.test(part.sha256) ||
        !Number.isSafeInteger(part.bytes) || part.bytes <= 0 || part.bytes > SOURCE_PART_BYTES)
      throw Error('Invalid publication source part reference.');
    const content = await readPart(part.file);
    if (Buffer.byteLength(content) !== part.bytes || hash(content) !== part.sha256)
      throw Error(`Publication source part is incomplete or changed: ${part.file}. Restore it from the export.`);
    const data = JSON.parse(content);
    if (!object(data) || Object.keys(data).length !== 1 || !object(data.values) ||
        Object.values(data.values).some((value) => typeof value !== 'string'))
      throw Error(`Invalid publication source part: ${part.file}`);
    for (const [key, value] of Object.entries(data.values)) {
      if (!pieces.has(key)) pieces.set(key, []);
      pieces.get(key).push(value);
    }
  }
  return validateSource({
    format: 'prion-wiki-source', version: 1,
    values: Object.fromEntries(Array.from(pieces, ([key, chunks]) => [key, chunks.join('')])),
  });
}

export async function readSource(file) {
  return resolveSource(JSON.parse(await readFile(file, 'utf8')), async (name) => {
    const folder = path.join(path.dirname(file), 'content-parts');
    const target = path.join(path.dirname(file), name);
    if ((await lstat(folder)).isSymbolicLink() || (await lstat(target)).isSymbolicLink())
      throw Error('Publication source part symlinks are not allowed.');
    if ((await lstat(target)).size > SOURCE_PART_BYTES)
      throw Error(`Publication source part is too large: ${name}`);
    return readFile(target, 'utf8');
  });
}
