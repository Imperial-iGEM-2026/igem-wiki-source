import type { TemplateAst } from './templates';
import type { PageLayer } from './template-transform';

export const isSponsorLayer = (id: string) =>
  id.startsWith('template-sponsor-');
const element = (
  node: TemplateAst,
): node is Extract<TemplateAst, { t: string }> =>
  typeof node === 'object' && 't' in node;
const imageIn = (
  node: TemplateAst,
): Extract<TemplateAst, { t: string }> | undefined => {
  if (!element(node)) return;
  if (node.t === 'img') return node;
  for (const child of node.c) {
    const image = imageIn(child);
    if (image) return image;
  }
};
const hasGrid = (node: TemplateAst): boolean =>
  element(node) &&
  (/\bsponsor-grid\b/.test(node.a.class || '') || node.c.some(hasGrid));

// Keep the original sponsor markup and responsive grid, but expose its images
// as stable child layers. Existing projects gain these without a data rewrite.
export function sponsorLayers(layers: PageLayer[]): PageLayer[] {
  return layers.flatMap((layer) => {
    if (!hasGrid(layer.ast)) return [layer];
    const logos: PageLayer[] = [];
    const walk = (
      node: TemplateAst,
      inGrid = false,
      linkPath = 'link-0',
    ): TemplateAst => {
      if (!element(node)) return node;
      const grid = /\bsponsor-grid\b/.test(node.a.class || '');
      const image = node.t === 'a' ? imageIn(node) : undefined;
      if (image) {
        const id = `template-sponsor-${layer.id}-${logos.length}`;
        logos.push({
          id,
          label: image.a.alt || node.a['aria-label'] || 'Sponsor logo',
          region: layer.region,
          ast: node,
          linkPath,
          sponsorSlot: inGrid ? 'grid' : 'fixed',
          defaults: {
            kind: 'image',
            parentId: layer.id,
            src: image.a.src,
            linkTo: node.a.href,
            alt: image.a.alt || '',
            objectFit: 'contain',
          },
        });
        return { t: 'span', a: { 'data-canvas-slot': id }, c: [] };
      }
      const children = node.c.map((child, index) =>
        walk(child, inGrid || grid, linkPath + '-' + index),
      );
      return {
        ...node,
        a: { ...node.a, ...(grid ? { 'data-sponsor-grid': layer.id } : {}) },
        c: grid ? [] : children,
      };
    };
    const ast = walk(layer.ast);
    return [{ ...layer, ast, sponsorGrid: true }, ...logos];
  });
}
