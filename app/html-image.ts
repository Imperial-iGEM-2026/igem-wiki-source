/** Images stay in media storage; only a short permanent URL goes into the code. */
export function insertHtmlImage(
  html: string,
  url: string,
  alt: string,
  start = html.length,
  end = start,
) {
  if (
    !/^\/api\/media\/[a-f0-9-]+\.[a-z0-9]+$/i.test(url) &&
    !/^https:\/\//i.test(url)
  )
    throw Error('The upload did not return a permanent image URL.');
  const escape = (value: string) =>
    value
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  const tag = `<img src="${escape(url)}" alt="${escape(alt)}" loading="lazy" decoding="async" style="max-width:100%;height:auto" />`;
  const from = Math.max(0, Math.min(html.length, start));
  const to = Math.max(from, Math.min(html.length, end));
  const inserted = `\n${tag}\n`;
  return {
    html: html.slice(0, from) + inserted + html.slice(to),
    cursor: from + inserted.length,
  };
}

/** Only the current site's uploaded images need authenticated preview resolution. */
export function localHtmlImages(source: string, pageURL: string) {
  const base = new URL(pageURL);
  const images = new Map<string, string>();
  for (const [reference] of source.matchAll(
    /(?:https?:\/\/[^\s"'<>\\)]+)?\/api\/media\/[a-f0-9-]+\.(?:jpe?g|png|webp|gif|avif|svg|ico)\b/gi,
  )) {
    const url = new URL(reference, base);
    if (url.origin === base.origin)
      images.set(reference, url.origin + url.pathname);
  }
  return images;
}
