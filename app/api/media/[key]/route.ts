import { env } from 'cloudflare:workers';
import { getEditorUser } from '../../../auth';
export async function GET(
  request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  if (!(await getEditorUser()))
    return new Response('Sign in to view this file.', { status: 401 });
  const { key } = await params;
  if (
    !/^[a-f0-9-]{36}\.(png|jpg|jpeg|webp|gif|mp4|webm|mp3|wav|ogg|pdf|glb)$/.test(
      key,
    )
  )
    return new Response('Not found', { status: 404 });
  try {
    let range: { offset: number; length: number } | undefined;
    const requested = request.headers.get('range');
    if (requested) {
      const metadata = await env.MEDIA.head(key);
      if (!metadata) return new Response('Not found', { status: 404 });
      const invalid = () =>
        new Response(null, {
          status: 416,
          headers: { 'Content-Range': `bytes */${metadata.size}` },
        });
      const match = /^bytes=(\d*)-(\d*)$/.exec(requested);
      if (!match || (!match[1] && !match[2])) return invalid();
      let start: number, end: number;
      if (!match[1]) {
        const count = Number(match[2]);
        if (!Number.isSafeInteger(count) || count <= 0) return invalid();
        start = Math.max(0, metadata.size - count);
        end = metadata.size - 1;
      } else {
        start = Number(match[1]);
        end = match[2]
          ? Math.min(Number(match[2]), metadata.size - 1)
          : metadata.size - 1;
      }
      if (
        !Number.isSafeInteger(start) ||
        !Number.isSafeInteger(end) ||
        start < 0 ||
        start >= metadata.size ||
        end < start
      )
        return invalid();
      range = { offset: start, length: end - start + 1 };
    }
    const object = await env.MEDIA.get(key, range ? { range } : undefined);
    if (!object) return new Response('Not found', { status: 404 });
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('ETag', object.httpEtag);
    headers.set('Accept-Ranges', 'bytes');
    headers.set('Cache-Control', 'private, no-store');
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('Content-Disposition', 'inline');
    if (range) {
      headers.set(
        'Content-Range',
        `bytes ${range.offset}-${range.offset + range.length - 1}/${object.size}`,
      );
      headers.set('Content-Length', String(range.length));
      return new Response(object.body, { status: 206, headers });
    }
    headers.set('Content-Length', String(object.size));
    return new Response(object.body, { headers });
  } catch {
    return new Response('File unavailable', { status: 503 });
  }
}
