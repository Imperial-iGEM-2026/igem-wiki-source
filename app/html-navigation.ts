import { openHtmlPdf } from './html-pdf';
/** Only ordinary hyperlinks can cross the opaque custom HTML boundary. */
export function htmlLinkDestination(
  href: unknown,
  base: string,
  routes: Record<string, string> = {},
) {
  if (typeof href !== 'string' || !href.trim() || href.length > 8192)
    return null;
  try {
    const url = new URL(href, base);
    if (
      !['https:', 'http:', 'mailto:', 'tel:'].includes(url.protocol) ||
      url.username ||
      url.password
    )
      return null;
    if (url.origin === new URL(base).origin) {
      const path = url.pathname.replace(/\/$/, '') || '/';
      return (
        (Object.hasOwn(routes, path) ? routes[path] : url.pathname) +
        url.search +
        url.hash
      );
    }
    return url.href;
  } catch {
    return null;
  }
}

export function followHtmlLink(
  event: MessageEvent,
  frame: HTMLIFrameElement,
  notify?: (message: string) => void,
  routes: Record<string, string> = {},
) {
  if (
    event.source !== frame.contentWindow ||
    event.data?.type !== 'custom-html-link'
  )
    return;
  // A genuine click/keyboard activation in a child activates its ancestors.
  // Ignore messages without user activation, and from unrelated frames.
  if (!navigator.userActivation?.isActive) return;
  const href = htmlLinkDestination(event.data.href, document.baseURI, routes);
  if (!href) return;
  if (frame.closest('.studio-canvas,[data-editor-viewport]')) {
    notify?.(
      'Open Preview to follow this link. Your editor stays on this page.',
    );
    return;
  }
  if (
    event.data.newTab !== true &&
    openHtmlPdf(
      frame,
      href,
      typeof event.data.title === 'string'
        ? event.data.title.slice(0, 200)
        : 'PDF document',
    )
  )
    return;
  const link = document.createElement('a');
  link.href = href;
  if (event.data.newTab === true) link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.hidden = true;
  // Insert beside the frame so existing preview/router click handlers receive
  // the event and preserve project context, instead of replacing the Studio tab.
  frame.parentElement?.appendChild(link);
  link.click();
  link.remove();
}
