'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { CanvasNode } from './canvas-schema';
import { htmlDocument } from './html-document';

export function CustomHtmlBlock({ node }: { node: CanvasNode }) {
  const source = useMemo(
    () => htmlDocument(node),
    [node.html, node.css, node.javascript],
  );
  const [document, setDocument] = useState(source);
  const [error, setError] = useState('');
  const frame = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    if (source === document) return;
    const timer = setTimeout(() => {
      setError('');
      setDocument(source);
    }, 600);
    return () => clearTimeout(timer);
  }, [source, document]);
  useEffect(() => {
    const receive = (event: MessageEvent) => {
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
    <div className="custom-html-block">
      <iframe
        ref={frame}
        className="custom-html-frame"
        title={node.alt || node.name || 'Custom HTML animation'}
        sandbox="allow-scripts"
        referrerPolicy="no-referrer"
        srcDoc={document}
      />
      {error && (
        <div className="custom-html-error" role="status">
          Animation error: {error}
        </div>
      )}
    </div>
  );
}
