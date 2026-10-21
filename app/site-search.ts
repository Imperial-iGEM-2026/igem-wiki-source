import { serveHtmlSearch } from './html-search';
import type { SearchIndex } from './site-search-index';
import './site-search.css';
import { createWebsiteSearch } from './site-search-core';
export { createWebsiteSearch } from './site-search-core';
export type { SearchResult } from './site-search-core';

export function startWebsiteSearch(load: () => Promise<SearchIndex>, base = '/', host: HTMLElement = document.body, route: (url: string) => string = (url) => url, showInterface = true, showLauncher = false) {
  const api = createWebsiteSearch(load, base, route);
  const stopBridge = serveHtmlSearch(api.search);
  const container = document.createElement('div');
  container.className = 'website-search';
  container.innerHTML = '<button type="button" class="website-search-open" aria-label="Search this website">⌕ Search</button><dialog aria-label="Search this website"><form method="dialog"><strong>Search this website</strong><button aria-label="Close search">✕</button></form><input type="search" aria-label="Search pages" placeholder="Search pages and sections…" maxlength="200"><p role="status">Type to search this project.</p><ol></ol></dialog>';
  // Keep the API/dialog mounted in Design so project header enhancements can
  // attach their own search button. Only the default floating trigger is hidden.
  host.appendChild(container);
  (container.querySelector('.website-search-open') as HTMLButtonElement).hidden = !showInterface || !showLauncher;
  const dialog = container.querySelector('dialog')!;
  const input = container.querySelector('input')!;
  const status = container.querySelector('[role=status]')!;
  const results = container.querySelector('ol')!;
  // A modal dialog escapes all ancestors into the browser's top layer. In
  // Design, contain it in the visible artboard instead of covering Studio.
  let stopPositioning = () => {};
  let opener: HTMLElement | null = null;
  const resetOverlay = () => {
    stopPositioning();
    stopPositioning = () => {};
    container.classList.remove('website-search-editor-open');
    container.removeAttribute('style');
  };
  if (!showInterface) {
    container.classList.add('website-search-editor');
    container.dataset.studioRuntimeControl = '';
  }
  const open = () => {
    if (dialog.open) { input.focus({ preventScroll: true }); return; }
    opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (showInterface) dialog.showModal();
    else {
      const artboard = document.querySelector<HTMLElement>('.studio-workspace:not(.studio-workspace-hidden) .studio-artboard');
      const stage = artboard?.closest<HTMLElement>('.studio-stage');
      if (!artboard || !stage) return;
      const position = () => {
        const a = artboard.getBoundingClientRect(), s = stage.getBoundingClientRect();
        const left = Math.max(0, a.left, s.left), top = Math.max(0, a.top, s.top);
        const right = Math.min(window.innerWidth, a.right, s.left + stage.clientWidth);
        const bottom = Math.min(window.innerHeight, a.bottom, s.top + stage.clientHeight);
        if (right <= left || bottom <= top || stage.closest('.studio-workspace-hidden')) {
          dialog.close(); resetOverlay(); return false;
        }
        Object.assign(container.style, { left: left + 'px', top: top + 'px', width: right - left + 'px', height: bottom - top + 'px' });
        return true;
      };
      if (!position()) return;
      container.classList.add('website-search-editor-open');
      dialog.show();
      const resize = new ResizeObserver(position);
      resize.observe(stage); resize.observe(artboard);
      const mutations = new MutationObserver(position);
      mutations.observe(artboard, { attributes: true, attributeFilter: ['style'] });
      const workspace = stage.closest('.studio-workspace');
      if (workspace) mutations.observe(workspace, { attributes: true, attributeFilter: ['class'] });
      window.addEventListener('resize', position);
      window.addEventListener('scroll', position, true);
      stopPositioning = () => {
        resize.disconnect(); mutations.disconnect();
        window.removeEventListener('resize', position);
        window.removeEventListener('scroll', position, true);
      };
    }
    input.focus({ preventScroll: true });
  };
  const close = () => { dialog.close(); resetOverlay(); };
  dialog.addEventListener('close', () => {
    resetOverlay();
    if (opener?.isConnected) opener.focus({ preventScroll: true });
  });
  container.addEventListener('click', (event) => {
    if (!showInterface && event.target === container) close();
  });
  dialog.addEventListener('keydown', (event) => { if (event.key === 'Escape') { event.preventDefault(); close(); } });
  container.querySelector('.website-search-open')!.addEventListener('click', open);
  let timer: ReturnType<typeof setTimeout>, sequence = 0, alive = true;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    const current = ++sequence;
    results.replaceChildren();
    if (!input.value.trim()) { status.textContent = 'Type to search this project.'; return; }
    status.textContent = 'Searching…';
    timer = setTimeout(async () => {
      try {
        const found = await api.search(input.value);
        if (!alive || current !== sequence) return;
        status.textContent = found.length ? (found[0].correction ? `Showing matches for “${found[0].correction}” · ${found.length} results` : `${found.length} result${found.length === 1 ? '' : 's'}`) : 'No matching pages. Try another word.';
        for (const item of found) {
          const li = document.createElement('li'), a = document.createElement('a'), title = document.createElement('strong'), excerpt = document.createElement('span');
          a.href = item.url; title.textContent = item.title; excerpt.textContent = item.excerpt;
          a.appendChild(title); a.appendChild(excerpt); li.appendChild(a); results.appendChild(li);
          a.addEventListener('click', close);
        }
      } catch {
        if (alive && current === sequence) status.textContent = 'Search could not load. Check your connection and type again to retry.';
      }
    }, 150);
  });
  const shortcut = (event: KeyboardEvent) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); open(); }
  };
  if (showInterface) window.addEventListener('keydown', shortcut);
  const publicAPI = { ...api, open, close };
  const target = window as Window & { websiteSearch?: typeof publicAPI };
  target.websiteSearch = publicAPI;
  return () => {
    stopBridge();
    alive = false; sequence++; clearTimeout(timer); close(); container.remove();
    window.removeEventListener('keydown', shortcut);
    if (target.websiteSearch === publicAPI) delete target.websiteSearch;
  };
}
