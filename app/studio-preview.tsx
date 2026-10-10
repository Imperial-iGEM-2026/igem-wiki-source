'use client';
import { useEffect, useRef, useState } from 'react';
import { Monitor, Tablet, Smartphone, ArrowLeft } from 'lucide-react';
import type { Blocks } from './content';

// Use the publication renderer in its own viewport. This includes generated
// article introductions, navigation, footer and true viewport media queries.
export function StudioPreview({
  data,
  active,
  page,
  onClose,
}: {
  data: Blocks;
  active: boolean;
  page: string;
  onClose: () => void;
}) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (
        event.origin === window.location.origin &&
        event.source === frameRef.current?.contentWindow &&
        event.data?.type === 'prion-preview-ready'
      )
        setReady(true);
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, []);
  useEffect(() => {
    if (ready && active)
      frameRef.current?.contentWindow?.postMessage(
        { type: 'prion-preview-data', data, page },
        window.location.origin,
      );
  }, [ready, active, data, page]);
  useEffect(() => {
    if (!active)
      frameRef.current?.contentDocument
        ?.querySelectorAll('video,audio')
        .forEach((media) => (media as HTMLMediaElement).pause());
  }, [active]);
  const [width, setWidth] = useState(1440);
  return (
    <section
      className="studio-full-preview"
      aria-label="Website preview"
      style={active ? undefined : { display: 'none' }}
    >
      <div className="studio-preview-toolbar">
        <button onClick={onClose}>
          <ArrowLeft size={15} /> Back to editor
        </button>
        <span>
          Website preview <small>Includes unsaved edits</small>
        </span>
        <div>
          {(
            [
              [1440, Monitor, 'Desktop'],
              [768, Tablet, 'Tablet'],
              [390, Smartphone, 'Mobile'],
            ] as const
          ).map(([size, Icon, label]) => (
            <button
              key={size}
              onClick={() => setWidth(size)}
              aria-pressed={size === width}
              aria-label={label}
            >
              <Icon size={16} />
            </button>
          ))}
        </div>
      </div>
      <div className="studio-preview-viewport">
        <iframe
          ref={frameRef}
          onLoad={() => setReady(true)}
          src="/studio-preview"
          title="Complete website preview"
          style={{ width }}
        />
      </div>
    </section>
  );
}
