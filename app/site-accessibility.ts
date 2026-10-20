export type WebsiteColorMode = 'default' | 'high-contrast';
export const accessiblePalette = {
  background: '#ffffff',
  text: '#172033',
  link: '#0047ab',
  focus: '#9c3f00',
  border: '#667085',
};
// Recolour interface surfaces, not photographs, SVG figures, canvas plots or media.
// Authors may preserve a diagram's entire subtree with data-preserve-colors.
export const accessibilityStyles = `
html[data-website-color-mode="high-contrast"] { color-scheme:light; --website-a11y-background:#fff; --website-a11y-text:#172033; --website-a11y-link:#0047ab; --website-a11y-focus:#9c3f00; }
html[data-website-color-mode="high-contrast"] :where(body,main,header,footer,nav,article,section,aside,div,p,span,h1,h2,h3,h4,h5,h6,table,thead,tbody,tr,td,th,ul,ol,li,form,label,details,summary,dialog,blockquote,pre,code):not([data-preserve-colors],[data-preserve-colors] *) { color:#172033!important; background-color:#fff!important; text-shadow:none!important; }
html[data-website-color-mode="high-contrast"] :where(a,a span):not([data-preserve-colors],[data-preserve-colors] *) { color:#0047ab!important; background-color:#fff!important; text-decoration:underline!important; text-underline-offset:.2em; }
html[data-website-color-mode="high-contrast"] :where(button,input,textarea,select):not([data-preserve-colors],[data-preserve-colors] *) { color:#172033!important; background:#fff!important; border:1px solid #667085!important; }
html[data-website-color-mode="high-contrast"] :where(button[aria-pressed="true"],[aria-selected="true"],a[aria-current="page"]):not([data-preserve-colors],[data-preserve-colors] *) { color:#fff!important; background:#0047ab!important; text-decoration:underline!important; }
html[data-website-color-mode="high-contrast"] :focus-visible { outline:3px solid #9c3f00!important; outline-offset:3px!important; }
html[data-website-color-mode="high-contrast"] ::selection { color:#fff; background:#0047ab; }
`;

const remembered = new Map<string, WebsiteColorMode>();
export function startWebsiteAccessibility(key: string) {
  let mode: WebsiteColorMode = remembered.get(key) || 'default';
  const storageKey = 'website-color-mode:' + key;
  try {
    const stored = localStorage.getItem(storageKey);
    if (stored === 'default' || stored === 'high-contrast') mode = stored;
  } catch {
    /* Opaque preview or disabled storage. */
  }
  const style = document.createElement('style');
  style.textContent = accessibilityStyles;
  document.head.appendChild(style);
  const frames = () => [
    ...document.querySelectorAll<HTMLIFrameElement>('.custom-html-frame'),
  ];
  const announce = (frame: HTMLIFrameElement) =>
    frame.contentWindow?.postMessage(
      {
        type: 'website-color-state',
        mode,
        styles: accessibilityStyles,
        palette: accessiblePalette,
      },
      '*',
    );
  const apply = () => {
    document.documentElement.dataset.websiteColorMode = mode;
    remembered.set(key, mode);
    frames().forEach(announce);
    document
      .querySelectorAll<HTMLElement>('[data-website-color-toggle]')
      .forEach((button) =>
        button.setAttribute('aria-pressed', String(mode === 'high-contrast')),
      );
    window.dispatchEvent(
      new CustomEvent('website:colormodechange', {
        detail: { mode, palette: accessiblePalette },
      }),
    );
  };
  const api = {
    getColorMode: () => mode,
    setColorMode(next: WebsiteColorMode) {
      if (next !== 'default' && next !== 'high-contrast')
        throw Error('Use default or high-contrast.');
      mode = next;
      try {
        localStorage.setItem(storageKey, mode);
      } catch {
        /* Session memory fallback. */
      }
      apply();
      return mode;
    },
    toggleColorMode: () =>
      api.setColorMode(mode === 'default' ? 'high-contrast' : 'default'),
    palette: accessiblePalette,
  };
  const target = window as Window & { websiteAccessibility?: typeof api };
  target.websiteAccessibility = api;
  const click = (event: MouseEvent) => {
    const button =
      event.target instanceof Element
        ? event.target.closest('[data-website-color-toggle]')
        : null;
    if (button) {
      event.preventDefault();
      api.toggleColorMode();
    }
  };
  const message = (event: MessageEvent) => {
    if (
      ![
        'website-color-ready',
        'website-color-set',
        'website-color-toggle',
      ].includes(event.data?.type)
    )
      return;
    const frame = frames().find(
      (frame) => frame.contentWindow === event.source,
    );
    if (!frame) return;
    if (event.data.type === 'website-color-toggle') api.toggleColorMode();
    else if (
      event.data.type === 'website-color-set' &&
      ['default', 'high-contrast'].includes(event.data.mode)
    )
      api.setColorMode(event.data.mode);
    else announce(frame);
  };
  document.addEventListener('click', click);
  window.addEventListener('message', message);
  apply();
  return () => {
    document.removeEventListener('click', click);
    window.removeEventListener('message', message);
    style.remove();
    if (target.websiteAccessibility === api) {
      delete target.websiteAccessibility;
      delete document.documentElement.dataset.websiteColorMode;
    }
  };
}

/** Serialized into an opaque Custom HTML frame; only its parent can send state. */
export function htmlAccessibilityBridge() {
  let mode = 'default';
  const style = document.createElement('style');
  document.head.appendChild(style);
  const target = window as Window & { websiteAccessibility?: unknown };
  target.websiteAccessibility = {
    getColorMode: () => mode,
    setColorMode(next: string) {
      if (next !== 'default' && next !== 'high-contrast')
        throw Error('Use default or high-contrast.');
      parent.postMessage({ type: 'website-color-set', mode: next }, '*');
    },
    toggleColorMode: () =>
      parent.postMessage({ type: 'website-color-toggle' }, '*'),
  };
  addEventListener('message', (event) => {
    if (
      event.source !== parent ||
      event.data?.type !== 'website-color-state' ||
      !['default', 'high-contrast'].includes(event.data.mode)
    )
      return;
    mode = event.data.mode;
    style.textContent = event.data.styles;
    document.documentElement.dataset.websiteColorMode = mode;
    document
      .querySelectorAll('[data-website-color-toggle]')
      .forEach((button) =>
        button.setAttribute('aria-pressed', String(mode === 'high-contrast')),
      );
    dispatchEvent(
      new CustomEvent('website:colormodechange', {
        detail: { mode, palette: event.data.palette },
      }),
    );
  });
  document.addEventListener('click', (event) => {
    if (
      event.target instanceof Element &&
      event.target.closest('[data-website-color-toggle]')
    ) {
      event.preventDefault();
      parent.postMessage({ type: 'website-color-toggle' }, '*');
    }
  });
  parent.postMessage({ type: 'website-color-ready' }, '*');
}
