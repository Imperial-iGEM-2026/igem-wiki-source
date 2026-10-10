export type DropMark = {
  id: string;
  edge: 'before' | 'after';
  left: number;
  top: number;
  width: number;
};
export type DragPoint = { x: number; y: number };
export type LayerRect = {
  id: string;
  left: number;
  top: number;
  width: number;
  height: number;
};
export function findDropMark(
  rects: LayerRect[],
  moving: string[],
  point: DragPoint,
): DropMark | null {
  let best: DropMark | null = null,
    distance = Infinity;
  for (const r of rects) {
    if (moving.includes(r.id)) continue;
    const edge = point.y < r.top + r.height / 2 ? 'before' : 'after',
      top = edge === 'before' ? r.top : r.top + r.height;
    const dx = Math.max(r.left - point.x, 0, point.x - (r.left + r.width));
    const d = Math.abs(point.y - top) + dx * 2;
    if (d < distance) {
      distance = d;
      best = { id: r.id, edge, left: r.left, top, width: r.width };
    }
  }
  return best;
}
export function targetBefore(
  order: string[],
  moving: string[],
  mark: DropMark,
): string | null {
  if (mark.edge === 'before') return mark.id;
  return (
    order
      .slice(order.indexOf(mark.id) + 1)
      .find((id) => !moving.includes(id)) || null
  );
}
// Framework-independent pointer state machine so movement, cancellation and
// release can be tested without substituting click-to-move for a real drag.
export function createDragSession(
  start: DragPoint,
  pointerId: number,
  callbacks: {
    hit: (point: DragPoint) => DropMark | null;
    update: (point: DragPoint, mark: DropMark | null) => void;
    commit: (mark: DropMark) => void;
    finish: (moved: boolean) => void;
  },
) {
  let moved = false,
    ended = false,
    mark: DropMark | null = null;
  return {
    move(point: DragPoint, id = pointerId) {
      if (ended || id !== pointerId) return;
      if (!moved && Math.hypot(point.x - start.x, point.y - start.y) < 5)
        return;
      moved = true;
      mark = callbacks.hit(point);
      callbacks.update(point, mark);
    },
    release(point: DragPoint, id = pointerId) {
      if (ended || id !== pointerId) return;
      ended = true;
      if (moved) {
        mark = callbacks.hit(point);
        if (mark) callbacks.commit(mark);
      }
      callbacks.finish(moved);
    },
    cancel() {
      if (ended) return;
      ended = true;
      callbacks.finish(moved);
    },
  };
}
