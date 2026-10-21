import { colorModes } from './site-color-filters';

export function mountColorSettings(
  reset: () => void,
  root: HTMLElement = document.documentElement,
  showLauncher = false,
) {
  const editor = root !== document.documentElement;
  const host = document.createElement('div');
  host.className = 'website-color-controls';
  host.setAttribute('data-preserve-colors', '');
  host.innerHTML = `<button type="button" class="website-color-launcher" data-website-color-settings aria-haspopup="dialog">◐ Colours</button>
  <dialog aria-label="Colour preferences"><div class="website-color-heading"><strong>Colour preferences</strong><button type="button" aria-label="Close colour preferences">✕</button></div>
  <label>Colour assistance<select data-website-color-mode aria-label="Colour assistance"><option value="default">Original colours</option><optgroup label="Theme"><option value="high-contrast">High contrast</option></optgroup><optgroup label="Whole-page filters">${colorModes
    .filter((m) => !['default', 'high-contrast'].includes(m.value))
    .map((m) => `<option value="${m.value}">${m.label}</option>`)
    .join('')}</optgroup></select></label>
  <label>Filter strength <output data-website-color-strength-value>100%</output><input data-website-color-strength aria-label="Filter strength" type="range" min="0" max="100" step="5" value="100"></label>
  <p>Colour filters affect the whole website. High contrast is a separate text and controls theme. Choose what looks clearest; these are visual aids, not a medical correction.</p>
  <svg class="website-color-sample" role="img" aria-label="Comparison sample: red, green, blue and yellow" width="320" height="58" viewBox="0 0 320 58"><g fill="#b83c45"><rect width="76" height="30" rx="4"/></g><g fill="#448a4c"><rect x="80" width="76" height="30" rx="4"/></g><g fill="#3e70b8"><rect x="160" width="76" height="30" rx="4"/></g><g fill="#d4ba36"><rect x="240" width="76" height="30" rx="4"/></g><g fill="#172033" font-family="system-ui" font-size="12"><text x="25" y="50">Red</text><text x="100" y="50">Green</text><text x="185" y="50">Blue</text><text x="260" y="50">Yellow</text></g></svg>
  <button type="button" data-color-reset>Reset to original</button></dialog>`;
  (host.querySelector('.website-color-launcher') as HTMLButtonElement).hidden = !showLauncher;
  const style = document.createElement('style');
  style.textContent = `.website-color-controls .website-color-launcher[hidden]{display:none!important}.website-color-controls{font:15px/1.5 system-ui,sans-serif;color:#172033}.website-color-controls button,.website-color-controls select{font:inherit;color:#172033;background:#fff;border:1px solid #667085;border-radius:8px;padding:8px 12px;cursor:pointer}.website-color-controls .website-color-launcher{position:fixed;left:16px;bottom:16px;z-index:999;box-shadow:0 3px 15px #17203325}.website-color-controls dialog{box-sizing:border-box;width:min(420px,calc(100vw - 24px));max-height:calc(100dvh - 24px);overflow:auto;margin:auto;padding:24px;border:1px solid #667085;border-radius:16px;background:#fff;color:#172033}.website-color-controls dialog::backdrop{background:#17203366}.website-color-controls .website-color-heading{display:flex;align-items:center;justify-content:space-between;gap:16px;margin:0 0 20px}.website-color-controls label{display:block;margin:16px 0}.website-color-controls select,.website-color-controls input{display:block;width:100%;box-sizing:border-box;margin-top:8px}.website-color-controls output{float:right}.website-color-controls p{font-size:13px;color:#475467}.website-color-controls .website-color-sample{max-width:100%;height:auto}.website-color-controls :focus-visible{outline:3px solid #9c3f00;outline-offset:3px}`;
  style.textContent += `.website-color-controls[data-editor-colours]{display:none;position:fixed;z-index:1000;background:#17203366;overflow:auto;align-items:center;justify-content:center}.website-color-controls[data-editor-colours][data-open]{display:flex}.website-color-controls[data-editor-colours] .website-color-launcher{display:none}.website-color-controls[data-editor-colours] dialog{position:relative;inset:auto;width:min(420px,calc(100% - 24px));max-height:calc(100% - 24px);margin:12px}`;
  if (editor) {
    host.setAttribute('data-editor-colours', '');
    host.setAttribute('data-studio-runtime-control', '');
  }
  document.head.appendChild(style);
  document.body.appendChild(host);
  const dialog = host.querySelector('dialog')!;
  let opener: HTMLElement | null = null;
  let stopPositioning = () => {};
  const close = () => {
    dialog.close();
    host.removeAttribute('data-open');
    stopPositioning();
    stopPositioning = () => {};
  };
  host.addEventListener('click', (event) => {
    if (editor && event.target === host) close();
  });
  dialog.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  });
  host
    .querySelector('[aria-label="Close colour preferences"]')!
    .addEventListener('click', close);
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    close();
  });
  dialog.addEventListener('close', () => {
    if (opener?.isConnected) opener.focus({ preventScroll: true });
  });
  // Only close when both ends of a click are on the backdrop, not when a
  // slider drag starts inside the panel and ends outside it.
  const outside = (event: PointerEvent | MouseEvent) => {
    const rect = dialog.getBoundingClientRect();
    return (
      event.target === dialog &&
      (event.clientX < rect.left ||
        event.clientX > rect.right ||
        event.clientY < rect.top ||
        event.clientY > rect.bottom)
    );
  };
  let backdropDown = false;
  dialog.addEventListener('pointerdown', (event) => {
    backdropDown = outside(event);
  });
  dialog.addEventListener('click', (event) => {
    if (backdropDown && outside(event)) close();
    backdropDown = false;
  });
  host.querySelector('[data-color-reset]')!.addEventListener('click', reset);
  return {
    open() {
      if (!dialog.open) {
        opener =
          document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null;
        if (!editor) dialog.showModal();
        else {
          const stage = root.closest<HTMLElement>('.studio-stage') || root;
          const position = () => {
            const a = root.getBoundingClientRect(),
              b = stage.getBoundingClientRect();
            const left = Math.max(0, a.left, b.left),
              top = Math.max(0, a.top, b.top);
            const right = Math.min(innerWidth, a.right, b.right),
              bottom = Math.min(innerHeight, a.bottom, b.bottom);
            if (right <= left || bottom <= top) {
              close();
              return false;
            }
            Object.assign(host.style, {
              left: left + 'px',
              top: top + 'px',
              width: right - left + 'px',
              height: bottom - top + 'px',
            });
            return true;
          };
          if (!position()) return;
          host.setAttribute('data-open', '');
          dialog.show();
          const observer = new ResizeObserver(position);
          observer.observe(root);
          observer.observe(stage);
          window.addEventListener('resize', position);
          window.addEventListener('scroll', position, true);
          stopPositioning = () => {
            observer.disconnect();
            window.removeEventListener('resize', position);
            window.removeEventListener('scroll', position, true);
          };
        }
      }
      host.querySelector('select')!.focus();
    },
    destroy() {
      close();
      host.remove();
      style.remove();
    },
  };
}
