import { isSiteHeader } from './site-header-layer';
import { initial } from './content';
import { templates, templateDefaults, type TemplateAst } from './templates';
import { pageCatalog, customDefaults, parseRemovedPages } from './custom-pages';
import { pageLayers } from './template-transform';
import { materialize } from './studio-engine';
import { emptyLayout } from './canvas-schema';
import { publicationSlug } from './igem-pages';

export type SearchDocument = { id: string; page: string; title: string; text: string };
export type SearchIndex = { version: 1; documents: SearchDocument[] };

// Index authored text, never script bodies, CSS, attributes or binary data.
export function searchText(source = '') {
  return source.replace(/<(script|style|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ').replace(/<[^>]*>/g, ' ')
    .replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (_, entity: string) => {
      const named: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
      if (entity[0] !== '#') return named[entity.toLowerCase()] || ' ';
      const point = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
      return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : ' ';
    }).replace(/\s+/g, ' ').trim();
}

export function buildSearchIndex(values: Record<string, string>): SearchIndex {
  const id = values['site:template'];
  const defaults = id && templates[id] ? templateDefaults(id) : initial;
  const all = { ...defaults, ...customDefaults(values['pages:custom']), ...values };
  const data = Object.fromEntries(Object.entries(all).map(([key, value]) => [key, { value }]));
  const removed = new Set(parseRemovedPages(values['pages:removed']));
  const pages = [{ slug: 'home', title: 'Home' }, ...pageCatalog(data)].filter((p) => !removed.has(p.slug));
  const slugs = pages.map((p) => p.slug);
  const documents: SearchDocument[] = [];
  const seen = new Set<string>();
  const astText = (ast: TemplateAst): string => {
    if (typeof ast === 'string') return ast;
    if ('f' in ast) return all[ast.f] || '';
    if (['script', 'style', 'template', 'nav'].includes(ast.t) || ast.a.hidden !== undefined || ast.a['aria-hidden'] === 'true') return '';
    return ast.c.map(astText).join(' ');
  };
  for (const page of pages) {
    const slug = page.slug === 'home' ? '' : publicationSlug(page.slug, slugs);
    const title = searchText(all[page.slug + ':title'] || page.title);
    const add = (key: string, heading: string, content: string) => {
      const text = searchText(content);
      const label = searchText(heading) || title;
      if (!text && !label) return;
      const identity = slug + '\n' + label + '\n' + text;
      if (seen.has(identity)) return;
      seen.add(identity);
      documents.push({ id: page.slug + ':' + key, page: slug, title: label === title ? title : title + ' · ' + label, text });
    };
    add('page', title, all[page.slug + ':summary'] || '');
    const layers = pageLayers(data, page.slug).layers;
    const layout = materialize(JSON.parse(all['layout:' + page.slug] || JSON.stringify(emptyLayout)), layers);
    const nodes = new Map(layout.nodes.map((n) => [n.id, n]));
    const builtins = new Map(layers.map((layer) => [layer.id, layer]));
    for (const node of layout.nodes) {
      let parent: typeof node | undefined = node;
      const visited = new Set<string>();
      let visible = true;
      while (parent) {
        if (visited.has(parent.id) || parent.hidden || parent.deleted || isSiteHeader(parent, layout.nodes, builtins.get(parent.id)?.region) || (builtins.has(parent.id) && builtins.get(parent.id)!.region !== 'main')) { visible = false; break; }
        visited.add(parent.id);
        parent = nodes.get(parent.parentId || '');
      }
      if (!visible) continue;
      if (node.kind === 'template') {
        const layer = builtins.get(node.id);
        if (layer) add(node.id, '', astText(layer.ast));
      } else {
        add(node.id, node.title || '', [node.body, node.caption, node.alt, node.kind === 'html' ? node.html : ''].filter(Boolean).join(' '));
        for (const item of node.items || []) add(node.id + ':' + item.id, item.title || '', item.body || '');
      }
    }
    // Built-in non-template wiki pages retain their original field-based content.
    if (!id) for (const [key, value] of Object.entries(all))
      if (key.startsWith('wiki:' + page.slug + ':')) add(key, '', value);
  }
  return { version: 1, documents };
}
