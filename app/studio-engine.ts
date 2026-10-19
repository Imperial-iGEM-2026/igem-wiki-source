import { isSponsorLayer } from './sponsor-layers';
import {
  validateLayout,
  nodeLocked,
  descendants,
  newNode,
  CUSTOM_CONTENT,
  CUSTOM_HEADING,
  type CanvasLayout,
  type CanvasNode,
} from './canvas-schema';
export type BuiltinInfo = {
  id: string;
  label: string;
  defaults?: Partial<CanvasNode>;
  linkPath?: string;
};
// Inserting a child must never convert its parent to free positioning: existing
// flow children have no coordinates and would all land at the same default spot.
export function insertNode(
  layout: CanvasLayout,
  node: CanvasNode,
  options: {
    inside?: string;
    insideItem?: string;
    after?: string;
    renderedHeights?: Record<string, number>;
  } = {},
): CanvasLayout {
  const parentId =
    options.inside ??
    (layout.nodes.some((n) => n.id === CUSTOM_CONTENT)
      ? CUSTOM_CONTENT
      : undefined);
  const parent = layout.nodes.find((n) => n.id === parentId);
  if (
    parentId &&
    (!parent ||
      !['section', 'template', 'accordion', 'text'].includes(parent.kind))
  )
    throw Error('Choose a section to insert into.');
  if (parent?.kind === 'accordion' || options.insideItem !== undefined) {
    if (
      parent?.kind !== 'accordion' ||
      !parent.items?.some((item) => item.id === options.insideItem)
    )
      throw Error('Choose a subsection inside this collapsible element.');
  }
  if (parentId && nodeLocked(layout, parentId))
    throw Error('Unlock the section before adding content.');
  if (layout.nodes.some((n) => n.id === node.id))
    throw Error('That element already exists.');
  const inserted = { ...node, parentId, parentItemId: options.insideItem };
  if (parent?.layoutMode === 'free' && parent.kind !== 'accordion') {
    const height = (n: CanvasNode): number =>
      Math.max(
        n.freeHeight ?? 80,
        n.minHeight ?? 0,
        options.renderedHeights?.[n.id] ?? 0,
        n.layoutMode === 'free'
          ? Math.max(
              320,
              ...layout.nodes
                .filter((c) => c.parentId === n.id)
                .map((c) => (c.y ?? 20) + height(c) + 30),
            ) +
              2 * (n.paddingY ?? n.padding)
          : 0,
      );
    Object.assign(inserted, {
      x: 5,
      y: Math.max(
        20,
        ...layout.nodes
          .filter((n) => n.parentId === parentId)
          .map((n) => (n.y ?? 20) + height(n) + (n.marginBottom ?? 0) + 24),
      ),
      freeWidth: node.freeWidth ?? 60,
      freeHeight:
        node.freeHeight ??
        Math.max(
          node.minHeight ?? 0,
          node.kind === 'button'
            ? 44
            : node.kind === 'pdf'
              ? 600
              : ['section', 'html', 'video', 'model', 'embed'].includes(
                    node.kind,
                  )
                ? 360
                : node.kind === 'image'
                  ? 240
                  : 120,
        ),
    });
  }
  // Resolve a nested selection to a sibling in the destination container.
  let anchor = layout.nodes.find((n) => n.id === options.after);
  while (anchor?.parentId && anchor.parentId !== parentId)
    anchor = layout.nodes.find((n) => n.id === anchor!.parentId);
  const index =
    anchor &&
    anchor.parentId === parentId &&
    anchor.parentItemId === options.insideItem
      ? layout.order.indexOf(anchor.id)
      : -1;
  const order = [...layout.order];
  order.splice(index < 0 ? order.length : index + 1, 0, node.id);
  return { ...layout, nodes: [...layout.nodes, inserted], order };
}
export function materialize(
  layout: CanvasLayout,
  builtins: BuiltinInfo[],
): CanvasLayout {
  // A team page gaining its template layout: its sections move into the
  // content column once, so older pages match newly created ones.
  const adopt =
    builtins.some((b) => b.id === CUSTOM_CONTENT) &&
    !layout.nodes.some((n) => n.id === CUSTOM_CONTENT);
  // Older pages opened with a text block repeating the page title, which the
  // page heading (labelled with the title) now shows.
  const title = builtins.find((b) => b.id === CUSTOM_HEADING)?.label;
  const nodes = layout.nodes.map((n) =>
    adopt && !n.parentId && n.kind !== 'template'
      ? {
          ...n,
          parentId: CUSTOM_CONTENT,
          ...(n.id === 'custom-intro' && n.title === title
            ? { title: '' }
            : {}),
        }
      : n,
  );
  const indices = new Map(nodes.map((node, index) => [node.id, index]));
  for (const item of builtins) {
    const index = indices.get(item.id) ?? -1;
    if (index >= 0 && item.defaults?.kind === 'image')
      nodes[index] = { ...item.defaults, ...nodes[index] };
    if (index < 0) {
      const parentIndex = indices.get(item.defaults?.parentId || '');
      const parent = parentIndex === undefined ? undefined : nodes[parentIndex];
      indices.set(item.id, nodes.length);
      nodes.push({
        ...newNode(item.id, 'template', item.label),
        name: item.label,
        ...item.defaults,
        ...(item.defaults?.kind === 'image'
          ? {
              src: parent?.src || item.defaults.src || '',
              linkTo:
                parent?.links?.[item.linkPath || ''] || item.defaults.linkTo,
            }
          : {}),
      });
    }
  }
  const valid = new Set(nodes.map((n) => n.id));
  const ordered = new Set<string>();
  const order = [
    ...layout.order,
    ...builtins.map((b) => b.id),
    ...nodes.map((n) => n.id),
  ].filter((id) => {
    if (!valid.has(id) || ordered.has(id)) return false;
    ordered.add(id);
    return true;
  });
  // Upgrade old overlays: original logos precede previously added images.
  const sponsorParents = new Set(
    builtins
      .filter((b) => isSponsorLayer(b.id))
      .map((b) => b.defaults?.parentId),
  );
  for (const parent of sponsorParents) {
    if (layout.nodes.some((n) => n.parentId === parent && isSponsorLayer(n.id)))
      continue;
    const originals = builtins
      .filter((b) => b.defaults?.parentId === parent && isSponsorLayer(b.id))
      .map((b) => b.id);
    const firstAdded = order.find(
      (id) =>
        !originals.includes(id) &&
        nodes.find((n) => n.id === id)?.parentId === parent,
    );
    if (!firstAdded) continue;
    for (const id of originals) order.splice(order.indexOf(id), 1);
    order.splice(order.indexOf(firstAdded), 0, ...originals);
  }
  return { ...layout, nodes, order };
}
export const same = (a: unknown, b: unknown) =>
  a === b || JSON.stringify(a) === JSON.stringify(b);
export function patchNodes(
  layout: CanvasLayout,
  ids: string[],
  changes: Partial<CanvasNode>,
  allowLocked = false,
): CanvasLayout {
  // Removing a subsection also removes its nested elements as one undoable edit.
  const removed = new Set(
    descendants(
      layout,
      layout.nodes
        .filter(
          (n) =>
            n.parentItemId &&
            ids.includes(n.parentId || '') &&
            !nodeLocked(layout, n.parentId!) &&
            changes.items !== undefined &&
            !changes.items.some((item) => item.id === n.parentItemId),
        )
        .map((n) => n.id),
    ),
  );
  if ([...removed].some((id) => nodeLocked(layout, id))) return layout;
  return {
    ...layout,
    order: layout.order.filter((id) => !removed.has(id)),
    nodes: layout.nodes
      .filter((n) => !removed.has(n.id))
      .map((n) =>
        ids.includes(n.id) && (!nodeLocked(layout, n.id) || allowLocked)
          ? { ...n, ...changes }
          : n,
      ),
  };
}
export function moveBefore(
  layout: CanvasLayout,
  ids: string[],
  target: string | null,
): CanvasLayout {
  const movable = ids.filter((id) => !nodeLocked(layout, id));
  if (target && movable.includes(target)) return layout;
  if (
    target &&
    movable.some(
      (id) =>
        layout.nodes.find((n) => n.id === id)?.parentId !==
          layout.nodes.find((n) => n.id === target)?.parentId ||
        layout.nodes.find((n) => n.id === id)?.parentItemId !==
          layout.nodes.find((n) => n.id === target)?.parentItemId,
    )
  )
    return layout;
  const moving = layout.order.filter((id) => movable.includes(id)),
    order = layout.order.filter((id) => !movable.includes(id));
  const index = target ? order.indexOf(target) : order.length;
  if (index < 0) return layout;
  order.splice(index, 0, ...moving);
  return { ...layout, order };
}
export const snapSpan = (
  start: number,
  delta: number,
  width: number,
  gap: number,
) =>
  Math.max(1, Math.min(12, Math.round(start + delta / ((width + gap) / 12))));
export function removeNodes(layout: CanvasLayout, ids: string[]): CanvasLayout {
  const roots = ids.filter((id) => !nodeLocked(layout, id));
  if (descendants(layout, roots).some((id) => nodeLocked(layout, id)))
    return layout;
  // Preserve built-in IDs so materialize cannot recreate deleted template sections.
  // Descendants stay with the tombstone for Undo, but leave the canvas and layer list.
  const tombstones = new Set(
    descendants(
      layout,
      roots.filter((id) => {
        const node = layout.nodes.find((n) => n.id === id);
        return node?.kind === 'template' || isSponsorLayer(id);
      }),
    ),
  );
  const removed = new Set(
    layout.nodes
      .filter(
        (n) =>
          ids.includes(n.id) &&
          !nodeLocked(layout, n.id) &&
          n.kind !== 'template' &&
          !isSponsorLayer(n.id),
      )
      .map((n) => n.id),
  );
  for (const id of descendants(layout, [...removed])) {
    if (nodeLocked(layout, id)) return layout;
    removed.add(id);
  }
  return {
    ...layout,
    order: layout.order.filter((id) => !removed.has(id)),
    nodes: layout.nodes
      .filter((n) => !removed.has(n.id))
      .map((n) =>
        tombstones.has(n.id) ? { ...n, hidden: true, deleted: true } : n,
      ),
  };
}
export function duplicateNodes(
  layout: CanvasLayout,
  ids: string[],
  newId: () => string,
): { layout: CanvasLayout; ids: string[] } {
  const copies: CanvasNode[] = [],
    order = [...layout.order];
  const roots = ids.filter(
    (id) =>
      !nodeLocked(layout, id) &&
      layout.nodes.find((n) => n.id === id)?.kind !== 'template',
  );
  const source = descendants(layout, roots);
  if (source.some((id) => nodeLocked(layout, id)))
    throw Error('Unlock nested layers before duplicating the section.');
  const mapping = new Map(source.map((id) => [id, newId()]));
  for (const id of layout.order) {
    if (!mapping.has(id)) continue;
    const node = layout.nodes.find((n) => n.id === id)!;
    const copy = {
      ...node,
      id: mapping.get(id)!,
      ...(node.parentId
        ? { parentId: mapping.get(node.parentId) || node.parentId }
        : {}),
      name: (node.name || node.title || node.kind).slice(0, 95) + ' copy',
    };
    copies.push(copy);
    order.splice(order.indexOf(id) + 1, 0, copy.id);
  }
  return {
    layout: { ...layout, order, nodes: [...layout.nodes, ...copies] },
    ids: roots.map((id) => mapping.get(id)!),
  };
}
// Merge disjoint changes at individual property level. Conflicting values remain local
// until the editor explicitly resolves them; remote-only updates are never discarded.
export function mergeLayouts(
  base: CanvasLayout,
  local: CanvasLayout,
  remote: CanvasLayout,
): { layout: CanvasLayout; conflicts: string[] } {
  const conflicts: string[] = [];
  function pick<T>(b: T, l: T, r: T, label: string): T {
    if (same(l, b)) return r;
    if (same(r, b) || same(l, r)) return l;
    conflicts.push(label);
    return l;
  }
  const ids = new Set(
      [...base.nodes, ...local.nodes, ...remote.nodes].map((n) => n.id),
    ),
    nodes: CanvasNode[] = [];
  for (const id of ids) {
    const b = base.nodes.find((n) => n.id === id),
      l = local.nodes.find((n) => n.id === id),
      r = remote.nodes.find((n) => n.id === id);
    if (!b || !l || !r) {
      const n = pick(b, l, r, id);
      if (n) nodes.push(n);
      continue;
    }
    const merged = { ...r } as Record<string, unknown>;
    for (const key of new Set([
      ...Object.keys(b),
      ...Object.keys(l),
      ...Object.keys(r),
    ])) {
      const value = pick(
        (b as unknown as Record<string, unknown>)[key],
        (l as unknown as Record<string, unknown>)[key],
        (r as unknown as Record<string, unknown>)[key],
        `${l.name || l.title || id} · ${key}`,
      );
      if (value === undefined) delete merged[key];
      else merged[key] = value;
    }
    nodes.push(merged as CanvasNode);
  }
  // Compare the shared original order separately so simultaneous insertions can merge.
  const shared = new Set(
    base.order.filter(
      (id) => local.order.includes(id) && remote.order.includes(id),
    ),
  );
  const order = pick(
    base.order.filter((id) => shared.has(id)),
    local.order.filter((id) => shared.has(id)),
    remote.order.filter((id) => shared.has(id)),
    'Layer order',
  );
  for (const list of [remote.order, local.order])
    for (let i = 0; i < list.length; i++)
      if (!order.includes(list[i])) {
        const before = list.slice(i + 1).find((id) => order.includes(id));
        order.splice(before ? order.indexOf(before) : order.length, 0, list[i]);
      }
  const valid = new Set(nodes.map((n) => n.id));
  const result = {
    layout: {
      customCss: pick(
        base.customCss,
        local.customCss,
        remote.customCss,
        'Custom CSS',
      ),
      gap: pick(base.gap, local.gap, remote.gap, 'Page gap'),
      width: pick(base.width, local.width, remote.width, 'Page width'),
      sidebar: pick(
        base.sidebar,
        local.sidebar,
        remote.sidebar,
        'Contents sidebar',
      ),
      nodes,
      order: order.filter((id) => valid.has(id)),
    },
    conflicts,
  };
  if (!validateLayout(result.layout))
    return {
      layout: local,
      conflicts: [...conflicts, 'Nested layer hierarchy'],
    };
  return result;
}
export type History = {
  current: CanvasLayout;
  past: CanvasLayout[];
  future: CanvasLayout[];
  group?: string;
};
export type HistoryAction =
  | { type: 'edit'; value: CanvasLayout; group?: string }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'end' }
  | { type: 'reset'; value: CanvasLayout; previous?: CanvasLayout }
  | { type: 'rebase'; base: CanvasLayout; remote: CanvasLayout };
export function historyReducer(state: History, action: HistoryAction): History {
  if (action.type === 'end') return { ...state, group: undefined };
  if (action.type === 'reset')
    return {
      current: action.value,
      past: action.previous ? [action.previous] : [],
      future: [],
    };
  if (action.type === 'rebase') {
    // A teammate's live change is folded into every undo/redo step, so Undo
    // reverts only your own edits and never removes their work.
    const fold = (layout: CanvasLayout) =>
      mergeLayouts(action.base, layout, action.remote).layout;
    return {
      current: fold(state.current),
      past: state.past.map(fold),
      future: state.future.map(fold),
      group: state.group,
    };
  }
  if (action.type === 'undo') {
    if (!state.past.length) return state;
    return {
      current: state.past.at(-1)!,
      past: state.past.slice(0, -1),
      future: [state.current, ...state.future],
    };
  }
  if (action.type === 'redo') {
    if (!state.future.length) return state;
    return {
      current: state.future[0],
      past: [...state.past, state.current].slice(-50),
      future: state.future.slice(1),
    };
  }
  if (same(state.current, action.value)) return state;
  return {
    current: action.value,
    past:
      action.group && action.group === state.group
        ? state.past
        : [...state.past, state.current].slice(-50),
    future: [],
    group: action.group,
  };
}

export function freePlacement(
  node: CanvasNode,
  dx: number,
  dy: number,
  resize = false,
): Partial<CanvasNode> {
  return resize
    ? {
        freeWidth: Math.max(
          5,
          Math.min(
            Math.max(5, 100 - (node.x ?? 5)),
            (node.freeWidth ?? 40) + dx,
          ),
        ),
        freeHeight: Math.max(20, Math.min(2000, (node.freeHeight ?? 80) + dy)),
      }
    : {
        x: Math.max(
          0,
          Math.min(
            Math.max(0, 100 - (node.freeWidth ?? 40)),
            (node.x ?? 5) + dx,
          ),
        ),
        y: Math.max(0, (node.y ?? 20) + dy),
      };
}

/** Stack overlapping siblings without changing their reading order or positions. */
export function stackNode(
  layout: CanvasLayout,
  id: string,
  direction: 'front' | 'back',
): CanvasLayout {
  const node = layout.nodes.find((n) => n.id === id);
  if (!node || nodeLocked(layout, id)) return layout;
  const siblings = layout.nodes.filter(
    (n) =>
      n.id !== id &&
      n.parentId === node.parentId &&
      n.parentItemId === node.parentItemId,
  );
  if (!siblings.length) return layout;
  const levels = siblings.map((n) => n.zIndex ?? 0);
  const zIndex =
    direction === 'front' ? Math.max(...levels) + 1 : Math.min(...levels) - 1;
  if (Math.abs(zIndex) > 1000000)
    throw Error('Layer order is out of range. Reset layer order in Layout.');
  return patchNodes(layout, [id], { zIndex });
}
