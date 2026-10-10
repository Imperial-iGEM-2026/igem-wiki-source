import { createServer } from 'node:http';
import { stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
const args = process.argv.slice(2),
  arg = (name, fallback) =>
    args.includes('--' + name) ? args[args.indexOf('--' + name) + 1] : fallback;
const root = path.resolve(arg('dir', './wiki-export'), 'public'),
  base = arg('base', '/'),
  port = Number(arg('port', '4173'));
const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.glb': 'model/gltf-binary',
};
createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(
      new URL(req.url, 'http://localhost').pathname,
    );
    if (!pathname.startsWith(base)) {
      res.writeHead(302, { Location: base });
      return res.end();
    }
    let file = path.resolve(root, pathname.slice(base.length));
    if (file !== root && !file.startsWith(root + path.sep)) throw Error();
    if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html');
    const meta = await stat(file);
    let start = 0,
      end = meta.size - 1;
    if (req.headers.range) {
      const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
      if (!m || (!m[1] && !m[2])) {
        res.writeHead(416);
        return res.end();
      }
      start = m[1] ? Number(m[1]) : Math.max(0, meta.size - Number(m[2]));
      end = m[1] ? (m[2] ? Math.min(end, Number(m[2])) : end) : end;
      if (start > end || start >= meta.size) {
        res.writeHead(416);
        return res.end();
      }
    }
    res.writeHead(req.headers.range ? 206 : 200, {
      'Content-Type': types[path.extname(file)] || 'application/octet-stream',
      'Content-Length': end - start + 1,
      'Accept-Ranges': 'bytes',
      ...(req.headers.range
        ? { 'Content-Range': `bytes ${start}-${end}/${meta.size}` }
        : {}),
    });
    if (req.method === 'HEAD') res.end();
    else createReadStream(file, { start, end }).pipe(res);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
}).listen(port, '127.0.0.1', () =>
  console.log(`Preview: http://127.0.0.1:${port}${base}`),
);
