/** Store PDF bytes in media storage, never in a custom component's code. */
export function insertHtmlPdf(
  html: string,
  url: string,
  title: string,
  start = html.length,
  end = start,
) {
  if (!/^\/api\/media\/[a-f0-9-]+\.pdf$/i.test(url))
    throw Error('Choose a permanent PDF URL from the Studio media library.');
  const escape = (value: string) =>
    value
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  const tag = `\n<a href="${escape(url)}" data-studio-pdf>${escape(title.trim() || 'Read PDF')}</a>\n`;
  const from = Math.max(0, Math.min(html.length, start));
  const to = Math.max(from, Math.min(html.length, end));
  return {
    html: html.slice(0, from) + tag + html.slice(to),
    cursor: from + tag.length,
  };
}

type Part = { start: number; end: number; url: string };
const dialogs = new WeakMap<HTMLIFrameElement, () => void>();
export function closeHtmlPdf(frame: HTMLIFrameElement) {
  dialogs.get(frame)?.();
}

/** Called only after the parent has validated the sender and user activation. */
export function openHtmlPdf(
  frame: HTMLIFrameElement,
  href: string,
  title: string,
) {
  const url = new URL(href, document.baseURI);
  let catalog: Record<string, Part[]> = {};
  try {
    catalog = JSON.parse(document.body.dataset.customHtmlPdfs || '{}');
  } catch {
    /* No export catalog. */
  }
  const parts = Object.hasOwn(catalog, url.pathname)
    ? catalog[url.pathname]
    : undefined;
  const local =
    url.origin === new URL(document.baseURI).origin &&
    /^\/api\/media\/[a-f0-9-]+\.pdf$/i.test(url.pathname);
  const published =
    url.protocol === 'https:' &&
    /(^|\.)static\.igem\.(wiki|org)$/.test(url.hostname) &&
    /\.pdf$/i.test(url.pathname);
  if (
    !local &&
    !published &&
    !(url.origin === new URL(document.baseURI).origin && parts)
  )
    return false;
  closeHtmlPdf(frame);
  const dialog = document.createElement('dialog');
  dialog.setAttribute('aria-label', title || 'PDF document');
  dialog.style.cssText =
    'width:min(1100px,94vw);max-width:94vw;height:90dvh;max-height:90dvh;padding:0;border:1px solid #cbd5e1;border-radius:12px;background:#fff;color:#172033;box-shadow:0 20px 80px #0005;';
  const host = document.createElement('div');
  host.style.height = '100%';
  dialog.append(host);
  const shell = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent =
    ':host{overflow:hidden}header{height:48px;box-sizing:border-box;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 16px;font:14px system-ui;border-bottom:1px solid #e2e8f0}header span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}button{font:inherit;cursor:pointer;padding:6px 12px;border:1px solid #cbd5e1;border-radius:6px;background:white;color:#172033}.document{height:calc(100% - 48px)}';
  const header = document.createElement('header');
  const label = document.createElement('span');
  label.textContent = title || 'PDF document';
  const close = document.createElement('button');
  close.textContent = 'Close PDF';
  close.type = 'button';
  header.append(label, close);
  const viewer = document.createElement('div');
  viewer.className = 'document';
  viewer.dataset.pdfParts = JSON.stringify(
    parts || [{ start: 1, end: 0, url: url.href }],
  );
  viewer.dataset.pdfAssets =
    (document.body.dataset.siteBase || '/') + 'assets/pdfjs/';
  // The reader uses the iframe's title but removes it before loading any document.
  const metadata = document.createElement('iframe');
  metadata.title = title || 'PDF document';
  metadata.hidden = true;
  viewer.append(metadata);
  shell.append(style, header, viewer);
  let disposed = false;
  let cleanup: (() => void) | undefined;
  const remove = () => {
    if (disposed) return;
    disposed = true;
    cleanup?.();
    dialog.remove();
    dialogs.delete(frame);
    if (frame.isConnected) frame.focus();
  };
  dialogs.set(frame, remove);
  close.onclick = () => dialog.close();
  dialog.addEventListener('close', remove, { once: true });
  document.body.append(dialog);
  dialog.showModal();
  close.focus();
  void import('./pdf-parts-viewer')
    .then(async ({ mountPdfReader }) => {
      if (disposed) return;
      const stop = await mountPdfReader(viewer);
      if (disposed) stop();
      else cleanup = stop;
    })
    .catch(() => {
      if (!disposed)
        viewer.textContent =
          'The PDF reader could not load. Close this window and try again.';
    });
  return true;
}
