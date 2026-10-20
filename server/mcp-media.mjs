import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { open, rename, stat, statfs, unlink } from 'node:fs/promises';
import path from 'node:path';
import { mediaTypes, matchesMedia } from './shared.mjs';
import { uploadSpaceError } from './upload-space.mjs';

export const mediaChunkBytes = 512 * 1024;
const lifetime = 24 * 60 * 60 * 1000;

// Pending bytes never enter /api/media or an export. Every operation is scoped
// to the authorizing link, project and page; completed URLs use normal media.
export function createMcpMedia({ db, dataDir, environment = {}, fail, diskSpace = statfs }) {
  const pendingDir = path.join(dataDir, 'mcp-uploads');
  const mediaDir = path.join(dataDir, 'media');
  mkdirSync(pendingDir, { recursive: true, mode: 0o700 });
  db.exec(`CREATE TABLE IF NOT EXISTS mcp_media_uploads (
    id TEXT PRIMARY KEY, link_id TEXT NOT NULL, project_id TEXT NOT NULL,
    page TEXT NOT NULL, name TEXT NOT NULL, ext TEXT NOT NULL,
    size INTEGER NOT NULL, received INTEGER NOT NULL DEFAULT 0,
    done INTEGER NOT NULL DEFAULT 0, expires INTEGER NOT NULL)`);
  const busy = new Set();
  const temp = (row) => path.join(pendingDir, row.id + '.part');
  const target = (row) => path.join(mediaDir, row.id + '.' + row.ext);
  function lookup(link, page, id) {
    const row = db.prepare('SELECT * FROM mcp_media_uploads WHERE id=? AND link_id=? AND project_id=? AND page=? AND expires>?')
      .get(String(id || ''), link.id, link.project_id, page, Date.now());
    if (!row) throw fail(404, 'Upload not found for this link and page, or expired. Start a new upload.');
    return row;
  }
  function result(row) {
    return {
      uploadId: row.id, name: row.name, size: row.size,
      receivedBytes: row.received, nextOffset: row.received,
      complete: !!row.done, chunkBytes: mediaChunkBytes,
      expiresAt: new Date(row.expires).toISOString(),
      ...(row.done ? {
        url: '/api/media/' + row.id + '.' + row.ext,
        type: mediaTypes[row.ext],
        kind: row.ext === 'pdf' ? 'pdf' : row.ext === 'glb' ? 'model' : mediaTypes[row.ext].split('/')[0],
        nextStep: 'Use this permanent url as src in add_section or update_section. Uploading alone does not change page content.',
      } : {}),
    };
  }
  async function cleanup() {
    for (const row of db.prepare('SELECT * FROM mcp_media_uploads WHERE expires<=?').all(Date.now())) {
      if (busy.has(row.id)) continue;
      await unlink(temp(row)).catch((e) => { if (e.code !== 'ENOENT') throw e; });
      db.prepare('DELETE FROM mcp_media_uploads WHERE id=?').run(row.id);
    }
  }
  function decode(base64) {
    if (typeof base64 !== 'string' || !base64.length ||
        base64.length > 4 * Math.ceil(mediaChunkBytes / 3))
      throw fail(413, 'Send at most 512 KiB of decoded bytes per call. Use start_media_upload and upload_media_chunk for larger files.');
    if (base64.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64))
      throw fail(400, 'base64 must contain the file bytes in standard base64, without a data URL prefix.');
    const bytes = Buffer.from(base64, 'base64');
    if (bytes.length > mediaChunkBytes || bytes.toString('base64') !== base64)
      throw fail(400, 'Invalid base64 file bytes.');
    return bytes;
  }
  async function start(link, page, { name, size }) {
    await cleanup();
    if (typeof name !== 'string' || !name.trim() || name.length > 180 || /[\\/\x00-\x1f]/.test(name))
      throw fail(400, 'Give a filename with its extension, without a directory path.');
    name = name.trim();
    const ext = name.split('.').pop().toLowerCase();
    if (!mediaTypes[ext]) throw fail(400, 'Unsupported file type. Use PNG, JPEG, WebP, GIF, PDF, MP4, WebM, MP3, WAV, OGG or GLB.');
    const large = ['mp4', 'webm', 'glb'].includes(ext);
    const max = large && environment.MEDIA_ORIGIN
      ? (Number(environment.MEDIA_LARGE_MAX_MIB || 0) * 1024 * 1024 || Number.MAX_SAFE_INTEGER)
      : 25 * 1024 * 1024;
    if (!Number.isSafeInteger(size) || size < 16 || size > max)
      throw fail(413, large && environment.MEDIA_ORIGIN
        ? 'File exceeds the configured server upload limit (minimum 16 bytes).'
        : 'This file must be between 16 bytes and 25 MiB.');
    const disk = await diskSpace(mediaDir);
    // Count again after asynchronous disk inspection, so simultaneous starts
    // cannot reserve the same space. No await occurs before the insert below.
    const active = db.prepare('SELECT link_id, size, received FROM mcp_media_uploads WHERE done=0').all();
    if (active.length >= 64 || active.filter(r => r.link_id === link.id).length >= 8)
      throw fail(429, 'Too many unfinished uploads. Complete or cancel one first.');
    // statfs already excludes written chunks. Reserve only bytes still to arrive.
    const reserved = active.reduce((sum, r) => sum + Math.max(0, r.size - r.received), 0);
    const spaceError = uploadSpaceError(disk.bavail * disk.bsize, reserved, size,
      Number(environment.MEDIA_MIN_FREE_MIB || 256));
    if (spaceError) throw fail(507, spaceError);
    const row = { id: randomUUID(), link_id: link.id, project_id: link.project_id,
      page, name, ext, size, received: 0, done: 0, expires: Date.now() + lifetime };
    db.prepare('INSERT INTO mcp_media_uploads VALUES(?,?,?,?,?,?,?,?,?,?)')
      .run(row.id, row.link_id, row.project_id, page, name, ext, size, 0, 0, row.expires);
    return result(row);
  }
  async function recover(row) {
    if (row.done) return row;
    // Recover a completed rename if the process stopped before recording it.
    const final = await stat(target(row)).catch(e => { if (e.code !== 'ENOENT') throw e; return null; });
    if (final?.size === row.size) {
      db.prepare('UPDATE mcp_media_uploads SET done=1,received=size WHERE id=?').run(row.id);
      row.done = 1; row.received = row.size;
    }
    return row;
  }
  async function append(link, page, { uploadId, offset, base64 }) {
    let row = lookup(link, page, uploadId);
    const bytes = decode(base64);
    if (!Number.isSafeInteger(offset) || offset < 0 || offset + bytes.length > row.size)
      throw fail(400, 'Invalid byte offset or chunk exceeds the declared file size.');
    if (busy.has(row.id) || busy.size >= 2)
      throw fail(429, 'An upload is busy. Retry the same chunk shortly.');
    busy.add(row.id);
    let handle;
    try {
      row = await recover(row);
      if (offset < row.received) {
        if (offset + bytes.length > row.received) throw fail(409, 'Overlapping chunk. Use get_media_upload for nextOffset.');
        handle = await open(row.done ? target(row) : temp(row), 'r');
        const existing = Buffer.alloc(bytes.length);
        const read = await handle.read(existing, 0, existing.length, offset);
        if (read.bytesRead !== bytes.length || !existing.equals(bytes))
          throw fail(409, 'A different chunk is already stored at that offset.');
        return result(row); // Safe retry after a lost response, including final chunk.
      }
      if (offset !== row.received) throw fail(409, 'Chunk is out of order. Use get_media_upload for nextOffset.');
      if (offset === 0 && (bytes.length < 16 || !matchesMedia(row.ext, bytes)))
        throw fail(400, 'File contents do not match its extension. The first chunk must contain at least 16 bytes.');
      handle = await open(temp(row), offset ? 'r+' : 'w', 0o600);
      await handle.truncate(offset);
      let written = 0;
      while (written < bytes.length) {
        const part = await handle.write(bytes, written, bytes.length - written, offset + written);
        if (!part.bytesWritten) throw Error('No bytes written');
        written += part.bytesWritten;
      }
      await handle.sync();
      await handle.close(); handle = null;
      row.received += bytes.length;
      if (row.received === row.size) {
        await rename(temp(row), target(row));
        row.done = 1;
      }
      db.prepare('UPDATE mcp_media_uploads SET received=?,done=? WHERE id=?').run(row.received, row.done, row.id);
      return result(row);
    } finally {
      await handle?.close();
      busy.delete(row.id);
    }
  }
  async function cancel(link, page, uploadId) {
    const row = lookup(link, page, uploadId);
    if (busy.has(row.id)) throw fail(409, 'Upload is busy. Retry shortly.');
    busy.add(row.id);
    try {
      await recover(row);
      if (row.done) throw fail(409, 'This upload is complete. Cancellation cannot delete a completed media file.');
      await unlink(temp(row)).catch(e => { if (e.code !== 'ENOENT') throw e; });
      db.prepare('DELETE FROM mcp_media_uploads WHERE id=?').run(row.id);
      return { cancelled: true, uploadId };
    } finally { busy.delete(row.id); }
  }
  return {
    start, append, cancel,
    status: (link, page, id) => result(lookup(link, page, id)),
    async upload(link, page, { name, base64 }) {
      const bytes = decode(base64);
      const session = await start(link, page, { name, size: bytes.length });
      try { return await append(link, page, { uploadId: session.uploadId, offset: 0, base64 }); }
      catch (error) { await cancel(link, page, session.uploadId).catch(() => {}); throw error; }
    },
  };
}
