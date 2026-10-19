// Shared by Studio, the live site and the static publisher.
export const defaultLoading = {
  enabled: false,
  frequency: 'session',
  animation: 'pulse',
  image: '',
  message: 'Welcome',
  background: '#ffffff',
  color: '#252535',
  duration: 900,
  timeout: 5000,
  customCss: '',
};

export function validLoading(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const d = { ...defaultLoading, ...value };
  return (
    Object.keys(value).every((key) => Object.hasOwn(defaultLoading, key)) &&
    typeof d.enabled === 'boolean' &&
    ['session', 'first', 'always'].includes(d.frequency) &&
    ['pulse', 'spin', 'dots', 'custom'].includes(d.animation) &&
    typeof d.image === 'string' &&
    d.image.length <= 2048 &&
    (!d.image || /^(?:https:\/\/|\/(?!\/))[^\s<>"']+$/.test(d.image)) &&
    typeof d.message === 'string' &&
    d.message.length <= 160 &&
    /^#[a-f\d]{6}$/i.test(d.background) &&
    /^#[a-f\d]{6}$/i.test(d.color) &&
    Number.isFinite(d.duration) &&
    d.duration >= 0 &&
    d.duration <= 5000 &&
    Number.isFinite(d.timeout) &&
    d.timeout >= Math.max(1000, d.duration) &&
    d.timeout <= 10000 &&
    typeof d.customCss === 'string' &&
    d.customCss.length <= 8000 &&
    // This field animates the supplied mark; assets belong in the image field.
    !/(?:url\s*\(|@import|<\/style)/i.test(d.customCss)
  );
}

// Keep this function self-contained: the exporter writes it to a small classic
// script that runs before page markup, without waiting for the main wiki bundle.
export function startSiteLoading(d, project = 'default', preview = false) {
  if (!d?.enabled || document.querySelector('[data-site-loading]'))
    return () => {};
  const key = 'studio:site-loading:v1:' + project;
  let storage;
  try {
    storage = d.frequency === 'first' ? localStorage : sessionStorage;
    if (!preview && d.frequency !== 'always' && storage.getItem(key))
      return () => {};
  } catch {
    /* Storage may be disabled; the animation must still dismiss. */
  }
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return () => {};
  const host = document.createElement('div');
  host.dataset.siteLoading = '';
  host.setAttribute('role', 'dialog');
  host.setAttribute('aria-modal', 'true');
  host.setAttribute('aria-label', d.message || 'Loading website');
  host.style.cssText =
    'position:fixed!important;inset:0!important;z-index:2147483647!important;display:block!important;';
  const root = host.attachShadow({ mode: 'open' });
  const escape = (text) =>
    String(text).replace(
      /[&<>"']/g,
      (c) =>
        ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;',
        })[c],
    );
  const style = document.createElement('style');
  style.textContent =
    ':host{font:15px system-ui}iframe{display:block;border:0;width:100%;height:100%}button{position:absolute;right:24px;bottom:24px;padding:10px 18px;border:1px solid currentColor;border-radius:8px;font:inherit;background:white;color:#252535;cursor:pointer}button:focus-visible{outline:3px solid #2563eb;outline-offset:4px}';
  const frame = document.createElement('iframe');
  frame.title = d.message || 'Loading website';
  frame.setAttribute('sandbox', '');
  frame.setAttribute('aria-hidden', 'true');
  frame.tabIndex = -1;
  let image = '';
  try {
    if (d.image) image = new URL(d.image, location.href).href;
  } catch {}
  frame.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src https: http: data:; base-uri 'none'; form-action 'none'"><style>
    *{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden}body{display:grid;place-items:center;background:${d.background};color:${d.color};font:16px system-ui}.loader-content{text-align:center;padding:32px}.loader-mark{width:88px;height:88px;margin:auto;display:flex;align-items:center;justify-content:center}.loader-mark img{width:100%;height:100%;object-fit:contain}.loader-symbol{width:56px;height:56px;border:4px solid currentColor;border-radius:50%;border-top-color:transparent}.loader-label{margin-top:24px}.pulse .loader-mark{animation:pulse 1.2s ease-in-out infinite}.spin .loader-mark{animation:spin 1.4s linear infinite}.dots .loader-symbol{width:12px;height:12px;border:0;background:currentColor;box-shadow:-22px 0 currentColor,22px 0 currentColor;animation:pulse 1s ease-in-out infinite}@keyframes pulse{50%{opacity:.35;transform:scale(.85)}}@keyframes spin{to{transform:rotate(360deg)}}
    ${d.animation === 'custom' ? d.customCss : ''}
    @media(prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important}}
    </style></head><body class="${escape(d.animation)}"><div class="loader-content"><div class="loader-mark">${image ? `<img src="${escape(image)}" alt="">` : '<span class="loader-symbol"></span>'}</div><div class="loader-label">${escape(d.message)}</div></div></body></html>`;
  const skip = document.createElement('button');
  skip.textContent = preview ? 'Close preview' : 'Skip animation';
  skip.setAttribute('aria-label', skip.textContent);
  root.append(style, frame, skip);
  document.documentElement.append(host);
  const previousFocus = document.activeElement;
  const previousOverflow = document.documentElement.style.overflow;
  document.documentElement.style.overflow = 'hidden';
  const started = performance.now();
  let minimumTimer,
    closed = false;
  const finish = (seen = true) => {
    if (closed) return;
    closed = true;
    if (seen && !preview && d.frequency !== 'always') {
      try {
        storage?.setItem(key, '1');
      } catch {}
    }
    clearTimeout(minimumTimer);
    clearTimeout(maximumTimer);
    window.removeEventListener('load', ready);
    window.removeEventListener('keydown', keydown, true);
    const hadFocus = document.activeElement === host;
    host.remove();
    document.documentElement.style.overflow = previousOverflow;
    if (hadFocus && previousFocus?.isConnected)
      previousFocus.focus?.({ preventScroll: true });
  };
  const ready = () => {
    minimumTimer = setTimeout(
      finish,
      Math.max(0, d.duration - (performance.now() - started)),
    );
  };
  const keydown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      finish();
    }
    if (event.key === 'Tab') {
      event.preventDefault();
      skip.focus();
    }
  };
  const maximumTimer = setTimeout(finish, d.timeout);
  skip.onclick = () => finish();
  window.addEventListener('keydown', keydown, true);
  skip.focus({ preventScroll: true });
  if (document.readyState === 'complete' || preview) ready();
  else window.addEventListener('load', ready, { once: true });
  return () => finish(false);
}
