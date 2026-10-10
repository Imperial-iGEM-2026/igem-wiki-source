import type { CanvasNode } from './canvas-schema';

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

/** This document is only mounted in an opaque-origin sandbox, never in the page DOM. */
export function htmlDocument(
  node: Pick<CanvasNode, 'html' | 'css' | 'javascript'>,
) {
  const css = (node.css || '').replace(/<\/style/gi, '<\\/style');
  const js = (node.javascript || '').replace(/<\/script/gi, '<\\/script');
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src https: data:; media-src https: data:; font-src data:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"><style>html,body{margin:0;min-height:100%;}html{height:100%;}body{box-sizing:border-box;min-height:100vh;}*,*::before,*::after{box-sizing:border-box;}img,svg{max-width:100%;}${css}</style><script>addEventListener('error',function(e){parent.postMessage({type:'custom-html-error',message:String(e.message).slice(0,500)},'*')});addEventListener('unhandledrejection',function(e){parent.postMessage({type:'custom-html-error',message:String(e.reason).slice(0,500)},'*')});</script></head><body>${node.html || ''}<script>${js}</script></body></html>`;
}
