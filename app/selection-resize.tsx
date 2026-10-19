'use client';
import {
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import type { DesignTarget } from './studio-target';
import { translationPixels } from './selection-move';

/** Resize the selected content box, independently of its containing grid section. */
export function SelectionResize({
  target,
  artboard,
  stage,
  revision,
  zoom,
  onResize,
  onActive,
}: {
  target: DesignTarget;
  artboard: RefObject<HTMLDivElement | null>;
  stage: RefObject<HTMLDivElement | null>;
  revision: unknown;
  zoom: number;
  onResize: (target: DesignTarget, styles: Record<string, string>) => void;
  onActive: (active: boolean) => void;
}) {
  const [box, setBox] = useState<{
    left: number;
    right: number;
    top: number;
    bottom: number;
    image: boolean;
  } | null>(null);
  const cancel = useRef<(() => void) | null>(null);
  const latest = useRef({ onResize, onActive });
  useLayoutEffect(() => {
    latest.current = { onResize, onActive };
  });
  // A remote revision can refresh measurements during a drag. Only a change
  // of selection (or unmount) cancels the gesture, not a layout refresh.
  useLayoutEffect(() => () => cancel.current?.(), [target.selector]);
  useLayoutEffect(() => {
    const element = artboard.current?.querySelector<HTMLElement>(
      target.selector,
    );
    if (!element || element.hasAttribute('data-layer-id')) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const r = element.getBoundingClientRect(),
        clip = stage.current?.getBoundingClientRect();
      const midpoint = (r.top + r.bottom) / 2;
      // Reflow can move the midpoint outside the viewport. Keep the captured
      // handle mounted until release instead of losing the whole gesture.
      const top =
        cancel.current && clip
          ? Math.max(clip.top + 6, Math.min(clip.bottom - 6, midpoint))
          : midpoint;
      setBox(
        clip &&
          top >= clip.top &&
          top <= clip.bottom &&
          (cancel.current || (r.right > clip.left && r.left < clip.right))
          ? {
              left: Math.max(clip.left + 6, r.left),
              right: Math.min(clip.right - 6, r.right),
              top,
              bottom: Math.min(clip.bottom - 6, r.bottom),
              image: element.tagName === 'IMG',
            }
          : null,
      );
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(element);
    schedule();
    window.addEventListener('scroll', schedule, true);
    window.addEventListener('resize', schedule);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('scroll', schedule, true);
      window.removeEventListener('resize', schedule);
    };
  }, [artboard, stage, target.selector, revision, zoom]);

  function start(
    event: ReactPointerEvent<HTMLButtonElement>,
    edge: 'left' | 'right' | 'corner',
  ) {
    if (event.button !== 0) return;
    const element = artboard.current?.querySelector<HTMLElement>(
      target.selector,
    );
    if (!element) return;
    event.preventDefault();
    event.stopPropagation();
    const handle = event.currentTarget,
      pointer = event.pointerId,
      startX = event.clientX,
      startY = event.clientY;
    const rect = element.getBoundingClientRect();
    const initial = rect.width / zoom;
    const image = element.tagName === 'IMG';
    const ratio = rect.height > 0 ? rect.width / rect.height : 1;
    const [tx, ty] = translationPixels(element);
    const display = getComputedStyle(element).display;
    const properties = [
      'width',
      'height',
      'max-height',
      'max-width',
      'box-sizing',
      'display',
      'translate',
    ];
    const saved = properties.map((property) => ({
      property,
      value: element.style.getPropertyValue(property),
      priority: element.style.getPropertyPriority(property),
    }));
    let width = initial,
      moved = false,
      finished = false;
    const styles = () => ({
      width: `${width}px`,
      'max-width': image ? 'none' : '100%',
      ...(image ? { height: 'auto', 'max-height': 'none' } : {}),
      'box-sizing': 'border-box',
      ...(display === 'inline' ? { display: 'inline-block' } : {}),
      ...(edge === 'left'
        ? { translate: `${tx + initial - width}px ${ty}px` }
        : {}),
    });
    const move = (e: PointerEvent) => {
      if (e.pointerId !== pointer) return;
      const dx = (e.clientX - startX) / zoom;
      const dy = ((e.clientY - startY) / zoom) * ratio;
      const delta = edge === 'corner' && Math.abs(dy) > Math.abs(dx) ? dy : dx;
      if (!moved && Math.abs(delta) < 2) return;
      moved = true;
      width = Math.max(
        32,
        Math.round(initial + (edge === 'left' ? -delta : delta)),
      );
      for (const [property, value] of Object.entries(styles()))
        element.style.setProperty(property, value, 'important');
    };
    const finish = (commit: boolean) => {
      if (finished) return;
      finished = true;
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', up, true);
      window.removeEventListener('pointercancel', pointerCancel, true);
      window.removeEventListener('keydown', key, true);
      window.removeEventListener('blur', abort);
      cancel.current = null;
      for (const s of saved)
        if (s.value) element.style.setProperty(s.property, s.value, s.priority);
        else element.style.removeProperty(s.property);
      if (handle.hasPointerCapture(pointer))
        handle.releasePointerCapture(pointer);
      latest.current.onActive(false);
      if (commit && moved) latest.current.onResize(target, styles());
    };
    const up = (e: PointerEvent) => {
      if (e.pointerId === pointer) finish(true);
    };
    const abort = () => finish(false);
    const pointerCancel = (e: PointerEvent) => {
      if (e.pointerId === pointer) abort();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        abort();
      }
    };
    cancel.current = abort;
    handle.setPointerCapture(pointer);
    // Listen outside the handle: reflow or a DOM refresh can release capture.
    // Escape, pointercancel and blur still explicitly cancel the operation.
    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', pointerCancel, true);
    window.addEventListener('keydown', key, true);
    window.addEventListener('blur', abort);
    latest.current.onActive(true);
  }
  return (
    box && (
      <>
        {(box.image
          ? (['left', 'right', 'corner'] as const)
          : (['left', 'right'] as const)
        ).map((edge) => (
          <button
            key={edge}
            type="button"
            className={
              'studio-object-resize' +
              (edge === 'corner' ? ' studio-object-resize-corner' : '')
            }
            aria-label={`Resize selected ${box.image ? 'image' : 'text or element'} from ${edge}`}
            title={
              box.image
                ? 'Drag to resize the picture, keeping its proportions'
                : 'Drag to change this element’s width; text wraps automatically'
            }
            style={{
              left: edge === 'corner' ? box.right : box[edge],
              top: edge === 'corner' ? box.bottom : box.top,
            }}
            onPointerDown={(e) => start(e, edge)}
            onKeyDown={(e) => {
              if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
              e.preventDefault();
              e.stopPropagation();
              const element = artboard.current?.querySelector<HTMLElement>(
                target.selector,
              );
              if (!element) return;
              const width = element.getBoundingClientRect().width / zoom;
              const delta =
                (e.key === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? 10 : 1);
              const nextWidth = Math.max(
                32,
                width + (edge === 'left' ? -delta : delta),
              );
              const [tx, ty] = translationPixels(element);
              latest.current.onResize(target, {
                width: `${nextWidth}px`,
                ...(edge === 'left'
                  ? { translate: `${tx + width - nextWidth}px ${ty}px` }
                  : {}),
                'max-width': box.image ? 'none' : '100%',
                ...(box.image ? { height: 'auto', 'max-height': 'none' } : {}),
                'box-sizing': 'border-box',
                ...(getComputedStyle(element).display === 'inline'
                  ? { display: 'inline-block' }
                  : {}),
              });
            }}
          />
        ))}
      </>
    )
  );
}
