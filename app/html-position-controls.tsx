'use client';
import { useLayoutEffect, useState, type RefObject } from 'react';
import { StudioNumber } from './studio-number';
import { translationPixels } from './selection-move';

/** Pixel offsets use the same page CSS and breakpoint as canvas dragging. */
export function HtmlPositionControls({
  artboard,
  id,
  revision,
  viewport,
  disabled,
  onMove,
}: {
  artboard: RefObject<HTMLDivElement | null>;
  id: string;
  revision: unknown;
  viewport: number;
  disabled: boolean;
  onMove: (x: number, y: number) => void;
}) {
  const [offset, setOffset] = useState<[number, number]>([0, 0]);
  useLayoutEffect(() => {
    const frame = requestAnimationFrame(() => {
      const element = artboard.current?.querySelector(
        `[data-layer-id="${id}"]`,
      );
      if (element) setOffset(translationPixels(element));
    });
    return () => cancelAnimationFrame(frame);
  }, [artboard, id, revision, viewport]);
  return (
    <div>
      <div className="studio-grid">
        {['Horizontal offset (px)', 'Vertical offset (px)'].map(
          (label, index) => (
            <label key={label} className="studio-field">
              <span>{label}</span>
              <StudioNumber
                label={label}
                value={offset[index]}
                disabled={disabled}
                min={-Number.MAX_SAFE_INTEGER}
                max={Number.MAX_SAFE_INTEGER}
                step={0.1}
                onCommit={(value) => {
                  const next: [number, number] = [...offset];
                  next[index] = value ?? 0;
                  setOffset(next);
                  onMove(...next);
                }}
              />
            </label>
          ),
        )}
      </div>
      <button
        type="button"
        disabled={disabled || offset.every((value) => value === 0)}
        onClick={() => onMove(0, 0)}
      >
        Reset position offset
      </button>
      <p className="studio-help">
        Drag the block or use arrow keys to move it. Offsets keep its space in
        the layout; use Move up / down to change page order. Choose Interact to
        use its contents.
      </p>
    </div>
  );
}
