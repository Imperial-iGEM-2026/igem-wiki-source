'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import type { Blocks } from './content';
import type { Project, Projects } from './project-api';
import { pageCatalog } from './custom-pages';

type Status = {
  theme: string;
  version: number;
  rollback: null | { id: number; theme: string; created: number };
};
export function TemplateChangeDialog({
  project,
  templates,
  onClose,
  onChanged,
}: {
  project: Project;
  templates: NonNullable<Projects['templates']>;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [status, setStatus] = useState<Status | null>(null);
  const [selected, setSelected] = useState('');
  const [preview, setPreview] = useState<{
    token: string;
    data: Blocks;
  } | null>(null);
  const [page, setPage] = useState('home');
  const [width, setWidth] = useState(1200);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [ready, setReady] = useState(false),
    [reviewed, setReviewed] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);
  const request = useCallback(
    async (body: Record<string, unknown>) => {
      const response = await fetch('/api/template-change', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, id: project.id }),
      });
      const result = (await response.json()) as Status & {
        token: string;
        data: Blocks;
        error?: string;
      };
      if (!response.ok)
        throw Error(result.error || 'Could not change template.');
      return result;
    },
    [project.id],
  );
  useEffect(() => {
    let alive = true;
    request({ action: 'status' })
      .then((result) => {
        if (alive) {
          setStatus(result);
          setSelected(result.theme === 'blank' ? '' : result.theme);
        }
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [request]);
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (
        event.origin !== location.origin ||
        event.source !== frame.current?.contentWindow
      )
        return;
      if (event.data?.type === 'prion-preview-ready') setReady(true);
      if (event.data?.type === 'prion-preview-rendered') setReviewed(true);
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, []);
  useEffect(() => {
    if (ready && preview)
      frame.current?.contentWindow?.postMessage(
        { type: 'prion-preview-data', data: preview.data, page },
        location.origin,
      );
  }, [ready, preview, page]);
  async function act(action: 'preview' | 'apply' | 'rollback') {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await request({
        action,
        templateId: selected,
        token: preview?.token,
        changeId: status?.rollback?.id,
        version: status?.version,
      });
      if (action === 'preview') {
        setStatus(result);
        setReady(false);
        setReviewed(false);
        setPreview({ token: result.token, data: result.data });
      } else {
        onChanged();
        onClose();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not change template.');
      if (action === 'apply') {
        setPreview(null);
        setReviewed(false);
      }
    } finally {
      setBusy(false);
    }
  }
  const name = (id: string) => templates.find((t) => t.id === id)?.name || id;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent
        className="template-change-dialog"
        style={{ maxWidth: 'min(1200px,95vw)', width: '95vw' }}
      >
        <DialogTitle>Change template · {project.name}</DialogTitle>
        <DialogDescription>
          Preview new styling with your saved content. Pages, images, links and
          layouts stay intact. Save any open editor drafts first.
        </DialogDescription>
        <p className="template-change-note">
          This changes the visual style, not the page structure or logo. Your
          custom CSS remains and may override the template.
        </p>
        <div className="template-change-controls">
          <label>
            Template
            <select
              value={selected}
              disabled={busy || !status}
              onChange={(e) => {
                setSelected(e.target.value);
                setPreview(null);
                setReady(false);
                setReviewed(false);
              }}
            >
              <option value="" disabled>
                Choose a template
              </option>
              {templates
                .filter((t) => t.id !== 'blank')
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
            </select>
          </label>
          <button
            disabled={busy || !status || !selected || selected === status.theme}
            onClick={() => void act('preview')}
          >
            {busy ? 'Working…' : 'Preview template'}
          </button>
          {preview && (
            <>
              <label>
                Page
                <select value={page} onChange={(e) => setPage(e.target.value)}>
                  <option value="home">Home</option>
                  {pageCatalog(preview.data)
                    .filter((p) => p.slug !== 'home')
                    .map((p) => (
                      <option key={p.slug} value={p.slug}>
                        {p.title}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Viewport
                <select
                  value={width}
                  onChange={(e) => setWidth(Number(e.target.value))}
                >
                  <option value={1200}>Desktop</option>
                  <option value={768}>Tablet</option>
                  <option value={390}>Mobile</option>
                </select>
              </label>
            </>
          )}
        </div>
        {error && (
          <p role="alert" className="library-error">
            {error}
          </p>
        )}
        {preview ? (
          <div className="template-change-preview">
            <iframe
              key={preview.token}
              ref={frame}
              src="/studio-preview"
              title="Template change preview"
              style={{ width }}
            />
          </div>
        ) : (
          <p className="template-change-empty">
            Current template style:{' '}
            {name(status?.theme || project.templateId || '')}. Choose a
            different template to preview your project.
          </p>
        )}
        <div className="template-change-footer">
          <div>
            {status?.rollback && (
              <button disabled={busy} onClick={() => void act('rollback')}>
                Roll back to {name(status.rollback.theme)}
              </button>
            )}
            <small>
              Rollback restores the previous style and keeps subsequent content
              edits.
            </small>
          </div>
          <button
            disabled={busy || !preview || !reviewed}
            onClick={() => void act('apply')}
          >
            Apply previewed template
          </button>
        </div>
        <small>
          Nothing changes until you apply. If a teammate saves while you
          preview, you’ll need a fresh preview.
        </small>
      </DialogContent>
    </Dialog>
  );
}
