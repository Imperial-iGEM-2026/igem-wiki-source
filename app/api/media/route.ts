import { env } from 'cloudflare:workers';
import { getEditorUser } from '../../auth';
const types: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  pdf: 'application/pdf',
  glb: 'model/gltf-binary',
};
function matches(ext: string, b: Uint8Array) {
  const s = (a: number, z: number) => new TextDecoder().decode(b.slice(a, z));
  if (ext === 'pdf') return s(0, 5) === '%PDF-';
  if (ext === 'glb') return s(0, 4) === 'glTF' && b[4] === 2;
  if (ext === 'png') return b[0] === 137 && s(1, 4) === 'PNG';
  if (ext === 'jpg' || ext === 'jpeg')
    return b[0] === 255 && b[1] === 216 && b[2] === 255;
  if (ext === 'gif') return s(0, 3) === 'GIF';
  if (ext === 'webp') return s(0, 4) === 'RIFF' && s(8, 12) === 'WEBP';
  if (ext === 'mp4') return s(4, 8) === 'ftyp';
  if (ext === 'webm')
    return b[0] === 26 && b[1] === 69 && b[2] === 223 && b[3] === 163;
  if (ext === 'mp3')
    return s(0, 3) === 'ID3' || (b[0] === 255 && (b[1] & 224) === 224);
  if (ext === 'wav') return s(0, 4) === 'RIFF' && s(8, 12) === 'WAVE';
  if (ext === 'ogg') return s(0, 4) === 'OggS';
  return false;
}
export async function POST(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin)
    return Response.json({ error: 'Invalid origin' }, { status: 403 });
  const user = await getEditorUser();
  if (!user)
    return Response.json(
      { error: 'Sign in to upload media.' },
      { status: 401 },
    );
  const name = (new URL(request.url).searchParams.get('name') || '').slice(
    0,
    180,
  );
  const ext = name.split('.').pop()?.toLowerCase() || '';
  const size = Number(request.headers.get('content-length'));
  if (!types[ext])
    return Response.json(
      { error: 'Supported files: images, MP4/WebM, MP3/WAV/OGG, PDF, or GLB.' },
      { status: 400 },
    );
  if (
    !Number.isSafeInteger(size) ||
    size < 16 ||
    size > 25 * 1024 * 1024 ||
    !request.body
  )
    return Response.json(
      {
        error:
          'Upload a file between 16 bytes and 25 MB. For larger media, use a hosted HTTPS link.',
      },
      { status: 413 },
    );
  if (!env.MEDIA)
    return Response.json(
      { error: 'Media storage is not available yet.' },
      { status: 503 },
    );
  const reader = request.body.getReader();
  const first = await reader.read();
  if (!first.value || !matches(ext, first.value)) {
    await reader.cancel();
    return Response.json(
      { error: 'The file contents do not match its supported extension.' },
      { status: 400 },
    );
  }
  const key = crypto.randomUUID() + '.' + ext;
  const { readable, writable } = new FixedLengthStream(size);
  const writer = writable.getWriter();
  const pump = (async () => {
    let total = 0;
    try {
      let chunk = first;
      while (!chunk.done) {
        total += chunk.value.byteLength;
        if (total > size) throw Error('File too large');
        await writer.write(chunk.value);
        chunk = await reader.read();
      }
      if (total !== size) throw Error('Incomplete upload');
      await writer.close();
    } catch (e) {
      await writer.abort(e);
      throw e;
    }
  })();
  try {
    await Promise.all([
      pump,
      env.MEDIA.put(key, readable, {
        httpMetadata: { contentType: types[ext] },
        customMetadata: { name, author: user.userId },
      }),
    ]);
    return Response.json({
      url: '/api/media/' + key,
      name,
      type: types[ext],
      size,
    });
  } catch {
    await env.MEDIA.delete(key).catch(() => {});
    return Response.json(
      { error: 'Upload did not finish. Please retry.' },
      { status: 503 },
    );
  }
}
