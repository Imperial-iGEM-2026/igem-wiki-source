import { sponsorLayers } from './sponsor-layers';
import type { CanvasNode } from './canvas-schema';
// Page-dependent changes to imported template markup, shared by the renderer
// (browser, static export) and the server's AI tools so both see the same page.
import {
  templateFor,
  contentPrototype,
  CUSTOM_CONTENT,
  CUSTOM_HEADING,
  type TemplateAst,
} from './templates';
import {
  copyDefinition,
  copiedPage,
  parseRemovedPages,
  REMOVED_PAGES,
  pageCatalog,
} from './custom-pages';
import { resolveMenu } from './site-menu';

export type AstNode = Extract<TemplateAst, { t: string }>;
type Data = Record<string, { value: string } | undefined>;
type MenuGroup = { label: string; pages: { slug: string; title: string }[] };
export type RenderContext = {
  removed: Set<string>;
  menu?: MenuGroup[];
  page?: string;
  title?: string;
  /** The menu group of this page; rebuilds the heading eyebrow. */
  group?: MenuGroup;
  rebuild?: boolean;
  edited?: (fieldId: string) => boolean;
};
export type PageLayer = {
  defaults?: Partial<CanvasNode>;
  sponsorGrid?: boolean;
  sponsorSlot?: 'grid' | 'fixed';
  linkPath?: string;
  id: string;
  label: string;
  region: string;
  ast: TemplateAst;
};

export const isNode = (node: TemplateAst): node is AstNode =>
  typeof node === 'object' && !('f' in node);
export const hasClass = (node: { a: Record<string, string> }, name: string) =>
  new RegExp('\\b' + name + '\\b').test(node.a.class || '');

// Heading for a team-created page, built from the template page heading.
function customHeading(heading: TemplateAst, context: RenderContext) {
  const fill = (node: TemplateAst): TemplateAst => {
    if (typeof node === 'string') return node;
    if ('f' in node) return '';
    if (hasClass(node, 'eyebrow'))
      return {
        ...node,
        c: [
          (
            (context.group ? context.group.label + ' / ' : '') +
            (context.title || '')
          ).toUpperCase(),
        ],
      };
    if (node.t === 'h1') return { ...node, c: [context.title || ''] };
    if (hasClass(node, 'page-status')) return '';
    return { ...node, c: node.c.map(fill) };
  };
  return fill(heading);
}
// "GROUP / PAGE" eyebrow, unless the team edited the eyebrow text.
function groupHeading(heading: AstNode, context: RenderContext): AstNode {
  return {
    ...heading,
    c: heading.c.map((child) => {
      if (!isNode(child) || !hasClass(child, 'eyebrow')) return child;
      const field = child.c.find((c) => typeof c === 'object' && 'f' in c);
      if (
        field &&
        typeof field === 'object' &&
        'f' in field &&
        context.edited?.(field.f)
      )
        return child;
      return {
        ...child,
        c: [`${context.group!.label} / ${context.title || ''}`.toUpperCase()],
      };
    }),
  };
}
const menuGroup = (node: TemplateAst) =>
  isNode(node) && node.t === 'details' && hasClass(node, 'nav-group');
// Rebuild the template's menu groups from the project's saved menu, reusing
// the first template group as markup so the header keeps its styling.
function projectMenu(nav: AstNode, menu: MenuGroup[]): AstNode {
  const prototype = nav.c.find(menuGroup) as AstNode | undefined;
  if (!prototype) return nav;
  const summary = prototype.c.find((c) => isNode(c) && c.t === 'summary') as
    | AstNode
    | undefined;
  const dropdown = prototype.c.find((c) => isNode(c) && c.t !== 'summary') as
    | AstNode
    | undefined;
  const anchor = dropdown?.c.find((c) => isNode(c) && c.t === 'a') as
    | AstNode
    | undefined;
  const groups: TemplateAst[] = menu
    .filter((group) => group.pages.length)
    .map((group) => ({
      ...prototype,
      c: [
        ...(summary
          ? [
              {
                ...summary,
                // The label replaces the first text; the chevron span stays.
                c: [group.label, ...summary.c.filter(isNode)],
              },
            ]
          : []),
        {
          ...(dropdown || { t: 'div', a: { class: 'nav-dropdown' }, c: [] }),
          c: group.pages.map((page) => ({
            ...(anchor || { t: 'a', a: {}, c: [] }),
            a: { ...anchor?.a, href: '/' + page.slug },
            c: [page.title],
          })),
        },
      ],
    }));
  const first = nav.c.findIndex(menuGroup);
  return {
    ...nav,
    c: [
      ...nav.c.slice(0, first).filter((c) => !menuGroup(c)),
      ...groups,
      ...nav.c.slice(first).filter((c) => !menuGroup(c)),
    ],
  };
}
/** Apply page context to one element; null means it is not rendered. */
export function transformNode(
  node: AstNode,
  context: RenderContext,
): AstNode | null {
  if (context.menu && node.t === 'nav' && hasClass(node, 'wiki-nav'))
    node = projectMenu(node, context.menu);
  if (node.t === 'aside' && hasClass(node, 'wiki-sidebar'))
    return {
      ...node,
      a: {
        ...node.a,
        'data-page-index-sidebar': '',
        'aria-label': 'Page sections',
      },
      // A dedicated host keeps the generated index outside React's child list.
      // Existing page/menu content remains in saved data; this is presentation only.
      c: [{ t: 'div', a: { 'data-page-index-host': '' }, c: [] }],
    };
  if (
    context.rebuild &&
    context.group &&
    node.t === 'div' &&
    hasClass(node, 'page-heading')
  )
    node = groupHeading(node, context);
  // Links to template pages this project deleted are left out.
  if (
    node.t === 'a' &&
    context.removed.size &&
    context.removed.has(
      (node.a.href || '').split(/[?#]/)[0].replace(/^\/+|\/+$/g, ''),
    )
  )
    return null;
  return node;
}
/** The template layers of a page and the context they render with. */
export function pageLayers(
  data: Data,
  page: string,
): { context: RenderContext; layers: PageLayer[] } {
  const template = templateFor(data as Record<string, { value: string }>);
  const context: RenderContext = { removed: new Set() };
  if (!template) return { context, layers: [] };
  const siteMenu = resolveMenu(data);
  const copy = copiedPage(data, page);
  const definition =
    template.pages.find((p) => p.slug === page) ||
    (copy && copyDefinition(copy));
  const custom = !definition && page !== 'home';
  const group = siteMenu.groups.find((g) =>
    g.pages.some((p) => p.slug === page),
  );
  Object.assign(context, {
    removed: new Set(parseRemovedPages(data[REMOVED_PAGES]?.value)),
    menu: siteMenu.custom ? siteMenu.groups : undefined,
    page,
    title: pageCatalog(data as Record<string, { value: string }>).find(
      (p) => p.slug === page,
    )?.title,
    group: group && { label: group.label, pages: group.pages },
    // Template pages follow a saved menu; team pages always use it.
    rebuild: siteMenu.custom || custom,
    edited: (id: string) =>
      data[id] !== undefined && data[id]!.value !== template.fields[id],
  } satisfies RenderContext);
  const prototype = custom ? contentPrototype(template) : undefined;
  const chrome =
    prototype?.chrome ||
    template.pages
      .find((p) => p.slug === 'home')
      ?.layers.filter((l) => l.region !== 'main') ||
    [];
  const layers: PageLayer[] = definition?.layers || [
    ...chrome.filter((l) => l.region === 'header'),
    ...(prototype
      ? [
          {
            id: CUSTOM_HEADING,
            // Like template pages, the heading layer carries the page title.
            label: context.title || 'Page heading',
            region: 'main',
            ast: customHeading(prototype.heading, context),
          },
          {
            id: CUSTOM_CONTENT,
            label: 'Page content',
            region: 'main',
            ast: isNode(prototype.content)
              ? {
                  ...prototype.content,
                  // Keep the sidebar; the page's own sections fill the column.
                  c: prototype.content.c.filter(
                    (c) => isNode(c) && c.t === 'aside',
                  ),
                }
              : prototype.content,
          },
        ]
      : []),
    ...chrome.filter((l) => l.region !== 'header'),
  ];
  return { context, layers: sponsorLayers(layers) };
}
