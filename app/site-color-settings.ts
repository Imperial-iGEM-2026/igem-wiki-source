import { colorModes } from './site-color-filters';

export function mountColorSettings(reset: () => void) {
  const host = document.createElement('div');
  host.className = 'website-color-controls';
  host.setAttribute('data-preserve-colors', '');
  host.innerHTML = `<button type="button" class="website-color-launcher" data-website-color-settings aria-haspopup="dialog">◐ Colours</button>
  <dialog aria-label="Colour preferences"><form method="dialog"><strong>Colour preferences</strong><button aria-label="Close colour preferences">✕</button></form>
  <label>Colour assistance<select data-website-color-mode aria-label="Colour assistance">${colorModes.map((m) => `<option value="${m.value}">${m.label}</option>`).join('')}</select></label>
  <label>Filter strength <output data-website-color-strength-value>100%</output><input data-website-color-strength aria-label="Filter strength" type="range" min="0" max="100" step="5" value="100"></label>
  <p>Try the options and choose what looks clearest. These are visual aids, not a medical correction.</p>
  <svg class="website-color-sample" role="img" aria-label="Comparison sample: red, green, blue and yellow" width="320" height="58" viewBox="0 0 320 58"><g fill="#b83c45"><rect width="76" height="30" rx="4"/></g><g fill="#448a4c"><rect x="80" width="76" height="30" rx="4"/></g><g fill="#3e70b8"><rect x="160" width="76" height="30" rx="4"/></g><g fill="#d4ba36"><rect x="240" width="76" height="30" rx="4"/></g><g fill="#172033" font-family="system-ui" font-size="12"><text x="25" y="50">Red</text><text x="100" y="50">Green</text><text x="185" y="50">Blue</text><text x="260" y="50">Yellow</text></g></svg>
  <button type="button" data-color-reset>Reset to original</button></dialog>`;
  const style = document.createElement('style');
  style.textContent = `.website-color-controls{font:15px/1.5 system-ui,sans-serif;color:#172033}.website-color-controls button,.website-color-controls select{font:inherit;color:#172033;background:#fff;border:1px solid #667085;border-radius:8px;padding:8px 12px;cursor:pointer}.website-color-controls .website-color-launcher{position:fixed;left:16px;bottom:16px;z-index:999;box-shadow:0 3px 15px #17203325}.website-color-controls dialog{box-sizing:border-box;width:min(420px,calc(100vw - 24px));max-height:calc(100dvh - 24px);overflow:auto;margin:auto;padding:24px;border:1px solid #667085;border-radius:16px;background:#fff;color:#172033}.website-color-controls dialog::backdrop{background:#17203366}.website-color-controls form{display:flex;align-items:center;justify-content:space-between;gap:16px;margin:0 0 20px}.website-color-controls label{display:block;margin:16px 0}.website-color-controls select,.website-color-controls input{display:block;width:100%;box-sizing:border-box;margin-top:8px}.website-color-controls output{float:right}.website-color-controls p{font-size:13px;color:#475467}.website-color-controls .website-color-sample{max-width:100%;height:auto;filter:var(--website-a11y-media-filter,none)}.website-color-controls :focus-visible{outline:3px solid #9c3f00;outline-offset:3px}`;
  document.head.appendChild(style);
  document.body.appendChild(host);
  const dialog = host.querySelector('dialog')!;
  host.querySelector('[data-color-reset]')!.addEventListener('click', reset);
  return {
    open() {
      if (!dialog.open) dialog.showModal();
      host.querySelector('select')!.focus();
    },
    destroy() {
      dialog.close();
      host.remove();
      style.remove();
    },
  };
}
