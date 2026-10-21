import { useEffect, useRef, useState } from 'react';
import Home from './home';
import { SourcePreview, warmSourcePreview } from './source-preview-ui';
import { EditorLoading } from './editor-loading';
import { pageCatalog } from './custom-pages';
import type { Blocks } from './content';

/** Keep the installed editor usable while the first source override compiles. */
export function SourceStudio(props: React.ComponentProps<typeof Home>) {
  const [state, setState] = useState<
    'checking' | 'source' | 'installed' | 'error'
  >('checking');
  const [attempt, setAttempt] = useState(0);
  const [updateStatus, setUpdateStatus] = useState('');
  const [sourceReady, setSourceReady] = useState(false);
  const [updateRetry, setUpdateRetry] = useState(0);
  const resume = useRef<unknown>(null);
  const snapshot = useRef({
    data: props.initialData,
    page: props.wiki?.slug || 'home',
  });
  useEffect(() => {
    if (state !== 'installed') return;
    const abort = new AbortController();
    let busy = false,
      tried = '',
      lastInput = 0;
    let ready: string | false = false;
    const interaction = () => {
      lastInput = Date.now();
    };
    let pointerDown = false;
    const pointerStart = () => {
      pointerDown = true;
      interaction();
    };
    const pointerEnd = () => {
      pointerDown = false;
      interaction();
    };
    const check = async () => {
      if (busy || document.hidden || abort.signal.aborted) return;
      busy = true;
      try {
        {
          const response = await fetch(
            '/api/source-preview?project=' +
              encodeURIComponent(props.projectId || ''),
            {
              signal: abort.signal,
              credentials: 'same-origin',
              cache: 'no-store',
            },
          );
          if (!response.ok) return;
          const metadata = (await response.json()) as {
            revision: string;
            modifiedFiles: unknown[];
          };
          if (!metadata.modifiedFiles?.length) {
            ready = false;
            setUpdateStatus('');
            return;
          }
          if (ready && ready !== metadata.revision) ready = false;
          if (!ready) {
            if (metadata.revision === tried) return;
            tried = metadata.revision;
            setUpdateStatus('Building source in the background…');
            ready = await warmSourcePreview(
              props.projectId || '',
              abort.signal,
            );
            if (!ready) {
              tried = '';
              return;
            }
            setUpdateStatus(
              'Source ready. Waiting for saved edits and an idle editor…',
            );
          }
        }
        const capture = (window as any).__studioCaptureState?.();
        if (
          pointerDown ||
          (props.user && !capture) ||
          capture?.dirty ||
          Date.now() - lastInput < 1500 ||
          document.activeElement?.matches(
            'input,textarea,select,[contenteditable="true"]',
          ) ||
          document.querySelector('[role="dialog"],dialog[open]')
        )
          return;
        const response = await fetch(
          '/api/content?project=' + encodeURIComponent(props.projectId || ''),
          {
            signal: abort.signal,
            credentials: 'same-origin',
            cache: 'no-store',
            headers: { 'X-Prion-Project': props.projectId || '' },
          },
        );
        if (!response.ok)
          throw Error('Could not refresh saved content for the source editor.');
        const content = (await response.json()) as {
          rows: (Blocks[string] & { id: string })[];
        };
        if (
          (window as any).__studioCaptureState?.()?.dirty ||
          Date.now() - lastInput < 1500
        )
          return;
        const data = { ...props.initialData };
        for (const row of content.rows || []) data[row.id] = row;
        const slug = location.pathname.replace(/^\/+|\/+$/g, '') || 'home';
        snapshot.current = {
          data,
          page:
            slug === 'home' || pageCatalog(data).some((p) => p.slug === slug)
              ? slug
              : snapshot.current.page,
        };
        resume.current = {
          editor: (window as any).__studioCaptureState?.(),
          scrolls: ['.studio-stage'].map((selector) => {
            const e = document.querySelector(selector);
            return {
              selector,
              top: e?.scrollTop || 0,
              left: e?.scrollLeft || 0,
            };
          }),
        };
        if (!abort.signal.aborted) setState('source');
      } catch (error) {
        if (!abort.signal.aborted)
          setUpdateStatus(
            'Source update failed. Your editor is still available. ' +
              String(error),
          );
      } finally {
        busy = false;
      }
    };
    const timer = setInterval(() => void check(), 5000);
    const focus = () => void check();
    window.addEventListener('focus', focus);
    document.addEventListener('visibilitychange', focus);
    window.addEventListener('pointerdown', pointerStart, true);
    window.addEventListener('pointerup', pointerEnd, true);
    window.addEventListener('pointercancel', pointerEnd, true);
    window.addEventListener('keydown', interaction, true);
    return () => {
      abort.abort();
      clearInterval(timer);
      window.removeEventListener('focus', focus);
      document.removeEventListener('visibilitychange', focus);
      window.removeEventListener('pointerdown', pointerStart, true);
      window.removeEventListener('pointerup', pointerEnd, true);
      window.removeEventListener('pointercancel', pointerEnd, true);
      window.removeEventListener('keydown', interaction, true);
    };
  }, [state, props.projectId, updateRetry]);
  useEffect(() => {
    const abort = new AbortController();
    setState('checking');
    setSourceReady(false);
    resume.current = null;
    fetch(
      '/api/source-preview?project=' +
        encodeURIComponent(props.projectId || ''),
      {
        signal: abort.signal,
        credentials: 'same-origin',
        cache: 'no-store',
      },
    )
      .then(async (r) => {
        if (!r.ok) throw Error('Source check failed');
        const value = (await r.json()) as { modifiedFiles?: unknown };
        if (!Array.isArray(value.modifiedFiles))
          throw Error('Invalid source response');
        if (!abort.signal.aborted)
          setState(value.modifiedFiles.length ? 'source' : 'installed');
      })
      .catch(() => {
        if (!abort.signal.aborted) setState('error');
      });
    return () => abort.abort();
  }, [props.projectId, attempt]);
  if (state === 'checking')
    return (
      <EditorLoading
        title="Building source…"
        detail="Checking project source."
      />
    );
  if (state === 'error')
    return (
      <div role="alert">
        The project source could not be checked.{' '}
        <button onClick={() => setAttempt((v) => v + 1)}>Retry</button>
      </div>
    );
  const keepInstalled =
    state === 'installed' || (Boolean(resume.current) && !sourceReady);
  const staging = state === 'source' && keepInstalled;
  return (
    <div style={{ position: 'relative', height: '100dvh' }}>
      {state === 'installed' && updateStatus && (
        <output className="studio-source-status" role="status">
          {updateStatus}
          {updateStatus.startsWith('Source update failed') && (
            <button onClick={() => setUpdateRetry((v) => v + 1)}>
              Retry source build
            </button>
          )}
        </output>
      )}
      {keepInstalled && (
        <div key="installed" inert={staging} aria-hidden={staging || undefined}>
          <Home {...props} />
        </div>
      )}
      {state === 'source' && (
        <div
          key="source"
          style={staging ? { position: 'absolute', inset: 0 } : undefined}
        >
          <SourcePreview
            data={snapshot.current.data}
            page={snapshot.current.page}
            projectId={props.projectId}
            width="100%"
            active
            initialResume={resume.current}
            onReady={() => setSourceReady(true)}
            editor={props.user || undefined}
          />
        </div>
      )}
    </div>
  );
}
