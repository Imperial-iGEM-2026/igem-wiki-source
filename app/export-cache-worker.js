/** Runs in its own worker. No app or editor APIs are available here. */
export function installExportCache(base) {
  const prefix = 'website-cache:' + base + ':';
  const metaName = prefix + 'metadata';
  const manifestURL = new URL(base + 'cache-manifest.json', self.location.origin).href;
  const metaURL = new URL(base + '__cache_state', self.location.origin).href;
  let checking;
  const digest = async response => {
    if (!response?.ok || response.type === 'opaque') return '';
    const bytes = await response.clone().arrayBuffer();
    return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(n => n.toString(16).padStart(2, '0')).join('');
  };
  const read = async key => {
    const response = await (await caches.open(metaName)).match(metaURL + key);
    return response ? response.json() : null;
  };
  const write = async (key, value) => (await caches.open(metaName)).put(metaURL + key, new Response(JSON.stringify(value), {headers:{'content-type':'application/json'}}));
  const address = entry => new URL(entry.url, self.location.origin).href;
  const valid = manifest => {
    if (manifest?.version !== 1 || manifest.base !== base || !/^[a-f0-9]{64}$/.test(manifest.revision) || !Array.isArray(manifest.assets) || !Array.isArray(manifest.pages) || manifest.assets.length > 5000 || manifest.pages.length > 2000) throw Error('Invalid cache manifest');
    for (const entry of [...manifest.assets, ...manifest.pages]) {
      const url = new URL(entry.url, self.location.origin);
      if (url.protocol !== 'https:' && url.origin !== self.location.origin || url.username || url.password || url.hash || !/^[a-f0-9]{64}$/.test(entry.sha256) || entry.bytes !== undefined && (!Number.isSafeInteger(entry.bytes) || entry.bytes < 0 || entry.bytes > 40*1024*1024)) throw Error('Invalid cache asset');
      if (url.origin === self.location.origin ? !url.pathname.startsWith(base) : url.hostname !== 'static.igem.wiki') throw Error('Cache asset outside this website');
    }
    if (manifest.pages.some(entry => !entry.url.startsWith(base) || entry.url.startsWith('//'))) throw Error('Invalid page scope');
    return manifest;
  };
  async function network(entry) {
    // Cache Storage can store a verified cache-busted response under the original
    // URL, which ordinary page JavaScript cannot do to the browser's HTTP cache.
    for (let attempt = 0; attempt < 2; attempt++) {
      const url = new URL(address(entry));
      if (attempt) url.searchParams.set('__website_asset', entry.sha256);
      try {
        const response = await fetch(url.href, {cache:'reload', credentials:url.origin === self.location.origin ? 'same-origin' : 'omit', signal:AbortSignal.timeout(15000)});
        if (await digest(response) === entry.sha256) return response;
      } catch { /* Retry once, then keep the previous verified build. */ }
    }
    throw Error('Could not verify ' + entry.url);
  }
  const pageEntry = (manifest, url) => {
    const pathname = new URL(url).pathname;
    return manifest.pages.find(p => p.url === pathname || p.url === pathname + '/');
  };
  async function check(client, force) {
    const active = await read('?active');
    const url = new URL(manifestURL); url.searchParams.set('check', Date.now().toString(36));
    const response = await fetch(url.href, {cache:'no-store', signal:AbortSignal.timeout(15000)});
    if (!response.ok) throw Error('Could not check website update');
    const manifest = valid(await response.json());
    if (!force && active?.manifest.revision === manifest.revision && Date.now() - active.checkedAt < 300000)
      return {revision:manifest.revision, repaired:false};
    const previous = active && await caches.open(active.cache);
    const cacheName = prefix + manifest.revision + ':' + crypto.randomUUID();
    const staged = await caches.open(cacheName);
    let next = 0, repaired = false;
    const copy = async entry => {
      let cached = previous && await previous.match(address(entry));
      if (!cached && !active) {
        try { cached = await fetch(address(entry), {cache:'force-cache', signal:AbortSignal.timeout(15000)}); } catch { /* Offline handled by network below. */ }
      }
      if (await digest(cached) !== entry.sha256) { repaired = true; cached = await network(entry); }
      await staged.put(address(entry), cached);
    };
    const work = async () => { while (next < manifest.assets.length) await copy(manifest.assets[next++]); };
    try {
      const results = await Promise.allSettled([work(), work()]);
      const failure = results.find(result => result.status === 'rejected');
      if (failure) throw failure.reason;
      const page = client && pageEntry(manifest, client.url);
      if (page) await staged.put(address(page), await network(page));
      const state = {manifest, cache:cacheName, checkedAt:Date.now()};
      await write('?build=' + manifest.revision, state);
      await write('?active', state);
      // Keep builds still used by open tabs, plus the previous build for rollback.
      const keep = new Set([cacheName, metaName, active?.cache]);
      for (const item of await self.clients.matchAll({type:'window', includeUncontrolled:true})) {
        const binding = await read('?client=' + item.id);
        const state = binding && await read('?build=' + binding.revision);
        if (state) keep.add(state.cache);
      }
      for (const name of await caches.keys()) if (name.startsWith(prefix) && !keep.has(name)) await caches.delete(name);
      return {revision:manifest.revision, repaired};
    } catch (error) { await caches.delete(cacheName); throw error; }
  }
  self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
  self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
  self.addEventListener('message', event => {
    if (event.data?.type !== 'website-cache-check' || !event.source?.id) return;
    event.waitUntil((async () => {
      if (/^[a-f0-9]{64}$/.test(event.data.build)) await write('?client=' + event.source.id, {revision:event.data.build});
      try {
        checking ||= check(event.source, event.data.force).finally(() => { checking = null; });
        event.ports[0]?.postMessage({ok:true, ...await checking});
      } catch (error) { event.ports[0]?.postMessage({ok:false, error:String(error.message || error)}); }
    })());
  });
  self.addEventListener('fetch', event => {
    if (event.request.method !== 'GET') return;
    const url = new URL(event.request.url);
    if (event.request.mode !== 'navigate' && !/\.(?:m?js|css)$/.test(url.pathname)) return;
    if (url.href.startsWith(manifestURL) || url.pathname === base + 'cache-worker.js') return;
    if (url.origin !== self.location.origin && url.hostname !== 'static.igem.wiki') return;
    event.respondWith((async () => {
      const active = await read('?active');
      const binding = event.clientId && await read('?client=' + event.clientId);
      const state = event.request.mode === 'navigate' ? active : (binding && await read('?build=' + binding.revision)) || active;
      if (!state) return fetch(event.request);
      const entry = event.request.mode === 'navigate' ? pageEntry(state.manifest, url) : state.manifest.assets.find(a => address(a) === url.href);
      if (!entry) return fetch(event.request);
      const cache = await caches.open(state.cache);
      let cached = await cache.match(address(entry));
      if (await digest(cached) !== entry.sha256) {
        try { cached = await network(entry); await cache.put(address(entry), cached.clone()); }
        catch { return new Response('Website file could not be verified. Please retry when the connection is available.', {status:503,headers:{'content-type':'text/plain'}}); }
      }
      if (event.resultingClientId) await write('?client=' + event.resultingClientId, {revision:state.manifest.revision});
      // Chromium may reuse fresh renderer-memory subresources without another
      // fetch event. Only our verified CacheStorage should cache these responses.
      const headers = new Headers(cached.headers);
      headers.set('cache-control', 'no-store');
      return new Response(cached.body, {status:cached.status, statusText:cached.statusText, headers});
    })());
  });
}
