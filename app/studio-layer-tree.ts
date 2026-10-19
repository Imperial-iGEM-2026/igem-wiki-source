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
  const closed = new Set(collapsed);
  const children = new Map<
    string | undefined,
    Map<string | undefined, string[]>
  >();
  for (const id of layout.order) {
    const node = nodes.get(id);
    if (!node || node.deleted) continue;
    let items = children.get(node.parentId);
    if (!items) children.set(node.parentId, (items = new Map()));
    let group = items.get(node.parentItemId);
    if (!group) items.set(node.parentItemId, (group = []));
    group.push(id);
  }
  const visit = (parentId?: string, parentItemId?: string, depth = 0) => {
    for (const id of children.get(parentId)?.get(parentItemId) || []) {
      const node = nodes.get(id)!;
      if (seen.has(id)) continue;
      seen.add(id);
      rows.push({ type: 'layer', id, depth });
      if (closed.has(id)) continue;
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
