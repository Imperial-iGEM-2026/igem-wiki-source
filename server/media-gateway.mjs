import {
  createHmac,
  timingSafeEqual,
  randomBytes,
  randomUUID,
} from 'node:crypto';
import {
  readFile,
  writeFile,
  open,
  unlink,
  stat,
  statfs,
} from 'node:fs/promises';
import path from 'node:path';
import { mediaTypes, matchesMedia } from './shared.mjs';
import { uploadSpaceError } from './upload-space.mjs';

export function createTicketSigner(
  secret,
  audience,
  now = () => Math.floor(Date.now() / 1000),
) {
  const mac = (payload) =>
    createHmac('sha256', secret).update(payload).digest();
  return {
    issue(claims, lifetime) {
      const payload = Buffer.from(
        JSON.stringify({
          ...claims,
          aud: audience,
          exp: now() + lifetime,
          nonce: randomUUID(),
        }),
      ).toString('base64url');
      return payload + '.' + mac(payload).toString('base64url');
    },
    verify(token, action, key) {
      if (typeof token !== 'string' || token.length > 2048)
        throw Error('Invalid media authorization');
      const parts = token.split('.');
      if (parts.length !== 2 || !parts.every((p) => /^[A-Za-z0-9_-]+$/.test(p)))
        throw Error('Invalid media authorization');
      const signature = Buffer.from(parts[1], 'base64url'),
        expected = mac(parts[0]);
      if (
        signature.length !== expected.length ||
        !timingSafeEqual(signature, expected)
      )
        throw Error('Invalid media authorization');
      const claims = JSON.parse(
        Buffer.from(parts[0], 'base64url').toString('utf8'),
      );
      if (
        claims.aud !== audience ||
        claims.action !== action ||
        claims.key !== key ||
        !Number.isSafeInteger(claims.exp) ||
        claims.exp <= now() ||
        typeof claims.nonce !== 'string'
      )
        throw Error('Expired or invalid media authorization');
      return claims;
    },
  };
}

export async function createMediaGateway({
  origin,
  editorOrigin,
  dataDir,
  db,
  file,
  json,
  fail,
  environment = {},
}) {
  const parsed = new URL(origin);
  if (
    parsed.protocol !== 'https:' ||
    parsed.origin !== origin ||
    parsed.username ||
    parsed.password ||
    origin === editorOrigin
  )
    throw Error('MEDIA_ORIGIN must be a separate exact HTTPS origin.');
  const secretPath = path.join(dataDir, 'media-signing.key');
  try {
    await writeFile(secretPath, randomBytes(32), { flag: 'wx', mode: 0o600 });
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
  const secret = await readFile(secretPath);
  if (secret.length !== 32)
    throw Error('Invalid media-signing.key; expected 32 random bytes.');
  const signer = createTicketSigner(secret, origin);
  db.exec(
    'CREATE TABLE IF NOT EXISTS consumed_uploads (nonce TEXT PRIMARY KEY, expires INTEGER NOT NULL)',
  );
  const consume = db.prepare(
    'INSERT INTO consumed_uploads VALUES(?,?) ON CONFLICT(nonce) DO NOTHING',
  );
  const maxMiB = Number(environment.MEDIA_LARGE_MAX_MIB || 0);
  const reserveMiB = Number(environment.MEDIA_MIN_FREE_MIB || 256);
  const timeoutSeconds = Number(
    environment.MEDIA_UPLOAD_TIMEOUT_SECONDS || 1800,
  );
  if (
    !Number.isSafeInteger(maxMiB) ||
    maxMiB < 0 ||
    !Number.isSafeInteger(reserveMiB) ||
    reserveMiB < 64 ||
    !Number.isSafeInteger(timeoutSeconds) ||
    timeoutSeconds < 60 ||
    timeoutSeconds > 86400
  )
    throw Error('Invalid direct-media limits');
  let uploading = 0,
    reserved = 0;
  async function space(size) {
    const disk = await statfs(path.join(dataDir, 'media'));
    const error = uploadSpaceError(disk.bavail * disk.bsize, reserved, size, reserveMiB);
    if (error) throw fail(507, error);
  }

  const readLinks = new Map();
  const rates = new Map();
  function limit(user, action, max) {
    const now = Date.now();
    for (const [key, value] of rates) if (value.until < now) rates.delete(key);
    const key = user.userId + ':' + action,
      current = rates.get(key) || { count: 0, until: now + 60000 };
    if (++current.count > max)
      throw fail(429, 'Too many media requests. Please retry in a minute.');
    rates.set(key, current);
  }
  const keyOK = (key) =>
    /^[a-f0-9-]{36}\.(png|jpe?g|webp|gif|mp4|webm|mp3|wav|ogg|pdf|glb)$/.test(
      key,
    );
  return {
    host: parsed.host,
    async readURL(key, user) {
      if (!keyOK(key)) throw fail(404, 'File not found');
      limit(user, 'read', 300);
      try {
        await stat(path.join(dataDir, 'media', key));
      } catch {
        throw fail(404, 'File not found');
      }
      const now = Math.floor(Date.now() / 1000);
      const cacheKey = JSON.stringify([user.userId, key]);
      const existing = readLinks.get(cacheKey);
      if (existing && existing.expires > now + 60) return existing.url;
      for (const [id, entry] of readLinks)
        if (entry.expires <= now + 60) readLinks.delete(id);
      if (readLinks.size >= 2000)
        readLinks.delete(readLinks.keys().next().value);
      const url =
        origin +
        '/file/' +
        key +
        '?ticket=' +
        signer.issue({ action: 'read', key }, 600);
      readLinks.set(cacheKey, { url, expires: now + 600 });
      return url;
    },
    async issueUpload(body, user) {
      limit(user, 'upload', 20);
      const name =
          typeof body?.name === 'string' ? body.name.slice(0, 180) : '',
        ext = name.split('.').pop().toLowerCase(),
        size = body?.size;
      if (!mediaTypes[ext]) throw fail(400, 'Unsupported media type');
      const large = ['mp4', 'webm', 'glb'].includes(ext);
      const max = large
        ? maxMiB
          ? maxMiB * 1024 * 1024
          : Number.MAX_SAFE_INTEGER
        : 25 * 1024 * 1024;
      if (!Number.isSafeInteger(size) || size < 16 || size > max)
        throw fail(
          413,
          large
            ? 'File exceeds the configured server upload limit.'
            : 'Other media must be between 16 bytes and 25 MiB.',
        );
      await space(size);
      const key = randomUUID() + '.' + ext,
        ticket = signer.issue({ action: 'upload', key, name, size }, 120);
      db.prepare('DELETE FROM consumed_uploads WHERE expires<?').run(
        Math.floor(Date.now() / 1000),
      );
      return {
        url: origin + '/upload/' + key + '?ticket=' + ticket,
        expiresIn: 120,
        timeoutMs: timeoutSeconds * 1000,
      };
    },
    async handle(req, res, url, pathname) {
      res.setHeader('Cache-Control', 'private, no-store');
      res.setHeader('Referrer-Policy', 'no-referrer');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Vary', 'Origin');
      if (req.headers.origin && req.headers.origin !== editorOrigin)
        throw fail(403, 'Origin not allowed');
      if (req.headers.origin === editorOrigin) {
        res.setHeader('Access-Control-Allow-Origin', editorOrigin);
        res.setHeader(
          'Access-Control-Expose-Headers',
          'Content-Range, Accept-Ranges, Content-Length, ETag',
        );
      }
      const route = /^\/(file|upload)\/([^/]+)$/.exec(pathname);
      if (!route || !keyOK(route[2])) throw fail(404, 'Route not found');
      const action = route[1] === 'file' ? 'read' : 'upload',
        key = route[2];
      let claims;
      try {
        claims = signer.verify(url.searchParams.get('ticket'), action, key);
      } catch {
        throw fail(
          403,
          'Media authorization expired or invalid. Reload the editor to obtain a new link.',
        );
      }
      if (req.method === 'OPTIONS') {
        if (req.headers.origin !== editorOrigin)
          throw fail(403, 'Origin not allowed');
        res.setHeader(
          'Access-Control-Allow-Methods',
          action === 'upload' ? 'POST' : 'GET, HEAD',
        );
        res.setHeader(
          'Access-Control-Allow-Headers',
          'Content-Type, Range, If-None-Match',
        );
        res.writeHead(204);
        return res.end();
      }
      if (action === 'read') {
        if (!['GET', 'HEAD'].includes(req.method))
          throw fail(405, 'Method not allowed');
        res.setHeader(
          'Content-Security-Policy',
          `script-src 'none'; object-src 'none'; base-uri 'none'; frame-ancestors ${editorOrigin}`,
        );
        return await file(
          req,
          res,
          path.join(dataDir, 'media', key),
          mediaTypes[key.split('.').pop()],
          Math.max(0, claims.exp - Math.floor(Date.now() / 1000)),
        );
      }
      if (req.method !== 'POST') throw fail(405, 'Method not allowed');
      if (req.headers.origin !== editorOrigin)
        throw fail(403, 'Origin not allowed');
      if (uploading >= 2)
        throw fail(429, 'Two uploads are running. Please retry shortly.');
      if (Number(req.headers['content-length']) !== claims.size)
        throw fail(400, 'Upload size differs from its authorization');
      await space(claims.size);
      if (uploading >= 2)
        throw fail(429, 'Two uploads are running. Please retry shortly.');
      if (!consume.run(claims.nonce, claims.exp).changes)
        throw fail(
          409,
          'Upload authorization already used. Request a new one.',
        );
      const filename = path.join(dataDir, 'media', key),
        ext = key.split('.').pop();
      let handle,
        total = 0,
        header = Buffer.alloc(0),
        verified = false,
        complete = false;
      uploading++;
      reserved += claims.size;
      try {
        handle = await open(filename, 'wx');
        for await (const chunk of req) {
          total += chunk.length;
          if (total > claims.size)
            throw fail(413, 'Upload exceeds authorized size');
          if (!verified) {
            header = Buffer.concat([header, chunk]);
            if (header.length < 16) continue;
            if (!matchesMedia(ext, header))
              throw fail(400, 'File contents do not match extension');
            verified = true;
            await handle.writeFile(header);
            header = null;
          } else await handle.writeFile(chunk);
        }
        if (!verified || total !== claims.size)
          throw fail(400, 'Incomplete upload');
        complete = true;
      } finally {
        await handle?.close();
        if (!complete) await unlink(filename).catch(() => {});
        uploading--;
        reserved -= claims.size;
      }
      json(res, 200, {
        url: '/api/media/' + key,
        name: claims.name,
        type: mediaTypes[ext],
        size: claims.size,
      });
    },
  };
}
