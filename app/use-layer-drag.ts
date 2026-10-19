'use client';
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent,
} from 'react';
import {
  createDragSession,
  findDropMark,
  targetBefore,
  type DropMark,
  type DragPoint,
} from './drag-session';
import { nodeLocked, type CanvasLayout } from './canvas-schema';
import { moveBefore } from './studio-engine';

export function useLayerDrag(
  layout: CanvasLayout,
  selected: string[],
  disabled: boolean,
  onMove: (layout: CanvasLayout) => void,
) {
  const latest = useRef({ layout, selected, disabled, onMove });
  useLayoutEffect(() => {
    latest.current = { layout, selected, disabled, onMove };
  }, [layout, selected, disabled, onMove]);
  const cleanup = useRef<(() => void) | null>(null),
    suppressUntil = useRef(0);
  const [visual, setVisual] = useState<{
    point: DragPoint;
    mark: DropMark | null;
    ids: string[];
  } | null>(null);
  useEffect(() => () => cleanup.current?.(), []);
  function start(event: PointerEvent<HTMLElement>, id: string) {
    const value = latest.current;
    if (event.button !== 0 || value.disabled || nodeLocked(value.layout, id))
      return;
    cleanup.current?.();
    suppressUntil.current = 0;
    const parentId = value.layout.nodes.find((n) => n.id === id)?.parentId;
    const siblings = new Set(
      value.layout.nodes
        .filter((n) => n.parentId === parentId)
        .map((n) => n.id),
    );
    const ids = (value.selected.includes(id) ? value.selected : [id]).filter(
      (id) =>
        value.layout.nodes.some(
          (n) =>
            n.id === id &&
            n.parentId === parentId &&
            !nodeLocked(value.layout, n.id),
        ),
    );
    let point = { x: event.clientX, y: event.clientY },
      frame = 0,
      scroll: HTMLElement | null = null;
    const pointerId = event.pointerId;
    const hit = (p: DragPoint) => {
      const under = document.elementFromPoint(p.x, p.y);
      const region = under?.closest<HTMLElement>(
        '.studio-layer-list,.studio-stage',
      );
      scroll = region || null;
      if (!region) return null;
      const selector = region.classList.contains('studio-layer-list')
        ? '[data-studio-layer]'
        : '.studio-canvas [data-layer-id]';
      const rects = Array.from(region.querySelectorAll<HTMLElement>(selector))
        .filter((el) =>
          siblings.has(el.dataset.studioLayer || el.dataset.layerId || ''),
        )
        .map((el) => {
          const rect = el.getBoundingClientRect();
          return {
            id: el.dataset.studioLayer || el.dataset.layerId!,
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height,
          };
        });
      return findDropMark(rects, ids, p);
    };
    const session = createDragSession(point, pointerId, {
      hit,
      update: (point, mark) => {
        setVisual({ point, mark, ids });
        document.body.classList.add('studio-dragging');
      },
      commit: (mark) => {
        const v = latest.current;
        if (!v.disabled && v.layout.order.includes(mark.id))
          v.onMove(
            moveBefore(
              v.layout,
              ids,
              targetBefore(
                v.layout.order.filter(
                  (id) =>
                    v.layout.nodes.find((n) => n.id === id)?.parentId ===
                    parentId,
                ),
                ids,
                mark,
              ),
            ),
          );
      },
      finish: (moved) => {
        if (moved) suppressUntil.current = Date.now() + 350;
        stop();
        setVisual(null);
        document.body.classList.remove('studio-dragging');
      },
    });
    const move = (e: globalThis.PointerEvent) => {
      if (e.pointerId !== pointerId) return;
      point = { x: e.clientX, y: e.clientY };
      session.move(point, e.pointerId);
      if (e.cancelable) e.preventDefault();
    };
    const up = (e: globalThis.PointerEvent) =>
      session.release({ x: e.clientX, y: e.clientY }, e.pointerId);
    const cancel = () => session.cancel();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        session.cancel();
      }
    };
    const tick = () => {
      if (scroll) {
        const bounds = scroll.getBoundingClientRect();
        const delta =
          point.y < bounds.top + 40
            ? -12
            : point.y > bounds.bottom - 40
              ? 12
              : 0;
        if (delta) {
          scroll.scrollTop += delta;
          session.move(point);
        }
      }
      frame = requestAnimationFrame(tick);
    };
    function stop() {
      cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('blur', cancel);
      window.removeEventListener('keydown', key);
      cleanup.current = null;
    }
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('blur', cancel);
    window.addEventListener('keydown', key);
    frame = requestAnimationFrame(tick);
    cleanup.current = () => {
      stop();
      document.body.classList.remove('studio-dragging');
    };
    event.currentTarget.setPointerCapture?.(pointerId);
  }
  return {
    start,
    visual,
    suppressClick: () => Date.now() < suppressUntil.current,
  };
}
