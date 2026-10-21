import type { SearchIndex, SearchDocument } from './site-search-index';
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

