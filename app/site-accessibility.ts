import {
  colorModes,
  isColorMode,
  validStrength,
  assistanceMatrix,
  createColorPresentation,
  type WebsiteColorMode,
} from './site-color-filters';
import { mountColorSettings } from './site-color-settings';
export type { WebsiteColorMode } from './site-color-filters';
export const accessiblePalette = {
  background: '#ffffff',
  text: '#172033',
  link: '#0047ab',
  focus: '#9c3f00',
  border: '#667085',
};
// Recolour interface surfaces and enhance media contrast without rewriting files.
// Authors may preserve a colour-critical subtree with data-preserve-colors.
export const accessibilityStyles = `
html[data-website-color-mode]:not([data-website-color-mode="default"]) { color-scheme:light; --website-a11y-background:#fff; --website-a11y-text:#172033; --website-a11y-link:#0047ab; --website-a11y-focus:#9c3f00; }
html[data-website-color-mode]:not([data-website-color-mode="default"]) :where(body,main,header,footer,nav,article,section,aside,div,p,span,h1,h2,h3,h4,h5,h6,table,thead,tbody,tr,td,th,ul,ol,li,form,label,details,summary,dialog,blockquote,pre,code):not([data-preserve-colors],[data-preserve-colors] *) { color:#172033!important; background-color:#fff!important; text-shadow:none!important; }
html[data-website-color-mode]:not([data-website-color-mode="default"]) :where(a,a span):not([data-preserve-colors],[data-preserve-colors] *) { color:#0047ab!important; background-color:#fff!important; text-decoration:underline!important; text-underline-offset:.2em; }
html[data-website-color-mode]:not([data-website-color-mode="default"]) :where(button,input,textarea,select):not([data-preserve-colors],[data-preserve-colors] *) { color:#172033!important; background:#fff!important; border:1px solid #667085!important; }
html[data-website-color-mode]:not([data-website-color-mode="default"]) :where(button[aria-pressed="true"],[aria-selected="true"],a[aria-current="page"]):not([data-preserve-colors],[data-preserve-colors] *) { color:#fff!important; background:#0047ab!important; text-decoration:underline!important; }
html[data-website-color-mode]:not([data-website-color-mode="default"]) :focus-visible { outline:3px solid #9c3f00!important; outline-offset:3px!important; }
html[data-website-color-mode]:not([data-website-color-mode="default"]) ::selection { color:#fff; background:#0047ab; }
/* Filter only the outer media surface. Custom HTML receives these rules inside
   its sandbox; filtering that frame as well would apply the effect twice. */
html[data-website-color-mode]:not([data-website-color-mode="default"]) :where(img,video,canvas,svg,iframe:not(.custom-html-frame),object,embed,.partitioned-pdf,[data-website-media]):not([data-preserve-colors],[data-preserve-colors] *):not(svg *,object *,video *,.partitioned-pdf *,[data-website-media] *) { filter:var(--website-a11y-media-filter,contrast(1.25))!important; }
html[data-website-color-mode]:not([data-website-color-mode="default"]) .partitioned-pdf:not([data-preserve-colors],[data-preserve-colors] *,[data-website-media] *) { --website-a11y-pdf-filter:var(--website-a11y-media-filter,contrast(1.25)); }
html[data-website-color-mode]:not([data-website-color-mode="default"]) :where(video,iframe:not(.custom-html-frame),object,embed):not([data-preserve-colors],[data-preserve-colors] *):not([data-website-media] *,.partitioned-pdf *) { filter:var(--website-a11y-embedded-filter,var(--website-a11y-media-filter))!important; }
`;

type Settings = { mode: WebsiteColorMode; strength: number };
const remembered = new Map<string, Settings>();
export function startWebsiteAccessibility(key: string) {
  let { mode, strength } = remembered.get(key) || {
    mode: 'default' as WebsiteColorMode,
    strength: 1,
  };
  let lastActive: WebsiteColorMode = 'high-contrast';
  const storageKey = 'website-color-mode:' + key;
  try {
    const stored = localStorage.getItem(storageKey);
    if (isColorMode(stored)) mode = stored;
    const raw = localStorage.getItem(storageKey + ':strength');
    if (raw !== null && validStrength(Number(raw))) strength = Number(raw);
    const active = localStorage.getItem(storageKey + ':active');
    if (isColorMode(active) && active !== 'default') lastActive = active;
  } catch {
    /* Opaque preview or disabled storage. */
  }
  if (mode !== 'default') lastActive = mode;
  const presentation = createColorPresentation();
  const frames = () => [
    ...document.querySelectorAll<HTMLIFrameElement>('.custom-html-frame'),
  ];
  const state = (preserve = false) => ({
    mode: preserve ? 'default' : mode,
    strength,
    styles: accessibilityStyles,
    matrix: preserve ? null : assistanceMatrix(mode, strength),
    palette: accessiblePalette,
    modes: colorModes,
  });
  const announce = (frame: HTMLIFrameElement) =>
    frame.contentWindow?.postMessage(
      {
        type: 'website-color-state',
        ...state(Boolean(frame.closest('[data-preserve-colors]'))),
      },
      '*',
    );
  const apply = () => {
    remembered.set(key, { mode, strength });
    presentation.apply(state());
    frames().forEach(announce);
    window.dispatchEvent(
      new CustomEvent('website:colormodechange', {
        detail: { mode, strength, palette: accessiblePalette },
      }),
    );
  };
  const persist = () => {
    try {
      localStorage.setItem(storageKey, mode);
      localStorage.setItem(storageKey + ':strength', String(strength));
      localStorage.setItem(storageKey + ':active', lastActive);
    } catch {
      /* Session memory fallback. */
    }
    apply();
  };
  const controls = mountColorSettings(() => {
    mode = 'default';
    strength = 1;
    lastActive = 'high-contrast';
    persist();
  });
  const api = {
    getColorMode: () => mode,
    getColorStrength: () => strength,
    getColorModes: () => colorModes.map((item) => ({ ...item })),
    setColorMode(next: WebsiteColorMode) {
      if (!isColorMode(next))
        throw Error(
          'Unknown colour mode. Use getColorModes() for supported values.',
        );
      mode = next;
      if (mode !== 'default') lastActive = mode;
      persist();
      return mode;
    },
    setColorStrength(next: number) {
      if (!validStrength(next))
        throw Error('Filter strength must be a finite number from 0 to 1.');
      strength = next;
      persist();
      return strength;
    },
    toggleColorMode: () =>
      api.setColorMode(mode === 'default' ? lastActive : 'default'),
    openSettings: () => controls.open(),
    palette: accessiblePalette,
  };
  const target = window as Window & { websiteAccessibility?: typeof api };
  target.websiteAccessibility = api;
  const click = (event: MouseEvent) => {
    const element = event.target instanceof Element ? event.target : null;
    if (element?.closest('[data-website-color-settings]')) {
      event.preventDefault();
      api.openSettings();
    } else if (element?.closest('[data-website-color-toggle]')) {
      event.preventDefault();
      api.toggleColorMode();
    }
  };
  const change = (event: Event) => {
    if (
      event.target instanceof HTMLSelectElement &&
      event.target.matches('[data-website-color-mode]') &&
      isColorMode(event.target.value)
    )
      api.setColorMode(event.target.value);
  };
  const input = (event: Event) => {
    if (
      event.target instanceof HTMLInputElement &&
      event.target.matches('[data-website-color-strength]') &&
      validStrength(Number(event.target.value) / 100)
    )
      api.setColorStrength(Number(event.target.value) / 100);
  };
  const message = (event: MessageEvent) => {
    if (
      ![
        'website-color-ready',
        'website-color-set',
        'website-color-toggle',
        'website-color-strength',
        'website-color-settings',
      ].includes(event.data?.type)
    )
      return;
    const frame = frames().find(
      (frame) => frame.contentWindow === event.source,
    );
    if (!frame) return;
    if (event.data.type === 'website-color-toggle') api.toggleColorMode();
    else if (event.data.type === 'website-color-settings') api.openSettings();
    else if (
      event.data.type === 'website-color-set' &&
      isColorMode(event.data.mode)
    )
      api.setColorMode(event.data.mode);
    else if (
      event.data.type === 'website-color-strength' &&
      validStrength(event.data.strength)
    )
      api.setColorStrength(event.data.strength);
    else announce(frame);
  };
  document.addEventListener('click', click);
  document.addEventListener('change', change);
  document.addEventListener('input', input);
  window.addEventListener('message', message);
  apply();
  return () => {
    document.removeEventListener('click', click);
    document.removeEventListener('change', change);
    document.removeEventListener('input', input);
    window.removeEventListener('message', message);
    controls.destroy();
    presentation.destroy();
    if (target.websiteAccessibility === api) delete target.websiteAccessibility;
  };
}

/** Serialized into an opaque Custom HTML frame; only its parent can send state. */
export function htmlAccessibilityBridge(
  createPresentation: typeof createColorPresentation,
) {
  let mode = 'default',
    strength = 1;
  const allowed = [
    'default',
    'high-contrast',
    'protanopia',
    'deuteranopia',
    'tritanopia',
    'grayscale',
  ];
  let modes = allowed.map((value) => ({ value, label: value }));
  const presentation = createPresentation();
  const post = (type: string, extra: Record<string, unknown> = {}) =>
    parent.postMessage({ type, ...extra }, '*');
  const api = {
    getColorMode: () => mode,
    getColorStrength: () => strength,
    getColorModes: () => modes.map((item) => ({ ...item })),
    setColorMode(next: string) {
      if (!allowed.includes(next)) throw Error('Unknown colour mode.');
      post('website-color-set', { mode: next });
    },
    setColorStrength(next: number) {
      if (
        typeof next !== 'number' ||
        !Number.isFinite(next) ||
        next < 0 ||
        next > 1
      )
        throw Error('Filter strength must be from 0 to 1.');
      post('website-color-strength', { strength: next });
    },
    toggleColorMode: () => post('website-color-toggle'),
    openSettings: () => post('website-color-settings'),
  };
  (window as Window & { websiteAccessibility?: unknown }).websiteAccessibility =
    api;
  addEventListener('message', (event) => {
    if (
      event.source !== parent ||
      event.data?.type !== 'website-color-state' ||
      !allowed.includes(event.data.mode)
    )
      return;
    mode = event.data.mode;
    strength = event.data.strength ?? 1;
    modes = event.data.modes || modes;
    presentation.apply({ ...event.data, strength });
    dispatchEvent(
      new CustomEvent('website:colormodechange', {
        detail: { mode, strength, palette: event.data.palette },
      }),
    );
  });
  document.addEventListener('click', (event) => {
    const element = event.target instanceof Element ? event.target : null;
    if (element?.closest('[data-website-color-settings]')) {
      event.preventDefault();
      api.openSettings();
    } else if (element?.closest('[data-website-color-toggle]')) {
      event.preventDefault();
      api.toggleColorMode();
    }
  });
  document.addEventListener('change', (event) => {
    if (
      event.target instanceof HTMLSelectElement &&
      event.target.matches('[data-website-color-mode]') &&
      allowed.includes(event.target.value)
    )
      api.setColorMode(event.target.value);
  });
  document.addEventListener('input', (event) => {
    if (
      event.target instanceof HTMLInputElement &&
      event.target.matches('[data-website-color-strength]')
    ) {
      const value = Number(event.target.value) / 100;
      if (Number.isFinite(value) && value >= 0 && value <= 1)
        api.setColorStrength(value);
    }
  });
  post('website-color-ready');
}
