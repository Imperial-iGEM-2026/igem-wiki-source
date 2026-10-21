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

/** Also serialized into Custom HTML. Keep this function self-contained. */
export function createColorPresentation(
  options: { root?: HTMLElement; filteredByParent?: boolean } = {},
) {
  const root = options.root || document.documentElement;
  const rootId = 'color-root-' + Math.random().toString(36).slice(2);
  root.setAttribute('data-website-color-root', rootId);
  const selector = '[data-website-color-root="' + rootId + '"]';
  const style = document.createElement('style');
  document.head.appendChild(style);
  return {
    apply(state: {
      mode: string;
      strength: number;
      styles: string;
      chartPalette?: { color: string }[];
    }) {
      root.dataset.websiteColorMode = state.mode;
      const amount = state.strength;
      let effect = 'none';
      if (state.mode === 'grayscale') effect = `grayscale(${amount})`;
      else if (
        ['protanopia', 'deuteranopia', 'tritanopia'].includes(state.mode)
      ) {
        // Native CSS functions compose cross-origin player/frame surfaces too.
        // SVG reference matrices can silently skip those surfaces in Chromium.
        // These adjustable hue shifts are visual preferences, not clinical correction.
        const degrees =
          state.mode === 'protanopia'
            ? -25
            : state.mode === 'deuteranopia'
              ? 25
              : -45;
        effect = `hue-rotate(${degrees * amount}deg) saturate(${1 + 0.15 * amount})`;
      }
      // One compositing filter covers every rendered descendant, including
      // opaque frames and shadow roots. Child widgets receive state, not another filter.
      const pageFiltered =
        state.mode !== 'default' && state.mode !== 'high-contrast';
      const filterCss =
        pageFiltered && !options.filteredByParent
          ? `@layer website-accessibility { ${selector} {filter:${effect}!important;}
           ${selector} :is(dialog:modal,[popover]:popover-open):not(.website-color-controls *) {filter:${effect}!important;}
           ${root !== document.documentElement ? '.website-search-editor dialog,' : ''} .website-color-controls .website-color-sample {filter:${effect}!important;} }`
          : '';
      // Palette redraw is a separate high-contrast author opt-in. Do not change
      // chart data colours and then apply a second whole-page correction.
      style.textContent =
        state.styles +
        filterCss +
        (state.mode === 'high-contrast'
          ? `${selector}{${(state.chartPalette || []).map((item, index) => `--website-chart-series-${index + 1}:${item.color}`).join(';')}}`
          : '');
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
          input.disabled =
            state.mode === 'default' || state.mode === 'high-contrast';
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
      style.remove();
      delete root.dataset.websiteColorMode;
      root.removeAttribute('data-website-color-root');
    },
  };
}
