import { safeLink } from './link-url';
import { cssError } from './custom-css';
// Built-in layers of a team-created page in a template project (see templates.ts).
export const CUSTOM_HEADING = 'custom-heading';
export const CUSTOM_CONTENT = 'custom-content';
export type BlockKind =
  | 'section'
  | 'button'
  | 'template'
  | 'text'
  | 'image'
  | 'video'
  | 'audio'
  | 'pdf'
  | 'model'
  | 'embed'
  | 'accordion'
  | 'equation'
  | 'references'
  | 'html';
/** One collapsible section. The id keeps it stable when items move. */
export type AccordionItem = {
  id: string;
  title: string;
  body: string;
  open?: boolean;
};
export type ReferenceEntry = { id: string; text: string; url: string };
export type CanvasNode = {
  references?: ReferenceEntry[];
  html?: string;
  css?: string;
  javascript?: string;
  id: string;
  parentId?: string;
  layoutMode?: 'flow' | 'free';
  x?: number;
  y?: number;
  freeWidth?: number;
  freeHeight?: number;
  kind: BlockKind;
  title: string;
  body: string;
  src: string;
  caption: string;
  alt: string;
  span: number;
  align: 'left' | 'center' | 'right';
  background: string;
  padding: number;
  hidden: boolean;
  linkTo?: string;
  links?: Record<string, string>;
  linkLabel?: string;
  // Right-side page index: a label adds this layer; indexHidden drops its headings.
  indexLabel?: string;
  indexHidden?: boolean;
  // 3 renders the heading as a subsection (h3); default is a section (h2).
  headingLevel?: 2 | 3;
  /** Collapsible sections (kind "accordion"). */
  items?: AccordionItem[];
  tabletSpan?: number;
  mobileSpan?: number;
  name?: string;
  locked?: boolean;
  paddingX?: number;
  paddingY?: number;
  marginTop?: number;
  marginBottom?: number;
  minHeight?: number;
  radius?: number;
  borderWidth?: number;
  borderColor?: string;
  textColor?: string;
  fontSize?: number;
  headingSize?: number;
  fontWeight?: number;
  lineHeight?: number;
  letterSpacing?: number;
  fontFamily?: 'sans' | 'serif' | 'mono';
  opacity?: number;
  shadow?: 'none' | 'soft' | 'raised';
  objectFit?: 'cover' | 'contain';
};
export type CanvasLayout = {
  order: string[];
  nodes: CanvasNode[];
  gap: number;
  width: 'full' | 'reading';
  sidebar: boolean;
  customCss?: string;
};
export const emptyLayout: CanvasLayout = {
  order: [],
  nodes: [],
  gap: 0,
  width: 'full',
  sidebar: true,
};
export const newNode = (
  id: string,
  kind: BlockKind,
  title = '',
): CanvasNode => ({
  id,
  kind,
  title,
  body: '',
  src: '',
  caption: '',
  alt: '',
  span: 12,
  align: 'left',
  background: '',
  padding: 0,
  hidden: false,
});
export function safeMediaURL(src: string) {
  if (
    /^\/api\/media\/[a-f0-9-]+\.[a-z0-9]+$/.test(src) ||
    src === '/prion-hero.png' ||
    (/^\/templates\/(regelerate|swiss|notebook-purple)\/[a-zA-Z0-9_./-]+$/.test(
      src,
    ) &&
      !src.includes('..'))
  )
    return true;
  try {
    const u = new URL(src);
    return u.protocol === 'https:' && !u.username && !u.password;
  } catch {
    return false;
  }
}
export function embedURL(src: string): string | null {
  try {
    const u = new URL(src);
    if (u.protocol !== 'https:') return null;
    if (
      u.hostname === 'video.igem.org' &&
      /^\/videos\/embed\/[a-zA-Z0-9-]+$/.test(u.pathname)
    )
      return u.origin + u.pathname;
    if (
      u.hostname === 'www.youtube.com' &&
      /^\/embed\/[a-zA-Z0-9_-]+$/.test(u.pathname)
    )
      return 'https://www.youtube-nocookie.com' + u.pathname;
    if (
      u.hostname === 'www.youtube-nocookie.com' &&
      /^\/embed\/[a-zA-Z0-9_-]+$/.test(u.pathname)
    )
      return u.origin + u.pathname;
    if (u.hostname === 'player.vimeo.com' && /^\/video\/\d+$/.test(u.pathname))
      return u.origin + u.pathname;
    return null;
  } catch {
    return null;
  }
}
export function validateLayout(input: unknown): input is CanvasLayout {
  if (!input || typeof input !== 'object') return false;
  const d = input as CanvasLayout;
  if (
    !Array.isArray(d.order) ||
    !Array.isArray(d.nodes) ||
    !Number.isInteger(d.gap) ||
    d.gap < 0 ||
    d.gap > 80 ||
    !['full', 'reading'].includes(d.width) ||
    typeof d.sidebar !== 'boolean'
  )
    return false;
  if (
    d.customCss !== undefined &&
    (typeof d.customCss !== 'string' || cssError(d.customCss))
  )
    return false;
  const ids = new Set<string>();
  for (const n of d.nodes) {
    if (
      !n ||
      typeof n !== 'object' ||
      typeof n.id !== 'string' ||
      !/^[a-zA-Z0-9-]{1,90}$/.test(n.id) ||
      ids.has(n.id)
    )
      return false;
    ids.add(n.id);
    if (
      ![
        'template',
        'section',
        'button',
        'text',
        'image',
        'video',
        'audio',
        'pdf',
        'model',
        'embed',
        'accordion',
        'equation',
        'references',
        'html',
      ].includes(n.kind) ||
      !Number.isInteger(n.span) ||
      n.span < 1 ||
      n.span > 12 ||
      !['left', 'center', 'right'].includes(n.align) ||
      typeof n.background !== 'string' ||
      !(n.background === '' || /^#[a-fA-F0-9]{6}$/.test(n.background)) ||
      !Number.isInteger(n.padding) ||
      n.padding < 0 ||
      n.padding > 80 ||
      typeof n.hidden !== 'boolean'
    )
      return false;
    for (const [key, max] of [
      ['title', 300],
      ['body', 12000],
      ['src', 2048],
      ['caption', 2000],
      ['alt', 1000],
    ] as const)
      if (typeof n[key] !== 'string' || n[key].length > max) return false;
    // An empty string explicitly clears a built-in image's default website link.
    if (n.linkTo !== undefined && n.linkTo !== '' && !safeLink(n.linkTo))
      return false;
    if (
      n.linkLabel !== undefined &&
      (typeof n.linkLabel !== 'string' || n.linkLabel.length > 150)
    )
      return false;
    if (
      n.indexLabel !== undefined &&
      (typeof n.indexLabel !== 'string' || n.indexLabel.length > 120)
    )
      return false;
    if (n.indexHidden !== undefined && typeof n.indexHidden !== 'boolean')
      return false;
    for (const key of ['html', 'css', 'javascript'] as const)
      if (
        n[key] !== undefined &&
        (n.kind !== 'html' || typeof n[key] !== 'string')
      )
        return false;
    if (n.references !== undefined && !validReferences(n.references, n.kind))
      return false;
    if (n.items !== undefined && !validAccordionItems(n.items, n.kind))
      return false;
    if (
      n.headingLevel !== undefined &&
      n.headingLevel !== 2 &&
      n.headingLevel !== 3
    )
      return false;
    if (
      n.links !== undefined &&
      (!n.links ||
        typeof n.links !== 'object' ||
        Array.isArray(n.links) ||
        Object.keys(n.links).length > 150 ||
        Object.entries(n.links).some(
          ([key, href]) =>
            !/^link(?:-[0-9]+){1,40}$/.test(key) || !safeLink(href),
        ))
    )
      return false;
    if (n.src && !safeMediaURL(n.src)) return false;
    if (n.kind === 'embed' && n.src && !embedURL(n.src)) return false;
    for (const key of ['tabletSpan', 'mobileSpan'] as const)
      if (
        n[key] !== undefined &&
        (!Number.isInteger(n[key]) || n[key]! < 1 || n[key]! > 12)
      )
        return false;
    if (
      n.name !== undefined &&
      (typeof n.name !== 'string' || n.name.length > 100)
    )
      return false;
    if (n.locked !== undefined && typeof n.locked !== 'boolean') return false;
    for (const [key, min, max] of [
      ['x', 0, 100],
      ['y', 0, 2000],
      ['freeWidth', 5, 100],
      ['freeHeight', 20, 2000],
      ['paddingX', 0, 160],
      ['paddingY', 0, 160],
      ['marginTop', 0, 200],
      ['marginBottom', 0, 200],
      ['minHeight', 0, 2000],
      ['radius', 0, 200],
      ['borderWidth', 0, 20],
      ['fontSize', 10, 72],
      ['headingSize', 14, 120],
      ['fontWeight', 100, 900],
      ['lineHeight', 1, 2.5],
      ['letterSpacing', -3, 12],
      ['opacity', 10, 100],
    ] as const)
      if (
        n[key] !== undefined &&
        (typeof n[key] !== 'number' ||
          !Number.isFinite(n[key]) ||
          n[key]! < min ||
          n[key]! > max)
      )
        return false;
    for (const key of ['borderColor', 'textColor'] as const)
      if (n[key] !== undefined && !/^#[a-fA-F0-9]{6}$/.test(n[key]!))
        return false;
    if (
      n.fontFamily !== undefined &&
      !['sans', 'serif', 'mono'].includes(n.fontFamily)
    )
      return false;
    if (
      n.shadow !== undefined &&
      !['none', 'soft', 'raised'].includes(n.shadow)
    )
      return false;
    if (
      n.objectFit !== undefined &&
      !['cover', 'contain'].includes(n.objectFit)
    )
      return false;
  }
  for (const n of d.nodes) {
    if (n.layoutMode !== undefined && !['free', 'flow'].includes(n.layoutMode))
      return false;
    if (n.parentId !== undefined) {
      if (typeof n.parentId !== 'string' || n.kind === 'template') return false;
      let ancestor = n.parentId;
      const seen = new Set([n.id]);
      while (ancestor) {
        const parent = d.nodes.find((item) => item.id === ancestor);
        if (
          !parent ||
          !['template', 'section'].includes(parent.kind) ||
          seen.has(ancestor) ||
          seen.size > 5
        )
          return false;
        seen.add(ancestor);
        ancestor = parent.parentId || '';
      }
    }
  }
  if (
    new Set(d.order).size !== d.order.length ||
    d.order.some(
      (id) => typeof id !== 'string' || !/^[a-zA-Z0-9-]{1,90}$/.test(id),
    )
  )
    return false;
  return true;
}

export function validAccordionItems(items: unknown, kind: string) {
  if (kind !== 'accordion' || !Array.isArray(items) || items.length > 30)
    return false;
  const ids = new Set<string>();
  return items.every((item) => {
    if (
      !item ||
      typeof item !== 'object' ||
      Object.keys(item).some(
        (key) => !['id', 'title', 'body', 'open'].includes(key),
      ) ||
      typeof item.id !== 'string' ||
      !/^[a-zA-Z0-9-]{1,40}$/.test(item.id) ||
      ids.has(item.id) ||
      typeof item.title !== 'string' ||
      item.title.length > 200 ||
      typeof item.body !== 'string' ||
      item.body.length > 5000 ||
      (item.open !== undefined && typeof item.open !== 'boolean')
    )
      return false;
    ids.add(item.id);
    return true;
  });
}
export function nodeLocked(layout: CanvasLayout, id: string): boolean {
  const seen = new Set<string>();
  let node = layout.nodes.find((n) => n.id === id);
  while (node && !seen.has(node.id)) {
    if (node.locked) return true;
    seen.add(node.id);
    node = layout.nodes.find((n) => n.id === node!.parentId);
  }
  return false;
}
export function descendants(layout: CanvasLayout, ids: string[]): string[] {
  const found = new Set(ids);
  for (let i = 0; i < 6; i++)
    for (const n of layout.nodes)
      if (n.parentId && found.has(n.parentId)) found.add(n.id);
  return [...found];
}
export function hierarchyOrder(layout: CanvasLayout): string[] {
  const seen = new Set<string>();
  const visit = (parent?: string): string[] =>
    layout.order
      .filter(
        (id) =>
          !seen.has(id) &&
          layout.nodes.find((n) => n.id === id)?.parentId === parent,
      )
      .flatMap((id) => {
        seen.add(id);
        return [id, ...visit(id)];
      });
  return visit();
}

export function validReferences(
  value: unknown,
  kind: string,
): value is ReferenceEntry[] {
  if (kind !== 'references' || !Array.isArray(value)) return false;
  const ids = new Set<string>();
  return value.every((ref) => {
    if (
      !ref ||
      typeof ref !== 'object' ||
      typeof ref.id !== 'string' ||
      !/^[a-zA-Z0-9-]{1,90}$/.test(ref.id) ||
      ids.has(ref.id) ||
      typeof ref.text !== 'string' ||
      ref.text.length > 12000 ||
      typeof ref.url !== 'string' ||
      (ref.url !== '' && !/^https?:\/\//.test(ref.url)) ||
      (ref.url !== '' && !safeLink(ref.url))
    )
      return false;
    ids.add(ref.id);
    return true;
  });
}
