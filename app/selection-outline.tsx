import { useLayoutEffect, useState, type RefObject } from 'react';
import type { DesignTarget } from './studio-target';

/** Selection chrome lives outside page stacking contexts. Never raise content. */
export function SelectionOutline({
  artboard,
  stage,
  targets,
  revision,
  zoom,
}: {
  artboard: RefObject<HTMLDivElement | null>;
  stage: RefObject<HTMLDivElement | null>;
  targets: DesignTarget[];
  revision: unknown;
  zoom: number;
}) {
  const [boxes, setBoxes] = useState<
    {
      left: number;
      top: number;
      width: number;
      height: number;
      clipPath: string;
    }[]
  >([]);
  const selectors = targets.map((t) => t.selector).join('\n');
  useLayoutEffect(() => {
    let frame = 0;
    const measure = () => {
      frame = 0;
      const clip = stage.current?.getBoundingClientRect();
      const next = clip
        ? selectors
            .split('\n')
            .filter(Boolean)
            .flatMap((selector) => {
              const r = artboard.current
                ?.querySelector(selector)
                ?.getBoundingClientRect();
              if (!r || r.width <= 0 || r.height <= 0) return [];
              const left = Math.max(r.left, clip.left),
                top = Math.max(r.top, clip.top);
              const right = Math.min(r.right, clip.right),
                bottom = Math.min(r.bottom, clip.bottom);
              return right > left && bottom > top
                ? [
                    {
                      left: r.left,
                      top: r.top,
                      width: r.width,
                      height: r.height,
                      clipPath: `inset(${top - r.top}px ${r.right - right}px ${r.bottom - bottom}px ${left - r.left}px)`,
                    },
                  ]
                : [];
            })
        : [];
      setBoxes(next);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    const observer = new ResizeObserver(schedule);
    if (artboard.current) observer.observe(artboard.current);
    if (stage.current) observer.observe(stage.current);
    for (const selector of selectors.split('\n').filter(Boolean)) {
      const element = artboard.current?.querySelector(selector);
      if (element) observer.observe(element);
    }
    document.addEventListener('scroll', schedule, true);
    window.addEventListener('resize', schedule);
    schedule();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      document.removeEventListener('scroll', schedule, true);
      window.removeEventListener('resize', schedule);
    };
  }, [selectors, artboard, stage, revision, zoom]);
  return (
    <div aria-hidden="true">
      {boxes.map((box, index) => (
        <div key={index} className="studio-selection-outline" style={box} />
      ))}
    </div>
  );
}
