import { useEffect, useState } from 'react';
import Home from './home';
import { SourcePreview } from './source-preview-ui';
import { EditorLoading } from './editor-loading';

/** Choose once before mounting an editor. Never replace a dirty editor on a poll. */
export function SourceStudio(props: React.ComponentProps<typeof Home>) {
  const [state, setState] = useState<
    'checking' | 'source' | 'installed' | 'error'
  >('checking');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    setState('checking');
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
  if (state === 'installed') return <Home {...props} />;
  return (
    <SourcePreview
      data={props.initialData}
      page={props.wiki?.slug || 'home'}
      projectId={props.projectId}
      width="100%"
      active
      editor={props.user || undefined}
    />
  );
}
