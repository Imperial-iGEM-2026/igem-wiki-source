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
  const [sourceState, setSourceState] = useState<{
    project?: string;
    overrides: boolean;
    error?: string;
  } | null>(null);
  const [check, setCheck] = useState(0);
  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    setSourceState(null);
    void fetch(
      '/api/source-preview?project=' + encodeURIComponent(projectId || ''),
      {
        credentials: 'same-origin',
        cache: 'no-store',
        signal: controller.signal,
      },
    )
      .then(async (response) => {
        if (!response.ok)
          throw Error(
            'Could not check project source (HTTP ' + response.status + ').',
          );
        const metadata = (await response.json()) as { modifiedFiles?: unknown };
        if (!Array.isArray(metadata.modifiedFiles))
          throw Error('Invalid source preview response.');
        if (!controller.signal.aborted)
          setSourceState({
            project: projectId,
            overrides: metadata.modifiedFiles.length > 0,
          });
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setSourceState({
            project: projectId,
            overrides: false,
            error: String(error.message || error),
          });
      });
    return () => controller.abort();
  }, [active, projectId, check]);
  const checking = !sourceState || sourceState.project !== projectId;
  const source = !checking && sourceState.overrides;
  const blocked = checking || Boolean(sourceState?.error);
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
      {blocked && (
        <div className="studio-source-status" role="status">
          {checking ? (
            'Checking the website source…'
          ) : (
            <>
              {sourceState?.error} The website version has not been verified.{' '}
              <button onClick={() => setCheck((value) => value + 1)}>
                Retry source check
              </button>
            </>
          )}
        </div>
      )}
      {source && active && (
        <SourcePreview
          data={data}
          page={page}
          projectId={projectId}
          width={width}
          active={active}
        />
      )}
      <div
        className="studio-preview-viewport"
        style={source || blocked ? { display: 'none' } : undefined}
      >
        <iframe
          ref={frameRef}
          src={
            (window as any).__studioSourceBuild ? undefined : '/studio-preview'
          }
          title="Complete website preview"
          style={{ width }}
        />
      </div>
    </section>
  );
}
