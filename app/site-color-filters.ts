export const colorModes = [
  { value: 'default', label: 'Original colours' },
  { value: 'high-contrast', label: 'High contrast' },
  { value: 'protanopia', label: 'Red–green assistance · Protan' },
  { value: 'deuteranopia', label: 'Red–green assistance · Deutan' },
  { value: 'tritanopia', label: 'Blue–yellow assistance · Tritan' },
  { value: 'grayscale', label: 'Grayscale' },
] as const;
export type WebsiteColorMode = (typeof colorModes)[number]['value'];
export const isColorMode = (value: unknown): value is WebsiteColorMode =>
  colorModes.some((mode) => mode.value === value);
export const validStrength = (value: unknown): value is number =>
  typeof value === 'number' &&
  Number.isFinite(value) &&
  value >= 0 &&
  value <= 1;

// Machado, Oliveira & Fernandes (2009), doi:10.1109/TVCG.2009.113,
// full-deficiency linear-RGB simulation data (also tabulated by colorspacious):
// https://github.com/njsmith/colorspacious/blob/master/colorspacious/cvd.py
// These are NOT displayed as simulation filters. We redistribute the estimated
// lost signal into the other channels: correction = I + strength * R * (I - S).
// The redistribution weights are a visual-assistance heuristic, not a clinical
// correction. Strength is user preference, not measured deficiency severity.
const simulations = {
  protanopia: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deuteranopia: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritanopia: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
};
export function assistanceMatrix(
  mode: WebsiteColorMode,
  strength: number,
): number[] | null {
  if (!(mode in simulations)) return null;
  const s = simulations[mode as keyof typeof simulations].map((row) => {
    const sum = row.reduce((a, b) => a + b, 0);
    return row.map((v) => v / sum); // Keep neutral greys neutral despite table rounding.
  });
  const missing = mode === 'protanopia' ? 0 : mode === 'deuteranopia' ? 1 : 2;
  const matrix = [];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const identity = Number(row === col);
      const correction =
        row === missing
          ? 0
          : 0.7 * (Number(missing === col) - s[missing][col]) +
            identity -
            s[row][col];
      matrix.push(Number((identity + strength * correction).toFixed(8)));
    }
    matrix.push(0, 0);
  }
  return [...matrix, 0, 0, 0, 1, 0];
}

/** Also serialized into Custom HTML. Keep this function self-contained. */
export function createColorPresentation() {
  const style = document.createElement('style');
  document.head.appendChild(style);
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('data-preserve-colors', '');
  svg.setAttribute('width', '0');
  svg.setAttribute('height', '0');
  svg.style.cssText = 'position:absolute;pointer-events:none;overflow:hidden';
  const defs = document.createElementNS(ns, 'defs'),
    filter = document.createElementNS(ns, 'filter'),
    matrix = document.createElementNS(ns, 'feColorMatrix');
  const id = 'website-color-assist-' + Math.random().toString(36).slice(2);
  filter.id = id;
  filter.setAttribute('color-interpolation-filters', 'linearRGB');
  matrix.setAttribute('type', 'matrix');
  filter.appendChild(matrix);
  defs.appendChild(filter);
  svg.appendChild(defs);
  const mount = () => document.body.appendChild(svg);
  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount, { once: true });
  // Many widgets use CSS background images rather than <img>. Discover these
  // in bounded batches, including images added later; never scan on scroll.
  let enabled = false;
  let scheduled = 0;
  const pending = new Set<Element>();
  const marked = new Set<Element>();
  const inspect = () => {
    scheduled = 0;
    let remaining = 100;
    for (const element of pending) {
      pending.delete(element);
      if (
        element.isConnected &&
        !element.closest('[data-preserve-colors]') &&
        element instanceof HTMLElement
      ) {
        const image = getComputedStyle(element).backgroundImage;
        if (/url\(/i.test(image)) {
          element.setAttribute('data-website-auto-media', '');
          marked.add(element);
        } else if (marked.delete(element))
          element.removeAttribute('data-website-auto-media');
      }
      if (--remaining === 0) break;
    }
    if (pending.size && enabled) scheduled = requestAnimationFrame(inspect);
  };
  const enqueue = (node: Node, descendants = false) => {
    if (
      !(node instanceof Element) ||
      !document.body?.contains(node) ||
      node.closest('[data-preserve-colors]')
    )
      return;
    pending.add(node);
    if (descendants)
      for (const element of node.querySelectorAll('*')) pending.add(element);
    if (!scheduled && enabled) scheduled = requestAnimationFrame(inspect);
  };
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === 'attributes') enqueue(record.target);
      else for (const node of record.addedNodes) enqueue(node, true);
    }
    for (const element of marked)
      if (!element.isConnected) marked.delete(element);
  });
  const watch = () => {
    if (!enabled || !document.body) return;
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['style', 'class'],
    });
    enqueue(document.body, true);
  };
  const unwatch = () => {
    observer.disconnect();
    cancelAnimationFrame(scheduled);
    scheduled = 0;
    pending.clear();
    for (const element of marked)
      element.removeAttribute('data-website-auto-media');
    marked.clear();
  };
  document.addEventListener('DOMContentLoaded', watch, { once: true });
  return {
    apply(state: {
      mode: string;
      strength: number;
      styles: string;
      matrix: number[] | null;
      chartPalette?: { color: string }[];
    }) {
      document.documentElement.dataset.websiteColorMode = state.mode;
      const amount = state.strength;
      let effect = 'none';
      let embeddedEffect = 'none';
      if (state.matrix?.length === 20 && state.matrix.every(Number.isFinite)) {
        matrix.setAttribute('values', state.matrix.join(' '));
        effect = `url("#${id}")`;
      } else if (state.mode === 'high-contrast')
        effect = `contrast(${1 + 0.25 * amount})`;
      else if (state.mode === 'grayscale') effect = `grayscale(${amount})`;
      // Browsers can ignore SVG reference filters on cross-origin player/plugin
      // surfaces. Built-in CSS functions still reach those composited pixels.
      // This is a simpler colour-separation aid, not the matrix correction.
      embeddedEffect = state.matrix
        ? `hue-rotate(${(state.mode === 'protanopia' ? -25 : state.mode === 'deuteranopia' ? 25 : -45) * amount}deg) saturate(${1 + 0.15 * amount})`
        : effect;
      // Set in a stylesheet: default removal restores any authored custom value.
      style.textContent =
        state.styles +
        (state.mode === 'default'
          ? ''
          : `\nhtml{--website-a11y-media-filter:${effect};--website-a11y-embedded-filter:${embeddedEffect};${(state.chartPalette || []).map((item, index) => `--website-chart-series-${index + 1}:${item.color}`).join(';')}}`);
      const active = state.mode !== 'default';
      if (enabled !== active) {
        enabled = active;
        if (active) watch();
        else unwatch();
      }
      document
        .querySelectorAll('[data-website-color-toggle]')
        .forEach((button) =>
          button.setAttribute('aria-pressed', String(state.mode !== 'default')),
        );
      document
        .querySelectorAll('select[data-website-color-mode]')
        .forEach((element) => {
          const select = element as unknown as HTMLSelectElement;
          select.value = state.mode;
        });
      document
        .querySelectorAll<HTMLInputElement>(
          'input[data-website-color-strength]',
        )
        .forEach((input) => {
          input.value = String(Math.round(amount * 100));
          input.disabled = state.mode === 'default';
          input.setAttribute(
            'aria-valuetext',
            Math.round(amount * 100) + ' percent',
          );
        });
      document
        .querySelectorAll('[data-website-color-strength-value]')
        .forEach((output) => {
          output.textContent = Math.round(amount * 100) + '%';
        });
    },
    destroy() {
      enabled = false;
      unwatch();
      document.removeEventListener('DOMContentLoaded', watch);
      document.removeEventListener('DOMContentLoaded', mount);
      style.remove();
      svg.remove();
      delete document.documentElement.dataset.websiteColorMode;
    },
  };
}
