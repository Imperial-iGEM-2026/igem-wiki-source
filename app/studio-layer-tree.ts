import type { AccordionItem, CanvasLayout } from './canvas-schema';
export type LayerTreeRow = { id: string; depth: number } & (
  | { type: 'layer' }
  | { type: 'item'; item: AccordionItem; index: number }
  | { type: 'add-item' }
);
// Keep subsection children alongside their own title, even after reordering items.
export function layerTreeRows(
  layout: CanvasLayout,
  collapsed: string[],
): LayerTreeRow[] {
  const rows: LayerTreeRow[] = [];
  const seen = new Set<string>();
  const nodes = new Map(layout.nodes.map((node) => [node.id, node]));
  const visit = (parentId?: string, parentItemId?: string, depth = 0) => {
    for (const id of layout.order) {
      const node = nodes.get(id);
      if (
        !node ||
        node.deleted ||
        seen.has(id) ||
        node.parentId !== parentId ||
        node.parentItemId !== parentItemId
      )
        continue;
      seen.add(id);
      rows.push({ type: 'layer', id, depth });
      if (collapsed.includes(id)) continue;
      if (node.kind === 'accordion') {
        (node.items || []).forEach((item, index) => {
          rows.push({ type: 'item', id, item, index, depth: depth + 1 });
          visit(id, item.id, depth + 2);
        });
        rows.push({ type: 'add-item', id, depth: depth + 1 });
      } else visit(id, undefined, depth + 1);
    }
  };
  visit();
  return rows;
}
