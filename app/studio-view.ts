import type { CanvasLayout, CanvasNode } from './canvas-schema';

export function layerBreadcrumb(
  layout: CanvasLayout,
  id?: string,
): CanvasNode[] {
  const path: CanvasNode[] = [],
    seen = new Set<string>();
  while (id && !seen.has(id)) {
    seen.add(id);
    const node = layout.nodes.find((n) => n.id === id);
    if (!node) break;
    path.unshift(node);
    id = node.parentId;
  }
  return path;
}

/** Keep matching nodes and their ancestors so search never loses context. */
export function filterLayerIds(
  layout: CanvasLayout,
  query: string,
  kind: string,
) {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length && kind === 'all') return null;
  const ids = new Set<string>();
  for (const node of layout.nodes) {
    const text = [
      node.name,
      node.title,
      node.kind,
      node.alt,
      ...(node.items || []).map((i) => i.title),
    ]
      .join(' ')
      .toLowerCase();
    if (
      (kind === 'all' || node.kind === kind) &&
      words.every((w) => text.includes(w))
    )
      for (const ancestor of layerBreadcrumb(layout, node.id))
        ids.add(ancestor.id);
  }
  return ids;
}
