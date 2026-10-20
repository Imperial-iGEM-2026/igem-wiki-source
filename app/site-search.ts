import { serveHtmlSearch } from './html-search';
import type { SearchIndex, SearchDocument } from './site-search-index';
import './site-search.css';
export type SearchResult = { id: string; title: string; page: string; excerpt: string; url: string; score: number; correction?: string };
const normalize = (text: string) => text.normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase();

export function createWebsiteSearch(load: () => Promise<SearchIndex>, base = '/', route: (url: string) => string = (url) => url) {
  type Prepared = { doc: SearchDocument; title: string; text: string; pageTitle: string; heading: string };
  let pending: Promise<Prepared[]> | undefined;
  let vocabulary = new Map<string, number>();
  const tokens = (text: string): string[] => normalize(text).match(/[\p{L}\p{N}]+/gu) || [];
  const oneEdit = (a: string, b: string) => {
    if (Math.abs(a.length - b.length) > 1 || a === b) return false;
    let i = 0; while (i < a.length && a[i] === b[i]) i++;
    if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1) || (a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2));
    return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
  };
  return {
    async search(query: string, options: { limit?: number } = {}): Promise<SearchResult[]> {
      const original = [...new Set(tokens(query.slice(0, 200)))].slice(0, 12);
      const filtered = original.filter((word) => !['the', 'a', 'an', 'and', 'of', 'for', 'in', 'to', 'our'].includes(word));
      const words = filtered.length ? filtered : original;
      if (!words.length) return [];
      pending ||= load().then((index) => {
        if (index?.version !== 1 || !Array.isArray(index.documents) || index.documents.some((d) =>
          !d || typeof d.id !== 'string' || typeof d.title !== 'string' || typeof d.text !== 'string' ||
          typeof d.page !== 'string' || !/^[a-z0-9-]*$/.test(d.page)))
          throw Error('Invalid search index. Prepare a fresh export.');
        vocabulary = new Map();
        return index.documents.map((doc) => {
          const title = normalize(doc.title), text = normalize(doc.text), [pageTitle, ...heading] = title.split(' · ');
          for (const token of new Set(tokens(title + ' ' + text))) vocabulary.set(token, (vocabulary.get(token) || 0) + 1);
          return { doc, title, text, pageTitle, heading: heading.join(' · ') };
        });
      }).catch((error) => { pending = undefined; throw error; });
      const index = await pending;
      const rank = (terms: string[], correction?: string) => {
        const phrase = terms.join(' ');
        const candidates = index.flatMap(({doc, title, text, pageTitle, heading}) => {
          if (!terms.every((word) => title.includes(word) || text.includes(word))) return [];
          let score = (pageTitle === phrase ? 100 : pageTitle.includes(phrase) ? 40 : 0) +
            (title.includes(phrase) ? 10 : 0) + (text.includes(phrase) ? 3 : 0);
          const pageWords = tokens(pageTitle);
          for (const word of terms) score += (pageWords.includes(word) ? 15 : pageTitle.includes(word) ? 7 : 0) + (heading.includes(word) ? 8 : 0) + (text.includes(word) ? 1 : 0);
          if (/(?:^|-)(backup|test|scratch)(?:-|$)/.test(doc.page) && !terms.some((t) => ['backup', 'test', 'scratch'].includes(t))) score -= 60;
          const position = Math.max(0, text.indexOf(terms[0]) - 60);
          return [{ id: doc.id, title: doc.title, page: doc.page,
            excerpt: (position ? '…' : '') + doc.text.slice(position, position + 220) + (doc.text.length > position + 220 ? '…' : ''),
            url: route(base + (doc.page ? doc.page + '/' : '')), score, ...(correction ? { correction } : {}) }];
        }).sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
        const pages = new Set<string>();
        return candidates.filter((item) => { if (pages.has(item.page)) return false; pages.add(item.page); return true; });
      };
      let results = rank(words);
      if (!results.length) {
        const corrected = words.map((word) => {
          if (word.length < 5 || vocabulary.has(word)) return word;
          return [...vocabulary].filter(([candidate]) => oneEdit(word, candidate))
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] || word;
        });
        if (corrected.join(' ') !== words.join(' ')) results = rank(corrected, corrected.join(' '));
      }
      return results.slice(0, Math.max(1, Math.min(50, options.limit || 20)));
    },
  };
}

export function startWebsiteSearch(load: () => Promise<SearchIndex>, base = '/', host: HTMLElement = document.body, route: (url: string) => string = (url) => url, showInterface = true) {
  const api = createWebsiteSearch(load, base, route);
  const stopBridge = serveHtmlSearch(api.search);
  const container = document.createElement('div');
  container.className = 'website-search';
  container.innerHTML = '<button type="button" class="website-search-open" aria-label="Search this website">⌕ Search</button><dialog aria-label="Search this website"><form method="dialog"><strong>Search this website</strong><button aria-label="Close search">✕</button></form><input type="search" aria-label="Search pages" placeholder="Search pages and sections…" maxlength="200"><p role="status">Type to search this project.</p><ol></ol></dialog>';
  if (showInterface) host.appendChild(container);
  const dialog = container.querySelector('dialog')!;
  const input = container.querySelector('input')!;
  const status = container.querySelector('[role=status]')!;
  const results = container.querySelector('ol')!;
  const open = () => { if (!dialog.open) dialog.showModal(); input.focus(); };
  const close = () => dialog.close();
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
    alive = false; sequence++; clearTimeout(timer); dialog.close(); container.remove();
    window.removeEventListener('keydown', shortcut);
    if (target.websiteSearch === publicAPI) delete target.websiteSearch;
  };
}
