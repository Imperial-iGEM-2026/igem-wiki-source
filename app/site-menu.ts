import { templateFor, type TemplateAst } from './templates';
import { pageCatalog } from './custom-pages';
// The header menu of a template project: groups of pages, in order. An empty
// value means "use the template's own menu"; editing it in Studio saves a copy.
export const SITE_MENU = 'site:menu';
export type SiteMenuGroup = { id: string; label: string; pages: string[] };
export type SiteMenu = { groups: SiteMenuGroup[] };
type Data = Record<string, { value: string } | undefined>;

export function validMenu(menu: unknown): menu is SiteMenu {
  if (!menu || typeof menu !== 'object' || Array.isArray(menu)) return false;
  const { groups } = menu as SiteMenu;
  if (
    Object.keys(menu).some((key) => key !== 'groups') ||
    !Array.isArray(groups) ||
    groups.length > 12
  )
    return false;
  const ids = new Set<string>(),
    slugs = new Set<string>();
  for (const group of groups) {
    if (
      !group ||
      typeof group !== 'object' ||
      Object.keys(group).some(
        (key) => !['id', 'label', 'pages'].includes(key),
      ) ||
      typeof group.id !== 'string' ||
      !/^[a-z0-9-]{1,40}$/.test(group.id) ||
      ids.has(group.id) ||
      typeof group.label !== 'string' ||
      !group.label.trim() ||
      group.label.length > 40 ||
      !Array.isArray(group.pages) ||
      group.pages.length > 60
    )
      return false;
    ids.add(group.id);
    for (const slug of group.pages) {
      if (
        typeof slug !== 'string' ||
        !/^[a-z0-9][a-z0-9-]{0,59}$/.test(slug) ||
        slug === 'home' ||
        slugs.has(slug)
      )
        return false;
      slugs.add(slug);
    }
  }
  return true;
}

function templateNav(ast: TemplateAst): TemplateAst | undefined {
  if (typeof ast !== 'object' || 'f' in ast) return undefined;
  if (ast.t === 'nav' && /\bwiki-nav\b/.test(ast.a.class || '')) return ast;
  for (const child of ast.c) {
    const found = templateNav(child);
    if (found) return found;
  }
  return undefined;
}
const isGroup = (node: TemplateAst) =>
  typeof node === 'object' &&
  !('f' in node) &&
  node.t === 'details' &&
  /\bnav-group\b/.test(node.a.class || '');
function firstField(node: TemplateAst): string | undefined {
  if (typeof node !== 'object') return undefined;
  if ('f' in node) return node.f;
  for (const child of node.c) {
    const found = firstField(child);
    if (found) return found;
  }
  return undefined;
}
function links(node: TemplateAst, found: string[] = []): string[] {
  if (typeof node === 'object' && !('f' in node)) {
    if (node.t === 'a' && node.a.href?.startsWith('/'))
      found.push(node.a.href.replace(/^\/+|\/+$/g, '').split(/[?#]/)[0]);
    node.c.forEach((child) => links(child, found));
  }
  return found;
}
/** The navigation element of the template header (shared by every page). */
export function templateMenuNav(data: Data) {
  const template = templateFor(data as Record<string, { value: string }>);
  const header = template?.pages
    .find((p) => p.slug === 'home')
    ?.layers.find((layer) => layer.region === 'header');
  return header ? templateNav(header.ast) : undefined;
}
/** The template's own menu, used until a project saves its own. */
export function defaultMenu(data: Data): SiteMenu {
  const nav = templateMenuNav(data);
  if (!nav || typeof nav !== 'object' || 'f' in nav) return { groups: [] };
  return {
    groups: nav.c.filter(isGroup).map((group, index) => {
      const labelField =
        typeof group === 'object' && !('f' in group)
          ? firstField(
              group.c.find(
                (c) =>
                  typeof c === 'object' && !('f' in c) && c.t === 'summary',
              ) || '',
            )
          : undefined;
      return {
        id: 'group-' + (index + 1),
        label:
          (labelField && data[labelField]?.value?.trim()) ||
          'Group ' + (index + 1),
        pages: links(group).filter((slug) => slug && slug !== 'home'),
      };
    }),
  };
}
export function parseMenu(data: Data): { menu: SiteMenu; custom: boolean } {
  try {
    const value = data[SITE_MENU]?.value;
    if (value) {
      const menu: unknown = JSON.parse(value);
      if (validMenu(menu)) return { menu, custom: true };
    }
  } catch {
    /* An invalid saved menu falls back to the template's menu. */
  }
  return { menu: defaultMenu(data), custom: false };
}
/** Menu groups with existing pages only, plus pages that are in no group. */
export function resolveMenu(data: Data) {
  const pages = pageCatalog(data as Record<string, { value: string }>);
  const bySlug = new Map(pages.map((p) => [p.slug, p]));
  const { menu, custom } = parseMenu(data);
  const placed = new Set<string>();
  const groups = menu.groups.map((group) => ({
    ...group,
    pages: group.pages.flatMap((slug) => {
      const page = bySlug.get(slug);
      if (!page || placed.has(slug)) return [];
      placed.add(slug);
      return [page];
    }),
  }));
  return {
    custom,
    groups,
    unplaced: pages.filter((p) => !placed.has(p.slug)),
  };
}
/** Move a page to a group (or out of the menu with group null) at an index. */
export function movePage(
  menu: SiteMenu,
  slug: string,
  groupId: string | null,
  index = Infinity,
): SiteMenu {
  const groups = menu.groups.map((g) => ({
    ...g,
    pages: g.pages.filter((s) => s !== slug),
  }));
  const target = groups.find((g) => g.id === groupId);
  if (target)
    target.pages.splice(
      Math.max(0, Math.min(index, target.pages.length)),
      0,
      slug,
    );
  return { groups };
}
export function newGroupId(menu: SiteMenu) {
  let n = menu.groups.length + 1;
  while (menu.groups.some((g) => g.id === 'group-' + n)) n++;
  return 'group-' + n;
}
