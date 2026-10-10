export const mediaTypes: Record<string, string> = {
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
export function matchesMedia(ext: string, b: Uint8Array) {
  const s = (a: number, z: number) => new TextDecoder().decode(b.slice(a, z));
  switch (ext) {
    case 'pdf':
      return s(0, 5) === '%PDF-';
    case 'glb':
      return s(0, 4) === 'glTF' && b[4] === 2;
    case 'png':
      return b[0] === 137 && s(1, 4) === 'PNG';
    case 'jpg':
    case 'jpeg':
      return b[0] === 255 && b[1] === 216 && b[2] === 255;
    case 'gif':
      return s(0, 3) === 'GIF';
    case 'webp':
      return s(0, 4) === 'RIFF' && s(8, 12) === 'WEBP';
    case 'mp4':
      return s(4, 8) === 'ftyp';
    case 'webm':
      return b[0] === 26 && b[1] === 69 && b[2] === 223 && b[3] === 163;
    case 'mp3':
      return s(0, 3) === 'ID3' || (b[0] === 255 && (b[1] & 224) === 224);
    case 'wav':
      return s(0, 4) === 'RIFF' && s(8, 12) === 'WAVE';
    case 'ogg':
      return s(0, 4) === 'OggS';
    default:
      return false;
  }
}
