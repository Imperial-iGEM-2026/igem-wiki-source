import {
  templateFor,
  templates,
  type TemplateAst,
  type TemplatePage,
} from './templates';
import { wikiPages, type WikiPage } from './wiki-data';
import {
  emptyLayout,
  newNode,
  CUSTOM_CONTENT,
  CUSTOM_HEADING,
} from './canvas-schema';
export const CUSTOM_PAGES = 'pages:custom';
// Template pages a project has deleted (slugs). The template itself is shared.
export const REMOVED_PAGES = 'pages:removed';
export function parseRemovedPages(source = '[]'): string[] {
  try {
    const slugs: unknown = JSON.parse(source);
    return Array.isArray(slugs)
      ? slugs.filter(
          (slug): slug is string =>
            typeof slug === 'string' && /^[a-z0-9-]{1,60}$/.test(slug),
        )
      : [];
  } catch {
    return [];
  }
}
export type CustomPage = {
  slug: string;
  title: string;
  sourcePage?: string;
  sourceTemplate?: string;
};
export const copyFieldId = (slug: string, field: string) =>
  `copy:${slug}:${field}`;
export function copyDefinition(page: CustomPage): TemplatePage | undefined {
  const original = templates[page.sourceTemplate || '']?.pages.find(
    (p) => p.slug === page.sourcePage,
  );
  if (!original) return undefined;
  const remap = (ast: TemplateAst): TemplateAst =>
    typeof ast === 'string'
      ? ast
      : 'f' in ast
        ? { f: copyFieldId(page.slug, ast.f) }
        : { ...ast, c: ast.c.map(remap) };
  return {
    ...original,
    slug: page.slug,
    title: page.title,
    layers: original.layers.map((l) =>
      l.region === 'main' ? { ...l, ast: remap(l.ast) } : l,
    ),
  };
}
export function copiedPage(
  data: Record<string, { value: string } | undefined>,
  slug: string,
) {
  try {
    return parseCustomPages(data[CUSTOM_PAGES]?.value).find(
      (p) => p.slug === slug,
    );
  } catch {
    return undefined;
  }
}
export function copyFieldDefaults(page: CustomPage): Record<string, string> {
  const original = templates[page.sourceTemplate || ''];
  const definition = original?.pages.find((p) => p.slug === page.sourcePage);
  const values: Record<string, string> = {};
  const walk = (ast: TemplateAst) => {
    if (typeof ast === 'string') return;
    if ('f' in ast)
      values[copyFieldId(page.slug, ast.f)] = original.fields[ast.f] || '';
    else ast.c.forEach(walk);
  };
  definition?.layers
    .filter((l) => l.region === 'main')
    .forEach((l) => walk(l.ast));
  return values;
}
const reserved = new Set([
  'home',
  'api',
  'auth',
  'assets',
  'login',
  'logout',
  'cdn-cgi',
  'file',
  'upload',
  'workspace',
  'studio-preview',
  'templates',
]);
export function validCustomPage(page: unknown): page is CustomPage {
  if (!page || typeof page !== 'object') return false;
  const p = page as CustomPage;
  return (
    typeof p.slug === 'string' &&
    /^[a-z][a-z0-9-]{0,59}$/.test(p.slug) &&
    !reserved.has(p.slug) &&
    typeof p.title === 'string' &&
    p.title.trim().length > 0 &&
    p.title.length <= 100 &&
    ((p.sourcePage === undefined && p.sourceTemplate === undefined) ||
      (typeof p.sourcePage === 'string' &&
        typeof p.sourceTemplate === 'string' &&
        !!templates[p.sourceTemplate]?.pages.some(
          (page) => page.slug === p.sourcePage,
        )))
  );
}
export function parseCustomPages(source = '[]'): CustomPage[] {
  const pages: unknown = JSON.parse(source);
  if (
    !Array.isArray(pages) ||
    pages.length > 50 ||
    !pages.every(validCustomPage) ||
    new Set(pages.map((p) => p.slug)).size !== pages.length
  )
    throw Error('Invalid custom page list.');
  return pages;
}
export function customWikiPage(page: CustomPage): WikiPage {
  return {
    ...page,
    group: 'Custom pages',
    summary: 'A page created by your team.',
    status: 'Core documentation',
    sections: [],
  };
}
export function customDefaults(source = '[]'): Record<string, string> {
  return Object.fromEntries(
    parseCustomPages(source).flatMap((p) => [
      ...Object.entries(copyFieldDefaults(p)),
      [p.slug + ':title', p.title],
      [p.slug + ':summary', 'A page created by your team.'],
      [
        'layout:' + p.slug,
        // Same layout as a template content page: heading, then sidebar and
        // a content column holding the page's sections.
        JSON.stringify({
          ...emptyLayout,
          nodes: [
            {
              ...newNode(CUSTOM_HEADING, 'template', 'Page heading'),
              name: 'Page heading',
            },
            {
              ...newNode(CUSTOM_CONTENT, 'template', 'Page content'),
              name: 'Page content',
            },
            {
              ...newNode('custom-intro', 'text', 'Overview'),
              name: 'Overview',
              body: 'Write this page’s content here.',
              parentId: CUSTOM_CONTENT,
            },
          ],
          order: [CUSTOM_HEADING, CUSTOM_CONTENT, 'custom-intro'],
        }),
      ],
    ]),
  );
}
export function pageCatalog(
  data: Record<string, { value: string }>,
): WikiPage[] {
  let extra: CustomPage[] = [];
  try {
    extra = parseCustomPages(data[CUSTOM_PAGES]?.value);
  } catch {
    /* Invalid remote metadata is never used for routing. */
  }
  const template = templateFor(data);
  const removed = new Set(parseRemovedPages(data[REMOVED_PAGES]?.value));
  const core = template
    ? template.pages
        .filter((p) => p.slug !== 'home' && !removed.has(p.slug))
        .map((p) => ({
          ...customWikiPage(p),
          group:
            wikiPages.find((w) => w.slug === p.slug)?.group ||
            (p.slug === 'members' ? 'Team' : 'Project'),
        }))
    : wikiPages;
  return [...core, ...extra.map(customWikiPage)].map((p) => ({
    ...p,
    title: data[p.slug + ':title']?.value || p.title,
  }));
}
