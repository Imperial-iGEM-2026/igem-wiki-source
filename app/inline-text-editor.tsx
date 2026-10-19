import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
import type { DesignTarget } from './studio-target';

/** A plain-text overlay avoids mutating React's rendered DOM or pasting HTML. */
export function InlineTextEditor({
  target,
  artboard,
  stage,
  value,
  maxLength,
  onChange,
  onSave,
  onCancel,
  onExpand,
}: {
  target: DesignTarget;
  artboard: RefObject<HTMLDivElement | null>;
  stage: RefObject<HTMLDivElement | null>;
  value: string;
  maxLength: number;
  onChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
  onExpand: () => void;
}) {
  const input = useRef<HTMLTextAreaElement>(null);
  const [box, setBox] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  }>();
  useLayoutEffect(() => {
    const measure = () => {
      const r = artboard.current
          ?.querySelector(target.selector)
          ?.getBoundingClientRect(),
        clip = stage.current?.getBoundingClientRect();
      if (!r || !clip) return;
      const width = Math.min(Math.max(r.width, 280), clip.width - 24);
      const height = Math.min(Math.max(r.height, 150), clip.height - 80);
      setBox({
        left: Math.max(
          clip.left + 12,
          Math.min(r.left, clip.right - width - 12),
        ),
        top: Math.max(
          clip.top + 12,
          Math.min(r.top, clip.bottom - height - 62),
        ),
        width,
        height,
      });
    };
    measure();
    window.addEventListener('resize', measure);
    document.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      document.removeEventListener('scroll', measure, true);
    };
  }, [target.selector, artboard, stage]);
  const ready = Boolean(box);
  useLayoutEffect(() => {
    if (ready) input.current?.focus({ preventScroll: true });
  }, [ready]);
  if (!box) return null;
  return (
    <section
      aria-label="On-canvas text editor"
      className="studio-inline-text"
      style={{ left: box.left, top: box.top, width: box.width }}
    >
      <textarea
        ref={input}
        aria-label="Edit text on canvas"
        style={{ height: box.height }}
        value={value}
        maxLength={maxLength}
        spellCheck
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.nativeEvent.isComposing) return;
          if (e.key === 'Escape') {
            e.preventDefault();
            onCancel();
          }
          if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            onSave();
          }
        }}
      />
      <div>
        <button onClick={onExpand}>Expand editor</button>
        <button onClick={onCancel}>Cancel</button>
        <button className="studio-primary" onClick={onSave}>
          Save text
        </button>
      </div>
    </section>
  );
}
