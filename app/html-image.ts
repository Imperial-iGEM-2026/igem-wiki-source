import { dynamicHtmlImages } from '../scripts/export-media.mjs';
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
  for (const reference of dynamicHtmlImages(source))
    images.set(reference, new URL(reference, base).href);
  for (const [reference] of source.matchAll(
    /(?:https?:\/\/[^\s"'<>\\)]+)?\/api\/media\/[a-f0-9-]+\.(?:jpe?g|png|webp|gif|avif|svg|ico)\b(?:[?#][^\s"'<>\\)`]*)?/gi,
  )) {
    const url = new URL(reference, base);
    if (url.origin === base.origin)
      images.set(reference, url.origin + url.pathname);
  }
  return images;
}

/** Runs inside the opaque frame. Only already-resolved image references are
 * substituted; this grants no fetch, cookie or parent-document access. */
export function htmlImageBridge(images: Record<string, string>) {
  const resolve = (source: string) => {
    if (source.startsWith('data:') || source.startsWith('blob:')) return source;
    if (Object.hasOwn(images, source)) return images[source];
    try {
      const url = new URL(source, document.baseURI);
      if (
        url.origin === new URL(document.baseURI).origin &&
        Object.hasOwn(images, url.pathname)
      )
        return images[url.pathname];
    } catch {}
    return source;
  };
  const rewrite = (element: Element, attribute?: string) => {
    if ((!attribute || attribute === 'src') && element.matches('img')) {
      const source = element.getAttribute('src');
      if (source && resolve(source) !== source)
        element.setAttribute('src', resolve(source));
    }
    if (
      (!attribute || attribute === 'srcset') &&
      element.matches('img,source') &&
      element.hasAttribute('srcset')
    ) {
      const source = element.getAttribute('srcset')!;
      const next = source.replace(
        /(?:https?:\/\/[^\s,]+)?\/api\/media\/[a-f0-9-]+\.[a-z0-9]+(?:[?#][^\s,]*)?/gi,
        resolve,
      );
      if (next !== source) element.setAttribute('srcset', next);
    }
    const style =
      !attribute || attribute === 'style'
        ? element.getAttribute('style')
        : null;
    if (style?.includes('/api/media/')) {
      const next = style.replace(
        /url\(\s*(["']?)([^)"']+)\1\s*\)/gi,
        (all, _quote, source) => {
          const mapped = resolve(source.trim());
          return mapped === source.trim() ? all : `url("${mapped}")`;
        },
      );
      if (next !== style) element.setAttribute('style', next);
    }
  };
  const scan = (node: Node) => {
    if (node instanceof Element) rewrite(node);
    if (node instanceof Element || node instanceof Document)
      node
        .querySelectorAll('img,source,[style]')
        .forEach((element) => rewrite(element));
  };
  new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === 'attributes')
        rewrite(record.target as Element, record.attributeName || undefined);
      else record.addedNodes.forEach(scan);
    }
  }).observe(document, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['src', 'srcset', 'style'],
  });
  scan(document);
}
