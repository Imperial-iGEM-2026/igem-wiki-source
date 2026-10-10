'use client';
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from 'react';
import { pickDesignTarget, type DesignTarget } from './studio-target';
export function translationPixels(element: Element): [number, number] {
  const style = getComputedStyle(element);
  const parts = style.translate.split(/\s+/);
  const size = [parseFloat(style.width) || 0, parseFloat(style.height) || 0];
  return [0, 1].map((i) => {
    const part = parts[i] || '0';
    const value = parseFloat(part) || 0;
    return part.endsWith('%') ? (value * size[i]) / 100 : value;
  }) as [number, number];
}

type MoveOptions = {
  artboard: RefObject<HTMLDivElement | null>;
  target: DesignTarget | null;
  zoom: number;
  disabled: boolean;
  canMove: (id: string) => boolean;
  onSelect: (target: DesignTarget) => void;
  onMove: (target: DesignTarget, x: number, y: number) => void;
};
/** Direct canvas dragging. Only the selected DOM box changes during a gesture. */
export function useCanvasObjectMove(options: MoveOptions) {
  const latest = useRef(options);
  useLayoutEffect(() => {
    latest.current = options;
  });
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    const board = options.artboard.current;
    if (!board || options.disabled) return;
    let cleanup: (() => void) | null = null;
    let suppressClick = false;
    const click = (e: MouseEvent) => {
      if (suppressClick) {
        e.preventDefault();
        e.stopImmediatePropagation();
        suppressClick = false;
      }
    };
    const down = (e: PointerEvent) => {
      const state = latest.current;
      if (
        state.disabled ||
        e.button !== 0 ||
        e.shiftKey ||
        e.ctrlKey ||
        e.metaKey
      )
        return;
      const clicked = e.target as Element;
      if (
        clicked.closest(
          'input,textarea,select,[contenteditable=true],.studio-section-handle,.studio-resize,.field-editor',
        )
      )
        return;
      const selected =
        state.target && board.querySelector<HTMLElement>(state.target.selector);
      const bounds = selected?.getBoundingClientRect();
      const onBorder =
        bounds &&
        e.clientX >= bounds.left - 5 &&
        e.clientX <= bounds.right + 5 &&
        e.clientY >= bounds.top - 5 &&
        e.clientY <= bounds.bottom + 5 &&
        (Math.abs(e.clientX - bounds.left) < 6 ||
          Math.abs(e.clientX - bounds.right) < 6 ||
          Math.abs(e.clientY - bounds.top) < 6 ||
          Math.abs(e.clientY - bounds.bottom) < 6);
      const withinSelection =
        selected &&
        !selected.hasAttribute('data-layer-id') &&
        selected.contains(clicked);
      let target =
        onBorder || withinSelection
          ? state.target
          : pickDesignTarget(clicked.closest('svg') || clicked);
      const pdfLayer = clicked.closest('[data-layer-kind="pdf"]');
      if (pdfLayer) target = pickDesignTarget(pdfLayer);
      if (!target || !state.canMove(target.layerId)) return;
      const element = board.querySelector<HTMLElement>(target.selector);
      if (!element) return;
      cleanup?.();
      suppressClick = false;
      e.preventDefault();
      e.stopPropagation();
      board.focus({ preventScroll: true });
      state.onSelect(target);
      const pointer = e.pointerId,
        startX = e.clientX,
        startY = e.clientY;
      const [baseX, baseY] = translationPixels(element);
      const inline = getComputedStyle(element).display === 'inline';
      const saved = ['translate', 'display'].map((property) => ({
        property,
        value: element.style.getPropertyValue(property),
        priority: element.style.getPropertyPriority(property),
      }));
      let dx = 0,
        dy = 0,
        frame = 0,
        moved = false;
      const paint = () => {
        frame = 0;
        if (inline)
          element.style.setProperty('display', 'inline-block', 'important');
        element.style.setProperty(
          'translate',
          `${baseX + dx}px ${baseY + dy}px`,
          'important',
        );
      };
      const move = (event: PointerEvent) => {
        if (event.pointerId !== pointer) return;
        if (latest.current.disabled) {
          cancel();
          return;
        }
        if (
          !moved &&
          Math.hypot(event.clientX - startX, event.clientY - startY) < 4
        )
          return;
        if (!moved) {
          moved = true;
          setDragging(true);
        }
        event.preventDefault();
        dx = Math.round((event.clientX - startX) / state.zoom);
        dy = Math.round((event.clientY - startY) / state.zoom);
        if (event.shiftKey) {
          if (Math.abs(dx) > Math.abs(dy)) dy = 0;
          else dx = 0;
        }
        if (!frame) frame = requestAnimationFrame(paint);
      };
      const clean = () => {
        cancelAnimationFrame(frame);
        window.removeEventListener('pointermove', move, true);
        window.removeEventListener('pointerup', up, true);
        window.removeEventListener('pointercancel', cancel, true);
        window.removeEventListener('blur', cancel);
        window.removeEventListener('keydown', escape, true);
        for (const item of saved) {
          if (item.value)
            element.style.setProperty(item.property, item.value, item.priority);
          else element.style.removeProperty(item.property);
        }
        cleanup = null;
        setDragging(false);
      };
      const up = (event: PointerEvent) => {
        if (event.pointerId !== pointer) return;
        clean();
        suppressClick = moved || Boolean(onBorder);
        if (moved && latest.current.canMove(target.layerId))
          latest.current.onMove(target, baseX + dx, baseY + dy);
      };
      const cancel = () => {
        suppressClick = moved;
        clean();
      };
      const escape = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopImmediatePropagation();
          cancel();
        }
      };
      cleanup = clean;
      window.addEventListener('pointermove', move, {
        capture: true,
        passive: false,
      });
      window.addEventListener('pointerup', up, true);
      window.addEventListener('pointercancel', cancel, true);
      window.addEventListener('blur', cancel);
      window.addEventListener('keydown', escape, true);
    };
    const key = (event: KeyboardEvent) => {
      const state = latest.current;
      if (
        state.disabled ||
        !state.target ||
        !state.canMove(state.target.layerId) ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        (event.target as Element).closest(
          'input,textarea,select,[contenteditable=true],.studio-section-handle,.studio-resize',
        )
      )
        return;
      if (
        !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)
      )
        return;
      const element = board.querySelector(state.target.selector);
      if (!element) return;
      event.preventDefault();
      event.stopPropagation();
      const [x, y] = translationPixels(element),
        step = event.shiftKey ? 10 : 1;
      state.onMove(
        state.target,
        x +
          (event.key === 'ArrowLeft'
            ? -step
            : event.key === 'ArrowRight'
              ? step
              : 0),
        y +
          (event.key === 'ArrowUp'
            ? -step
            : event.key === 'ArrowDown'
              ? step
              : 0),
      );
    };
    board.addEventListener('pointerdown', down, true);
    board.addEventListener('click', click, true);
    board.addEventListener('keydown', key);
    return () => {
      cleanup?.();
      board.removeEventListener('pointerdown', down, true);
      board.removeEventListener('click', click, true);
      board.removeEventListener('keydown', key);
    };
  }, [options.artboard, options.disabled]);
  return dragging;
}
