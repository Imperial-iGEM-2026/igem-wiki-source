/** Background integrity checks never interrupt typing, an open dialog or media. */
export function startExportCache(base) {
  const build = document.querySelector('meta[name="website-build"]')?.content;
  if (!build || !('serviceWorker' in navigator) || !window.isSecureContext) return;
  let registration, pending, running, dirty = false, last = 0;
  const storageKey = 'website-cache-reload:' + base + location.pathname;
  const report = status => { window.websiteCache.status = status; window.dispatchEvent(new CustomEvent('website:cache-status', {detail:status})); };
  const refresh = revision => {
    if (dirty || document.querySelector('dialog[open]') || [...document.querySelectorAll('video,audio')].some(m => !m.paused)) { pending = revision; report({state:'update-pending',revision}); return; }
    let previous;
    try { previous = sessionStorage.getItem(storageKey); } catch { previous = new URL(location.href).searchParams.get('__website_cache'); }
    if (previous === revision) { report({state:'reload-limited', revision}); return; }
    try { sessionStorage.setItem(storageKey, revision); location.reload(); }
    catch { const url = new URL(location.href); url.searchParams.set('__website_cache', revision); location.replace(url.href); }
  };
  const check = async (force = false) => {
    if (running) return running;
    running = (async () => {
      try {
        registration ||= await navigator.serviceWorker.register(base + 'cache-worker.js', {scope:base, updateViaCache:'none'});
        registration = await navigator.serviceWorker.ready;
        const worker = registration.active;
        if (!worker) return;
        const result = await new Promise((resolve, reject) => {
          const channel = new MessageChannel();
          const timer = setTimeout(() => { channel.port1.close(); reject(Error('Cache check timed out')); }, 180000);
          channel.port1.onmessage = event => { clearTimeout(timer); channel.port1.close(); resolve(event.data); };
          worker.postMessage({type:'website-cache-check', build, force}, [channel.port2]);
        });
        if (!result.ok) { report({state:'unavailable', error:result.error}); return result; }
        report({state:'verified', revision:result.revision, repaired:result.repaired});
        if (result.revision !== build || result.repaired) refresh(result.revision);
        return result;
      } catch (error) { report({state:'unavailable', error:String(error.message || error)}); }
      finally { last = Date.now(); running = null; }
    })();
    return running;
  };
  window.websiteCache = {status:{state:'checking'}, check:() => check(true), reload:() => { dirty=false; if (pending) refresh(pending); }};
  document.addEventListener('input', event => { if (event.target?.matches('input:not([type="search"]),textarea,[contenteditable="true"]')) dirty=true; }, true);
  const resume = () => { if (document.visibilityState === 'visible' && Date.now()-last > 60000) void check(); };
  document.addEventListener('close', () => { if (pending) refresh(pending); }, true);
  document.addEventListener('ended', () => { if (pending) refresh(pending); }, true);
  window.addEventListener('online', resume);
  document.addEventListener('visibilitychange', resume);
  setTimeout(() => void check(), 500);
}
