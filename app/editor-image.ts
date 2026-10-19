/** Display-only URL. Never write this into page content or publication snapshots. */
export function editorImageURL(src: string, size: 160 | 640 | 1600 = 1600) {
  let reference = src;
  if (/^https?:\/\//i.test(src) && typeof window !== 'undefined') {
    try {
      const url = new URL(src);
      if (url.origin !== window.location.origin) return src;
      reference = url.pathname + url.search;
    } catch {
      return src;
    }
  }
  return /^\/api\/media\/[a-f0-9-]+\.(jpe?g|png|webp)$/i.test(reference)
    ? reference + '?preview=' + size + '&v=2'
    : src;
}
