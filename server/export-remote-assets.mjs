import { lookup as dnsLookup } from 'node:dns/promises';
import { isIP, BlockList } from 'node:net';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { createWriteStream } from 'node:fs';
import { stat, rm } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import { createHash } from 'node:crypto';
import path from 'node:path';

const blocked = new BlockList();
for (const [address, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10],
  ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
  ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16],
  ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24],
  ['224.0.0.0', 4], ['240.0.0.0', 4],
]) blocked.addSubnet(address, prefix);
// Only ordinary global IPv6 unicast; exclude transition/documentation ranges.
const globalV6 = new BlockList();
globalV6.addSubnet('2000::', 3, 'ipv6');
for (const [address, prefix] of [
  ['2001::', 23], ['2001:db8::', 32], ['2002::', 16], ['3fff::', 20],
]) blocked.addSubnet(address, prefix, 'ipv6');
export function publicAssetAddress(address) {
  const family = isIP(address);
  return family === 4
    ? !blocked.check(address, 'ipv4')
    : family === 6 && globalV6.check(address, 'ipv6') &&
        !blocked.check(address, 'ipv6');
}
const extensions = new Map(Object.entries({
  'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp',
  'image/gif': '.gif', 'image/avif': '.avif', 'image/svg+xml': '.svg',
  'image/x-icon': '.ico', 'image/vnd.microsoft.icon': '.ico',
  'application/pdf': '.pdf', 'font/woff': '.woff', 'font/woff2': '.woff2',
  'font/ttf': '.ttf', 'font/otf': '.otf', 'model/gltf-binary': '.glb',
  'model/gltf+json': '.gltf', 'text/plain': '.txt', 'text/csv': '.csv',
  'application/zip': '.zip', 'text/javascript': '.js',
  'application/javascript': '.js', 'text/css': '.css',
}));
const allowed = /^\.(?:jpe?g|png|webp|gif|avif|svg|ico|pdf|woff2?|ttf|otf|glb|gltf|obj|stl|ply|csv|txt|zip|docx?|xlsx?|pptx?|js|mjs|css)$/i;

// Sequential callers stream to disk. Never buffer a whole remote file on the
// 1 GB VPS, send Studio credentials, or let redirects reach private services.
export async function downloadExternalAsset(source, directory, {
  lookup = dnsLookup,
  request = (url, options, callback) =>
    (url.protocol === 'https:' ? httpsRequest : httpRequest)(url, options, callback),
  maxBytes = 128 * 1024 * 1024,
  timeoutMs = 120_000,
} = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let output;
  try {
    const decoded = source.replace(/&amp;/gi, '&');
    let url = new URL(decoded.startsWith('//') ? 'https:' + decoded : decoded);
    for (let redirects = 0; redirects <= 5; redirects++) {
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
          (url.port && url.port !== (url.protocol === 'https:' ? '443' : '80')))
        throw Error('Use a public HTTP(S) asset URL without credentials or a custom port.');
      const host = url.hostname.replace(/^\[|\]$/g, '');
      const records = isIP(host)
        ? [{ address: host, family: isIP(host) }]
        : await Promise.race([
            lookup(host, { all: true, order: 'verbatim' }),
            new Promise((_, reject) => {
              if (controller.signal.aborted) reject(Error('Download timed out.'));
              else controller.signal.addEventListener('abort', () => reject(Error('Download timed out.')), { once: true });
            }),
          ]);
      if (!records.length || records.some(({ address }) => !publicAssetAddress(address)))
        throw Error('The asset address is not a public internet address.');
      const response = await new Promise((resolve, reject) => {
        const req = request(url, {
          signal: controller.signal,
          // Pin DNS results at the socket, preventing DNS rebinding.
          lookup: (_host, options, callback) => options.all
            ? callback(null, records)
            : callback(null, records[0].address, records[0].family),
          headers: { 'user-agent': 'Website-Studio-Export/1.0', accept: '*/*', 'accept-encoding': 'identity' },
        }, resolve);
        req.on('error', reject);
        req.end();
      });
      if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
        response.destroy();
        if (!response.headers.location || redirects === 5)
          throw Error('Too many redirects or a redirect without a destination.');
        url = new URL(response.headers.location, url);
        continue;
      }
      if (response.statusCode !== 200) {
        response.destroy();
        throw Error(`The image/file host returned HTTP ${response.statusCode}.`);
      }
      const type = String(response.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
      const suffix = extensions.get(type) || path.extname(url.pathname).toLowerCase();
      if (/html|xhtml|json/.test(type) && type !== 'model/gltf+json' || !allowed.test(suffix)) {
        response.destroy();
        throw Error('The link did not return a supported static file (it may be a sign-in or error page).');
      }
      if (Number(response.headers['content-length']) > maxBytes) {
        response.destroy();
        throw Error(`Remote file exceeds the ${maxBytes / 1024 / 1024} MiB download limit.`);
      }
      output = path.join(directory, createHash('sha256').update(source).digest('hex').slice(0, 24) + suffix);
      let bytes = 0;
      await pipeline(response, new Transform({
        transform(chunk, _encoding, callback) {
          bytes += chunk.length;
          callback(bytes > maxBytes ? Error('Remote file exceeds the download size limit.') : null, chunk);
        },
      }), createWriteStream(output, { flags: 'wx' }), { signal: controller.signal });
      if (!bytes) throw Error('The host returned an empty file.');
      const info = await stat(output);
      return { file: output, size: info.size, mtimeMs: info.mtimeMs };
    }
  } catch (error) {
    if (output) await rm(output, { force: true }).catch(() => {});
    throw Object.assign(Error(
      `Cannot download external asset ${source}: ${controller.signal.aborted ? 'Download timed out.' : error.message} Upload the original to the Studio media library or replace this URL, then prepare export again.`,
    ), { status: 422 });
  } finally {
    clearTimeout(timer);
  }
}
