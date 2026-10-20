import type { SearchResult } from './site-search';

export function serveHtmlSearch(
  search: (
    query: string,
    options?: { limit?: number },
  ) => Promise<SearchResult[]>,
) {
  const state = window as Window & { __htmlSearchBridge?: () => void };
  state.__htmlSearchBridge?.();
  let active = true;
  const busy = new WeakSet<Window>();
  const receive = async (event: MessageEvent) => {
    const message = event.data;
    if (
      message?.type !== 'custom-html-search' ||
      typeof message.query !== 'string' ||
      !Number.isSafeInteger(message.id)
    )
      return;
    const frame = [
      ...document.querySelectorAll<HTMLIFrameElement>(
        'iframe.custom-html-frame',
      ),
    ].find((f) => f.contentWindow === event.source);
    if (!frame?.contentWindow) return;
    const target = frame.contentWindow;
    if (busy.has(target)) {
      target.postMessage(
        {
          type: 'custom-html-search-result',
          id: message.id,
          error: 'Search is busy; try again.',
        },
        '*',
      );
      return;
    }
    busy.add(target);
    try {
      const results = await search(message.query.slice(0, 200), { limit: 20 });
      if (active && frame.contentWindow === target)
        target.postMessage(
          { type: 'custom-html-search-result', id: message.id, results },
          '*',
        );
    } catch {
      if (active)
        target.postMessage(
          {
            type: 'custom-html-search-result',
            id: message.id,
            error: 'Search is unavailable. Try again.',
          },
          '*',
        );
    } finally {
      busy.delete(target);
    }
  };
  window.addEventListener('message', receive);
  const stop = () => {
    active = false;
    window.removeEventListener('message', receive);
    if (state.__htmlSearchBridge === stop) delete state.__htmlSearchBridge;
  };
  state.__htmlSearchBridge = stop;
  return stop;
}

/** Serialized into opaque Custom HTML. Exposes queries, never authenticated fetch. */
export function htmlSearchBridge() {
  let next = 0;
  const pending = new Map<
    number,
    {
      resolve: (value: unknown) => void;
      reject: (reason: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  (window as Window & { websiteSearch?: unknown }).websiteSearch = {
    search(query: string) {
      if (typeof query !== 'string')
        return Promise.reject(Error('Search query must be text.'));
      return new Promise((resolve, reject) => {
        const id = ++next;
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(Error('Search timed out. Try again.'));
        }, 15000);
        pending.set(id, { resolve, reject, timer });
        parent.postMessage(
          { type: 'custom-html-search', id, query: query.slice(0, 200) },
          '*',
        );
      });
    },
  };
  window.addEventListener('message', (event) => {
    if (
      event.source !== parent ||
      event.data?.type !== 'custom-html-search-result'
    )
      return;
    const item = pending.get(event.data.id);
    if (!item) return;
    pending.delete(event.data.id);
    clearTimeout(item.timer);
    if (event.data.error) item.reject(Error(event.data.error));
    else item.resolve(event.data.results);
  });
}

export const searchHtmlExample = {
  html: '<div role="search" id="project-search"><label for="project-query">Search this website</label><input id="project-query" type="search" placeholder="Search pages and sections…" maxlength="200"><button type="button">Search</button></div><p id="search-status" role="status"></p><ol id="search-results"></ol>',
  css: 'body{font:16px system-ui;color:#172033;padding:20px}#project-search{display:flex;gap:12px;flex-wrap:wrap}label{width:100%;font-weight:600}input{flex:1;min-width:120px;padding:12px;border:1px solid #64748b;border-radius:8px}button{padding:12px 20px;border:0;border-radius:8px;background:#2457d6;color:white}li{margin:16px 0}a{color:#0047ab}li span{display:block;margin-top:6px}',
  javascript: `document.getElementById('project-query').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();document.querySelector('#project-search button').click();}});
document.querySelector('#project-search button').addEventListener('click',async event=>{
  event.preventDefault();
  const status=document.getElementById('search-status'),list=document.getElementById('search-results');
  const button=event.currentTarget;button.disabled=true;status.textContent='Searching…';list.replaceChildren();
  try{const results=await window.websiteSearch.search(document.getElementById('project-query').value);
    status.textContent=results.length ? results.length+' results' : 'No matching pages.';
    for(const result of results){const item=document.createElement('li'),link=document.createElement('a'),excerpt=document.createElement('span');link.href=result.url;link.textContent=result.title;excerpt.textContent=result.excerpt;item.append(link,excerpt);list.append(item);}
  }catch(error){status.textContent=error.message;}finally{button.disabled=false;}
});`,
};
