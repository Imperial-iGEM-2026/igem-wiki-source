'use client';
import { useEffect, useRef } from 'react';
export function PdfReader({ src, title }: { src: string; title: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let disposed = false;
    let cleanup: (() => void) | undefined;
    const element = ref.current;
    if (!element) return;
    import('./pdf-parts-viewer')
      .then(async ({ mountPdfReader }) => {
        if (disposed) return;
        const stop = await mountPdfReader(element);
        if (disposed) stop();
        else cleanup = stop;
      })
      .catch(() => {});
    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [src]);
  return (
    <div
      key={src}
      ref={ref}
      className="partitioned-pdf"
      data-pdf-parts={JSON.stringify([{ start: 1, end: 0, url: src }])}
      data-pdf-assets="/assets/pdfjs/"
    >
      <iframe
        className="pdf-viewer"
        title={title}
        src={src}
        loading="lazy"
        referrerPolicy="no-referrer"
      />
    </div>
  );
}
