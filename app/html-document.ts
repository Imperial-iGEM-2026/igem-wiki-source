import { htmlSearchBridge } from './html-search';
import type { CanvasNode } from './canvas-schema';
import { htmlVisibilityBridge } from './html-visibility';
import { htmlImageBridge } from './html-image';
import { htmlAccessibilityBridge } from './site-accessibility';

export const htmlExample = {
  html: '<button class="orbit" aria-label="Change animation speed"><span></span><span></span><span></span></button>\n<p>Click to change the rhythm</p>',
  css: `body { display:grid; place-content:center; gap:24px; text-align:center; color:#475569; font-family:system-ui,sans-serif; }
.orbit { display:flex; justify-content:center; gap:16px; padding:24px; border:0; background:transparent; cursor:pointer; }
.orbit span { width:24px; height:24px; background:#3478f6; border-radius:50%; animation:float 1.6s ease-in-out infinite alternate; }
.orbit span:nth-child(2) { animation-delay:.2s; background:#f59e0b; }
.orbit span:nth-child(3) { animation-delay:.4s; background:#e879a0; }
.orbit.fast span { animation-duration:.5s; }
@keyframes float { to { transform:translateY(-24px); } }
@media (prefers-reduced-motion:reduce) { .orbit span { animation:none; } }`,
  javascript:
    "document.querySelector('.orbit').addEventListener('click', event => {\n  event.currentTarget.classList.toggle('fast');\n});",
};

// The parent handles only validated navigation requests from this exact frame.
// Keep navigation out of the sandbox permissions: custom scripts stay isolated.
const linkBridge = `document.addEventListener('click',function(e){
 if(!e.isTrusted||e.defaultPrevented||e.button!==0)return;
 var a=e.target.closest&&e.target.closest('a[href]');if(!a)return;
 var href=a.getAttribute('href');if(!href)return;
 if(href.charAt(0)==='#'){
  var id;try{id=decodeURIComponent(href.slice(1))}catch{return}
  var local=document.getElementById(id)||document.getElementsByName(id)[0];
  if(local){e.preventDefault();local.scrollIntoView();return}
 }
 if(!/^(https?:|mailto:|tel:)/i.test(href)&&/^[a-z][a-z0-9+.-]*:/i.test(href)){e.preventDefault();return}
 e.preventDefault();parent.postMessage({type:'custom-html-link',href:href,title:a.textContent,newTab:a.target==='_blank'||e.ctrlKey||e.metaKey||e.shiftKey},'*');
});`;

/** Serialized before custom scripts, only in Design. Let widgets take their
 * authored reduced-motion branch instead of waiting for scroll reveals.
 * Never force opacity/display: intentionally hidden controls must stay hidden. */
function htmlDesignBridge() {
  document.documentElement.setAttribute('data-studio-design', '');
  const matchMedia = window.matchMedia.bind(window);
  window.matchMedia = (query) =>
    matchMedia(
      query
        .replace(
          /\(prefers-reduced-motion\s*:\s*no-preference\)/gi,
          '(width < 0px)',
        )
        .replace(
          /\(prefers-reduced-motion(?:\s*:\s*reduce)?\)/gi,
          '(min-width: 0px)',
        ),
    );
  const style = document.createElement('style');
  style.textContent =
    'html[data-studio-design],html[data-studio-design]::before,html[data-studio-design]::after,html[data-studio-design] *,html[data-studio-design] *::before,html[data-studio-design] *::after{' +
    'transition-duration:0s!important;transition-delay:0s!important;' +
    'animation-duration:0s!important;animation-delay:0s!important;animation-iteration-count:1!important;animation-fill-mode:both!important;animation-timeline:auto!important;animation-range:normal!important}';
  document.head.appendChild(style);
}

/** This document is only mounted in an opaque-origin sandbox, never in the page DOM. */
export function htmlDocument(
  node: Pick<CanvasNode, 'html' | 'css' | 'javascript'>,
) {
  const css = (node.css || '').replace(/<\/style/gi, '<\\/style');
  const js = (node.javascript || '').replace(/<\/script/gi, '<\\/script');
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src https: data:; media-src https: data:; font-src data:; connect-src 'none'; frame-src https://video.igem.org/videos/embed/ https://www.youtube.com/embed/ https://www.youtube-nocookie.com/embed/ https://player.vimeo.com/video/; object-src 'none'; base-uri https: http:; form-action 'none'"><style>html,body{margin:0;min-height:100%;}html{height:100%;}body{box-sizing:border-box;min-height:100vh;}*,*::before,*::after{box-sizing:border-box;}img,svg{max-width:100%;}${css}</style><script>${linkBridge}addEventListener('error',function(e){parent.postMessage({type:'custom-html-error',message:String(e.message).slice(0,500)},'*')});addEventListener('unhandledrejection',function(e){parent.postMessage({type:'custom-html-error',message:String(e.reason).slice(0,500)},'*')});</script></head><body>${node.html || ''}<script>${js}</script></body></html>`;
}

/** A data document keeps its unique opaque origin even with allow-same-origin.
 * This lets nested HTTPS players retain their own origins without granting
 * custom code access to the editor. Never substitute srcdoc or a blob URL.
 */
function htmlFrameDocument(
  source: string,
  pageURL: string,
  images: Record<string, string> = {},
  design = false,
) {
  const url = new URL(pageURL);
  // Relative assets need the path, never private preview keys or credentials.
  url.search = url.hash = url.username = url.password = '';
  const base = ['https:', 'http:'].includes(url.protocol)
    ? `<base href="${url.href.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')}">`
    : '';
  // Local development can load same-origin uploads without permitting arbitrary HTTP images.
  const content =
    url.protocol === 'http:'
      ? source.replace(
          'img-src https: data:;',
          `img-src https: data: ${url.origin};`,
        )
      : source;
  return content
    .replace('<style>', base + '<style>')
    .replace(
      '<script>',
      `<script>(${htmlVisibilityBridge.toString()})();(${htmlAccessibilityBridge.toString()})();(${htmlSearchBridge.toString()})();${design ? '(' + htmlDesignBridge.toString() + ')();' : ''}${Object.keys(images).length ? '(' + htmlImageBridge.toString() + ')(' + JSON.stringify(images).replace(/</g, '\\u003c') + ');' : ''}</script><script>`,
    );
}

export function htmlFrameURL(
  source: string,
  pageURL: string,
  images: Record<string, string> = {},
) {
  return (
    'data:text/html;charset=utf-8,' +
    encodeURIComponent(htmlFrameDocument(source, pageURL, images))
  );
}

/** Runs in a tiny opaque data document. Image-rich HTML travels as a message,
 * not a navigation URL, which Chromium can silently refuse when oversized. */
function htmlDocumentReceiver(token: string) {
  const receive = (event: MessageEvent) => {
    if (
      event.source !== parent ||
      event.data?.type !== 'custom-html-document' ||
      event.data.token !== token ||
      typeof event.data.html !== 'string'
    )
      return;
    window.removeEventListener('message', receive);
    document.open();
    // Parse the complete document (CSP before scripts) in this disposable opaque
    // frame. innerHTML would not execute its scripts; srcdoc/blob changes origin.
    // oxlint-disable-next-line typescript/no-deprecated -- Deliberate one-use sandbox document initialization.
    document.write(event.data.html);
    document.close();
  };
  window.addEventListener('message', receive);
  parent.postMessage({ type: 'custom-html-document-ready', token }, '*');
}

const pendingDocuments = new WeakMap<HTMLIFrameElement, () => void>();
export function loadHtmlFrame(
  frame: HTMLIFrameElement,
  source: string,
  pageURL: string,
  images: Record<string, string> = {},
  design = false,
) {
  pendingDocuments.get(frame)?.();
  const html = htmlFrameDocument(source, pageURL, images, design);
  if (html.length <= 128 * 1024) {
    frame.src = 'data:text/html;charset=utf-8,' + encodeURIComponent(html);
    return () => {};
  }
  const token = crypto.randomUUID();
  const stop = () => {
    window.removeEventListener('message', ready);
    if (pendingDocuments.get(frame) === stop) pendingDocuments.delete(frame);
  };
  const ready = (event: MessageEvent) => {
    if (
      event.source !== frame.contentWindow ||
      event.data?.type !== 'custom-html-document-ready' ||
      event.data.token !== token
    )
      return;
    stop();
    frame.contentWindow?.postMessage(
      { type: 'custom-html-document', token, html },
      '*',
    );
  };
  window.addEventListener('message', ready);
  pendingDocuments.set(frame, stop);
  // Only this fixed bootstrap runs before the supplied document's CSP is parsed.
  // Never use srcdoc/blob: allow-same-origin must retain a unique opaque origin.
  frame.src =
    'data:text/html;charset=utf-8,' +
    encodeURIComponent(
      '<!doctype html><meta charset="utf-8"><script>(' +
        htmlDocumentReceiver.toString() +
        ')(' +
        JSON.stringify(token) +
        ')</script>',
    );
  return stop;
}
