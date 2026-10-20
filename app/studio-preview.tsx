'use client';
import { useEffect, useRef, useState } from 'react';
import { Monitor, Tablet, Smartphone, ArrowLeft } from 'lucide-react';
import type { Blocks } from './content';
import { SourcePreview } from './source-preview-ui';
import { previewChanges } from './preview-sync';

// Use the publication renderer in its own viewport. This includes generated
// article introductions, navigation, footer and true viewport media queries.
export function StudioPreview({
  data,
  projectId,
  active,
  page,
  onClose,
  dirty = false,
  anchor,
}: {
  data: Blocks;
  projectId?: string;
  active: boolean;
  page: string;
  onClose: () => void;
  dirty?: boolean;
  anchor?: { id: string; visit: number } | null;
}) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(0);
  const sent = useRef<{ data: Blocks; projectId?: string } | null>(null);
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (
        event.origin === window.location.origin &&
        event.source === frameRef.current?.contentWindow &&
        event.data?.type === 'prion-preview-ready'
      ) {
        sent.current = null;
        setReady((version) => version + 1);
      }
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, []);
  useEffect(() => {
    if (!ready || !active || !frameRef.current?.contentWindow) return;
    const previous = sent.current;
    const message =
      previous && previous.projectId === projectId
        ? {
            type: 'prion-preview-patch',
            ...previewChanges(previous.data, data),
            page,
            anchor,
            projectId,
          }
        : { type: 'prion-preview-data', data, page, anchor, projectId };
    frameRef.current.contentWindow.postMessage(message, window.location.origin);
    sent.current = { data, projectId };
  }, [ready, active, data, page, anchor, projectId]);
  useEffect(() => {
    if (!active)
      frameRef.current?.contentDocument
        ?.querySelectorAll('video,audio')
        .forEach((media) => (media as HTMLMediaElement).pause());
  }, [active]);
  const [source, setSource] = useState(false);
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
          Website preview{' '}
          <small>
            {dirty ? 'Includes unsaved edits' : 'All changes saved'}
          </small>
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
      <div className="studio-preview-version" aria-label="Preview version">
        <button aria-pressed={!source} onClick={() => setSource(false)}>Installed version</button>
        <button aria-pressed={source} onClick={() => setSource(true)}>Developer source</button>
        <small>{source ? 'Project source overrides · isolated browser build' : 'Installed Studio components'}</small>
      </div>
      {source && active && <SourcePreview data={data} page={page} projectId={projectId} width={width} active={active} />}
      <div className="studio-preview-viewport" style={source ? {display: 'none'} : undefined}>
        <iframe
          ref={frameRef}
          src="/studio-preview"
          title="Complete website preview"
          style={{ width }}
        />
      </div>
    </section>
  );
}
