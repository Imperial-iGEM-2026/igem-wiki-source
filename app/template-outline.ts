// A readable element outline of a rendered page section for AI tools: what
// each element is, which editable text it holds, and the exact CSS selector
// the editor would use for it (same rules as studio-target.ts).
import type { TemplateAst } from './templates';
import {
  isNode,
  transformNode,
  type AstNode,
  type RenderContext,
  type PageLayer,
} from './template-transform';
import type { CanvasNode } from './canvas-schema';

export type OutlineItem = {
  selector: string;
  role: string;
  text?: string;
  fieldIds?: string[];
  href?: string;
  linkKey?: string;
  src?: string;
  alt?: string;
  within?: string;
};
const semantic: Record<string, (node: AstNode) => string> = {
  h1: () => 'heading 1',
  h2: () => 'heading 2',
  h3: () => 'heading 3',
  h4: () => 'heading 4',
  h5: () => 'heading 5',
  h6: () => 'heading 6',
  p: () => 'paragraph',
  a: (node) =>
    /\b(button|btn|cta)\b/.test(node.a.class || '') ? 'button link' : 'link',
  button: () => 'button',
  img: () => 'image',
  li: () => 'list item',
  summary: () => 'expandable heading',
  figcaption: () => 'caption',
  blockquote: () => 'quote',
  label: () => 'label',
  small: () => 'small text',
};
const limit = 150;
const tagOf = (node: TemplateAst) =>
  typeof node === 'string' ? null : 'f' in node ? 'span' : node.t;
const describe = (node: AstNode) =>
  node.t + (node.a.class ? '.' + node.a.class.trim().split(/\s+/)[0] : '');

/** Outline one template layer as the page renders it. */
export function outlineLayer(
  layer: PageLayer,
  context: RenderContext,
  text: (fieldId: string) => string,
  layout?: Pick<CanvasNode, 'src' | 'links'>,
): OutlineItem[] {
  const items: OutlineItem[] = [];
  // Rendered structure: [data-layer-id] > div.template-section-content > root.
  const base = `[data-layer-id="${layer.id}"] > div:nth-of-type(1)`;
  function content(node: TemplateAst, fields: string[]): string {
    if (typeof node === 'string') return node;
    if ('f' in node) {
      fields.push(node.f);
      return text(node.f);
    }
    if (node.t === 'svg') return '';
    const shown = transformNode(node, context);
    return shown ? shown.c.map((c) => content(c, fields)).join(' ') : '';
  }
  function walk(
    node: AstNode,
    selector: string,
    linkPath: string,
    ancestors: string[],
    listedAbove: boolean,
  ) {
    if (items.length >= limit) return;
    if (node.t === 'svg') {
      items.push({
        selector,
        role: 'illustration (SVG artwork, not editable as elements)',
        within: ancestors.slice(-2).join(' › ') || undefined,
      });
      return;
    }
    const directField = node.c.some((c) => typeof c === 'object' && 'f' in c);
    const role = semantic[node.t]?.(node);
    const listed = Boolean(role) || (directField && !listedAbove);
    if (listed) {
      const fieldIds: string[] = [];
      const words = content(node, fieldIds).replace(/\s+/g, ' ').trim();
      const item: OutlineItem = {
        selector,
        role: role || 'text (' + describe(node) + ')',
        ...(words ? { text: words.slice(0, 160) } : {}),
        ...(fieldIds.length ? { fieldIds } : {}),
        within: ancestors.slice(-2).join(' › ') || undefined,
      };
      if (node.t === 'a') {
        item.linkKey = linkPath;
        item.href = layout?.links?.[linkPath] || node.a.href || '';
      }
      if (node.t === 'img') {
        item.src = layout?.src || node.a.src || '';
        item.alt = node.a.alt || '';
      }
      items.push(item);
    }
    // Children as rendered: text fields become spans; hidden nodes vanish.
    const counts = new Map<string, number>();
    node.c.forEach((child, index) => {
      const shown =
        isNode(child) && child.t !== 'svg'
          ? transformNode(child, context)
          : child;
      if (!shown) return;
      const tag = tagOf(shown);
      if (!tag) return;
      const nth = (counts.get(tag) || 0) + 1;
      counts.set(tag, nth);
      if (!isNode(shown)) return;
      walk(
        shown,
        `${selector} > ${tag}:nth-of-type(${nth})`,
        linkPath + '-' + index,
        node.a.class ? [...ancestors, describe(node)] : ancestors,
        listedAbove || listed,
      );
    });
  }
  if (isNode(layer.ast)) {
    const root = transformNode(layer.ast, context);
    if (root)
      walk(root, `${base} > ${root.t}:nth-of-type(1)`, 'link-0', [], false);
  }
  return items;
}

/** Selectors for a section the team added (rendered by media-block.tsx). */
export function customSelectors(node: CanvasNode) {
  const section = `[data-layer-id="${node.id}"]`;
  const block = `${section} > div:nth-of-type(1)`;
  return {
    section,
    ...(node.title && !['button', 'section'].includes(node.kind)
      ? {
          heading: `${block} > h${node.headingLevel === 3 ? 3 : 2}:nth-of-type(1)`,
        }
      : {}),
    ...(node.kind === 'text' ? { body: `${block} > div:nth-of-type(1)` } : {}),
    // media-block.tsx: the accordion is the block's first div.
    ...(node.kind === 'accordion'
      ? {
          items: (node.items || []).map((item, index) => {
            const details = `${block} > div:nth-of-type(1) > details:nth-of-type(${index + 1})`;
            return {
              id: item.id,
              summary: `${details} > summary:nth-of-type(1)`,
              body: `${details} > div:nth-of-type(1)`,
            };
          }),
        }
      : {}),
  };
}
