'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { CanvasNode } from './canvas-schema';
import { htmlDocument, htmlFrameURL } from './html-document';
import { localHtmlImages } from './html-image';
import { followHtmlLink } from './html-navigation';

export function CustomHtmlBlock({
  node,
  editing = false,
  interacting = false,
}: {
  node: CanvasNode;
  editing?: boolean;
  interacting?: boolean;
}) {
  const { html, css, javascript } = node;
  const source = useMemo(
    () => htmlDocument({ html, css, javascript }),
    [html, css, javascript],
  );
  const [document, setDocument] = useState(source);
  const [error, setError] = useState('');
  const frame = useRef<HTMLIFrameElement>(null);
  const imageCache = useRef(new Map<string, string>());
  useEffect(() => {
    if (source === document) return;
    const timer = setTimeout(() => {
      setError('');
      setDocument(source);
    }, 600);
    return () => clearTimeout(timer);
  }, [source, document]);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const base = window.document.baseURI;
    const images = localHtmlImages(document, base);
    const cache = imageCache.current;
    const activeURLs = new Set(images.values());
    for (const url of cache.keys()) if (!activeURLs.has(url)) cache.delete(url);
    async function preview() {
      const replacements = new Map<string, string>();
      const failures: string[] = [];
      // Fetch from the parent session; the opaque custom frame has no login cookies.
      await Promise.all(
        [...images].map(async ([reference, url]) => {
          try {
            if (cache.has(url)) {
              replacements.set(reference, cache.get(url)!);
              return;
            }
            const response = await fetch(url, {
              credentials: 'same-origin',
              signal: controller.signal,
            });
            if (
              !response.ok ||
              !response.headers.get('content-type')?.startsWith('image/')
            )
              throw Error('Image request failed');
            const image = await response.blob();
            if (!active) return;
            // Opaque data frames cannot read parent-owned blob URLs in all browsers.
            // This is preview-only: saved code retains the short permanent media URL.
            const data = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result as string);
              reader.onerror = () => reject(Error('Could not read image'));
              reader.readAsDataURL(image);
            });
            if (!active) return;
            cache.set(url, data);
            replacements.set(reference, data);
          } catch {
            if (active) failures.push(reference.split('/').pop() || 'image');
          }
        }),
      );
      if (!active || !frame.current) return;
      // Replace complete references in one pass, including CSS/JS image references.
      const refs = [...replacements.keys()].sort((a, b) => b.length - a.length);
      const pattern = refs
        .map((ref) => ref.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('|');
      const resolved = pattern
        ? document.replace(new RegExp(pattern, 'g'), (match) =>
            replacements.get(match)!,
          )
        : document;
      frame.current.src = htmlFrameURL(resolved, base);
      setError(
        failures.length
          ? `Could not load uploaded image: ${failures.join(', ')}. Refresh and sign in, then retry.`
          : '',
      );
    }
    void preview();
    return () => {
      active = false;
      controller.abort();
    };
  }, [document]);
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (frame.current) followHtmlLink(event, frame.current, setError);
      if (
        event.source === frame.current?.contentWindow &&
        event.data?.type === 'custom-html-error' &&
        typeof event.data.message === 'string'
      )
        setError(event.data.message.slice(0, 500));
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, []);
  return (
    <div
      className="custom-html-block"
      data-html-editing={(editing && !interacting) || undefined}
    >
      <iframe
        ref={frame}
        tabIndex={editing && !interacting ? -1 : undefined}
        className="custom-html-frame"
        title={node.alt || node.name || 'Custom HTML animation'}
        sandbox="allow-scripts allow-same-origin allow-presentation"
        allow="autoplay *; fullscreen *; picture-in-picture *"
        allowFullScreen
        referrerPolicy="no-referrer"
        data-html-document={document}
      />
      {error && <output className="custom-html-error">{error}</output>}
    </div>
  );
}
