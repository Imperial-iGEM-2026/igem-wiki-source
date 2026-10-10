import { open } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_TOTAL_IMAGE_BYTES = 10 * 1024 * 1024;
const invalid = (message) => Object.assign(Error(message), { status: 400 });
export function imageExtension(bytes) {
  if (
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return 'png';
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'jpg';
  if (
    bytes.toString('ascii', 0, 4) === 'RIFF' &&
    bytes.toString('ascii', 8, 12) === 'WEBP'
  )
    return 'webp';
  throw invalid('Attach a PNG, JPEG or WebP image.');
}
export async function loadAiImages(dataDir, images = []) {
  if (!Array.isArray(images) || images.length > 4)
    throw invalid('Attach up to four images.');
  let total = 0;
  const result = [];
  for (const image of images) {
    if (
      !image ||
      typeof image.url !== 'string' ||
      !/^\/api\/media\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.(png|jpe?g|webp)$/.test(
        image.url,
      )
    )
      throw invalid('Choose an image uploaded to this site.');
    let handle;
    try {
      handle = await open(
        path.join(dataDir, 'media', path.basename(image.url)),
        constants.O_RDONLY | (constants.O_NOFOLLOW || 0),
      );
      const meta = await handle.stat();
      total += meta.size;
      if (
        !meta.isFile() ||
        meta.size < 16 ||
        meta.size > MAX_IMAGE_BYTES ||
        total > MAX_TOTAL_IMAGE_BYTES
      )
        throw invalid('Images must be at most 5 MiB each and 10 MiB combined.');
      const bytes = Buffer.alloc(meta.size);
      let offset = 0;
      while (offset < bytes.length) {
        const { bytesRead } = await handle.read(
          bytes,
          offset,
          bytes.length - offset,
          offset,
        );
        if (!bytesRead) throw invalid('Image upload is incomplete.');
        offset += bytesRead;
      }
      result.push({
        name:
          typeof image.name === 'string' ? image.name.slice(0, 120) : 'Image',
        extension: imageExtension(bytes),
        data: bytes.toString('base64'),
      });
    } catch (error) {
      if (error.status) throw error;
      throw invalid(
        'An attached image is unavailable. Remove it and attach it again.',
      );
    } finally {
      await handle?.close();
    }
  }
  return result;
}

// The worker accepts image bytes only, never browser-supplied filesystem paths.
export function decodeAiImages(images = []) {
  if (!Array.isArray(images) || images.length > 4)
    throw invalid('Too many images');
  let total = 0;
  return images.map((image) => {
    if (
      !image ||
      typeof image.data !== 'string' ||
      image.data.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4 ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(image.data)
    )
      throw invalid('Invalid image data');
    const bytes = Buffer.from(image.data, 'base64');
    total += bytes.length;
    if (
      bytes.length < 16 ||
      bytes.length > MAX_IMAGE_BYTES ||
      total > MAX_TOTAL_IMAGE_BYTES
    )
      throw invalid('Images are too large');
    return {
      bytes,
      extension: imageExtension(bytes),
      name: typeof image.name === 'string' ? image.name.slice(0, 120) : 'Image',
    };
  });
}
