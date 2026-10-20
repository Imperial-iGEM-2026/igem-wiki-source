import { StudioProjects } from './studio-projects';
import { studioPreferenceKeys, studioStorage } from './studio-storage';
import { EditorLoading } from './editor-loading';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { useEffect, useRef, useState } from 'react';
import { pageCatalog } from './custom-pages';
import { sourceEditorRequest } from './source-editor-policy';
import { uploadMedia } from './upload-media';
import { ExportPanel } from './export-panel';
import { AiLinkDialog } from './ai-link-dialog';
import type { Blocks } from './content';
import { sourcePreviewBootstrap } from './source-preview-frame';

type SourceBundle = {
  revision: string;
  modifiedFiles: { path: string; version: number }[];
  files: Record<string, string>;
  compiler: { dependencies: string[]; css: Record<string, string> };
};
let lastBuild:
  | {
      key: string;
      revision: string;
      javascript: string;
      vendor: string;
      tailwind: string;
    }
  | undefined;
export function SourcePreview({
  data,
  page,
  projectId,
  width,
  active,
  editor,
}: {
  data: Blocks;
  page: string;
  projectId?: string;
  width: number | string;
  active: boolean;
  editor?: { id: string; name: string };
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const latest = useRef({ data, page, projectId, editor });
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const dirtyRef = useRef(false);
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => {
      if (dirtyRef.current) event.preventDefault();
    };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, []);
  const [aiPage, setAiPage] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState('Preparing developer source…');
  const [error, setError] = useState('');
  const [revision, setRevision] = useState('');
  const [stale, setStale] = useState(false);
  const connection = useRef<{ token: string; ready: boolean } | null>(null);
  useEffect(() => {
    latest.current = { data, page, projectId, editor };
    if (connection.current?.ready)
      frame.current?.contentWindow?.postMessage(
        {
          type: 'source-preview-data',
          token: connection.current.token,
          data,
          page,
          projectId,
          editor,
        },
        '*',
      );
  }, [data, page, projectId]);
  useEffect(() => {
    const abort = new AbortController();
    let worker: Worker | undefined;
    let disposed = false;
    let inflight = 0;
    const streams = new Map<string, EventSource>();
    const waiting: (() => void)[] = [];
    const token = crypto.randomUUID();
    connection.current = { token, ready: false };
    const endpoint =
      '/api/source-preview?project=' + encodeURIComponent(projectId || '');
    const request = async (url: string) => {
      const r = await fetch(url, {
        credentials: 'same-origin',
        signal: abort.signal,
        cache: 'no-store',
      });
      if (!r.ok) {
        const body = (await r.json().catch(() => ({}))) as { error?: string };
        throw Error(body.error || 'Preview request failed: HTTP ' + r.status);
      }
      return r;
    };
    let bundle: Pick<SourceBundle, 'revision' | 'modifiedFiles'>,
      javascript: string,
      vendor: string,
      tailwind: string;
    const receive = async (event: MessageEvent) => {
      if (
        event.source !== frame.current?.contentWindow ||
        event.data?.token !== token ||
        disposed
      )
        return;
      const message = event.data;
      if (
        editor &&
        message.type === 'source-editor-preference' &&
        studioPreferenceKeys.includes(message.key) &&
        typeof message.value === 'string' &&
        message.value.length <= 16384
      ) {
        studioStorage.setItem(message.key, message.value);
      }
      if (
        editor &&
        message.type === 'source-editor-projects' &&
        !dirtyRef.current
      )
        setProjectsOpen(true);
      if (editor && message.type === 'source-editor-dirty') {
        dirtyRef.current = Boolean(message.dirty);
        setDirty(dirtyRef.current);
      }
      if (
        editor &&
        message.type === 'source-editor-export' &&
        !dirtyRef.current
      )
        setExportOpen(true);
      if (
        editor &&
        message.type === 'source-editor-navigate' &&
        !dirtyRef.current
      ) {
        const destination = new URL(String(message.url), document.baseURI);
        if (
          destination.origin === new URL(document.baseURI).origin &&
          (destination.pathname === '/workspace' ||
            (destination.searchParams.get('studio') === '1' &&
              /^[a-zA-Z0-9-]+$/.test(
                destination.searchParams.get('project') || '',
              ) &&
              (destination.pathname === '/' ||
                pageCatalog(latest.current.data).some(
                  (p) => '/' + p.slug === destination.pathname,
                ))))
        )
          window.location.assign(destination.href);
      }
      if (editor && message.type === 'source-editor-route') {
        const route = new URL(String(message.url), document.baseURI);
        if (
          route.origin === new URL(document.baseURI).origin &&
          /^\/[a-zA-Z0-9/_-]*$/.test(route.pathname)
        ) {
          route.searchParams.set('project', projectId || '');
          route.searchParams.set('studio', '1');
          latest.current.page =
            route.pathname.replace(/^\/+|\/+$/g, '') || 'home';
          history.replaceState(
            null,
            '',
            route.pathname + route.search + route.hash,
          );
        }
      }
      if (editor && message.type === 'source-editor-ai')
        setAiPage(String(message.page || page));
      if (editor && message.type === 'source-editor-upload') {
        try {
          if (!(message.file instanceof File))
            throw Error('Choose a file to upload.');
          const result = await uploadMedia(message.file, (progress) =>
            frame.current?.contentWindow?.postMessage(
              {
                type: 'source-editor-upload-progress',
                token,
                id: message.id,
                progress,
              },
              '*',
            ),
          );
          frame.current?.contentWindow?.postMessage(
            {
              type: 'source-editor-upload-result',
              token,
              id: message.id,
              result,
            },
            '*',
          );
        } catch (e) {
          frame.current?.contentWindow?.postMessage(
            {
              type: 'source-editor-upload-result',
              token,
              id: message.id,
              error: String(e),
            },
            '*',
          );
        }
      }
      if (editor && message.type === 'source-editor-live-close') {
        streams.get(message.id)?.close();
        streams.delete(message.id);
      }
      if (editor && message.type === 'source-editor-live' && streams.size < 2) {
        const url = new URL('/api/live', location.origin);
        url.searchParams.set('project', projectId || '');
        url.searchParams.set('clientId', String(message.clientId).slice(0, 80));
        url.searchParams.set('page', String(message.page).slice(0, 200));
        streams.get(message.id)?.close();
        const stream = new EventSource(url);
        streams.set(message.id, stream);
        for (const name of ['hello', 'presence', 'revision', 'error'])
          stream.addEventListener(name, (e) =>
            frame.current?.contentWindow?.postMessage(
              {
                type: 'source-editor-live-event',
                token,
                id: message.id,
                name,
                data: (e as MessageEvent).data,
              },
              '*',
            ),
          );
      }

      if (message.type === 'source-preview-ready')
        frame.current?.contentWindow?.postMessage(
          {
            type: 'source-preview-load',
            token,
            javascript,
            vendor,
            tailwind,
            revision: bundle.revision,
            ...latest.current,
            preferences: editor
              ? Object.fromEntries(
                  studioPreferenceKeys.map((key) => [
                    key,
                    studioStorage.getItem(key),
                  ]),
                )
              : {},
          },
          '*',
        );
      if (message.type === 'source-preview-loaded') {
        connection.current = { token, ready: true };
        setStatus('');
        setRevision(bundle.revision);
      }
      if (message.type === 'source-preview-error')
        setStatus('Developer source runtime error');
      if (
        message.type === 'source-preview-error' ||
        message.type === 'source-preview-resource-error'
      )
        setError(String(message.error).slice(0, 4000));
      if (message.type === 'source-preview-fetch') {
        const respond = (result: object, transfer: Transferable[] = []) =>
          frame.current?.contentWindow?.postMessage(
            {
              type: 'source-preview-response',
              token,
              id: message.id,
              ...result,
            },
            '*',
            transfer,
          );
        if (inflight >= 6)
          await new Promise<void>((resolve) => {
            waiting.push(resolve);
            abort.signal.addEventListener('abort', () => resolve(), {
              once: true,
            });
          });
        if (disposed) return;
        inflight++;
        try {
          const url = new URL(message.url, document.baseURI);
          const method = String(message.method || 'GET').toUpperCase();
          const editRequest = editor
            ? sourceEditorRequest(
                url,
                method,
                message.body,
                projectId || '',
                new URL(document.baseURI).origin,
              )
            : null;
          if (
            !editRequest &&
            (url.origin !== new URL(document.baseURI).origin ||
              method !== 'GET' ||
              !(
                /^\/api\/media\/[a-zA-Z0-9.-]+$/.test(url.pathname) ||
                /^\/(assets|templates)\/[a-zA-Z0-9_./-]+$/.test(url.pathname) ||
                url.pathname === '/api/search-index' ||
                url.pathname === '/api/source-preview' ||
                url.pathname === '/prion-hero.png'
              ))
          )
            throw Error(
              'This resource is not available to the read-only source preview.',
            );
          if (url.pathname === '/api/source-preview') {
            const files = url.searchParams.has('files');
            url.search =
              '?project=' +
              encodeURIComponent(projectId || '') +
              (files ? '&files=1' : '');
          }
          if (url.pathname === '/api/search-index')
            url.search = '?project=' + encodeURIComponent(projectId || '');
          const response = await fetch(url, {
            ...editRequest,
            credentials: 'same-origin',
            signal: abort.signal,
          });
          if (Number(response.headers.get('content-length')) > 64 * 1024 * 1024)
            throw Error('Resource exceeds the 64 MiB browser bridge limit.');
          const body = await response.arrayBuffer();
          if (editor && response.ok && url.pathname === '/api/content') {
            try {
              const value = JSON.parse(new TextDecoder().decode(body));
              const rows =
                method === 'GET'
                  ? value.rows
                  : [{ ...value, id: JSON.parse(message.body).id }];
              const snapshot = { ...latest.current.data };
              for (const row of rows || [])
                if (
                  typeof row.id === 'string' &&
                  typeof row.value === 'string' &&
                  Number.isSafeInteger(row.version)
                )
                  snapshot[row.id] = row;
              latest.current = { ...latest.current, data: snapshot };
            } catch {
              /* An unsuccessful/non-content response is not a snapshot. */
            }
          }
          if (body.byteLength > 64 * 1024 * 1024)
            throw Error('Preview resource exceeds 64 MiB.');
          respond(
            {
              body,
              status: response.status,
              contentType:
                response.headers.get('content-type') ||
                'application/octet-stream',
            },
            [body],
          );
        } catch (e) {
          respond({ error: e instanceof Error ? e.message : String(e) });
        } finally {
          inflight--;
          waiting.shift()?.();
        }
      }
    };
    window.addEventListener('message', receive);
    void (async () => {
      setError('');
      setStale(false);
      setStatus('Loading project source…');
      bundle = await (await request(endpoint)).json();
      const inherited = (window as any).__studioSourceBuild;
      if (!editor && inherited) {
        lastBuild = inherited;
        bundle = { ...bundle, revision: inherited.revision };
      }
      if (
        (attempt === 0 || (!editor && inherited)) &&
        lastBuild?.key === (projectId || '') &&
        lastBuild.revision === bundle.revision
      ) {
        ({ javascript, vendor, tailwind } = lastBuild);
      } else {
        const sourceBundle: SourceBundle = await (
          await request(endpoint + '&files=1')
        ).json();
        bundle = sourceBundle;
        setStatus('Building developer source in your browser…');
        worker = new Worker('/assets/source-preview/compiler.js', {
          type: 'module',
        });
        const compiled = new Promise<string>((resolve, reject) => {
          const timer = setTimeout(
            () => reject(Error('Source build timed out. Retry the build.')),
            60000,
          );
          worker!.onmessage = (e) => {
            clearTimeout(timer);
            if (e.data.ok) resolve(e.data.javascript);
            else reject(Error(e.data.error));
          };
          worker!.onerror = (e) => {
            clearTimeout(timer);
            reject(Error(e.message || 'Source compiler could not load'));
          };
          worker!.postMessage({
            files: sourceBundle.files,
            ...sourceBundle.compiler,
            wasmURL: new URL(
              '/assets/source-preview/esbuild.wasm',
              document.baseURI,
            ).href,
          });
        });
        [javascript, vendor, tailwind] = await Promise.all([
          compiled,
          request('/assets/source-preview/vendor.js').then((r) => r.text()),
          request('/assets/source-preview/tailwind.js').then((r) => r.text()),
        ]);
        worker.terminate();
        worker = undefined;
        if (!disposed)
          lastBuild = {
            key: projectId || '',
            revision: bundle.revision,
            javascript,
            vendor,
            tailwind,
          };
      }
      if (disposed || !frame.current) return;
      setStatus('Opening isolated source preview…');
      const base = new URL(
        latest.current.page === 'home' ? '/' : '/' + latest.current.page,
        new URL(document.baseURI).origin,
      ).href
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;');
      const csp =
        "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' blob:; style-src 'unsafe-inline' https:; img-src data: blob: https:; font-src data: https:; media-src blob: data: https:; connect-src blob: data:; worker-src blob: data:; frame-src data: https://video.igem.org https://www.youtube.com https://www.youtube-nocookie.com https://player.vimeo.com; base-uri http: https:; form-action 'none'";
      const html =
        '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="' +
        csp +
        '"><base href="' +
        base +
        '"><body class="publication"><div id="root"></div><script>(' +
        sourcePreviewBootstrap.toString() +
        ')(' +
        JSON.stringify(token) +
        ')</script>';
      frame.current.src =
        'data:text/html;charset=utf-8,' + encodeURIComponent(html);
    })().catch((e) => {
      if (!disposed) {
        setError(e instanceof Error ? e.message : String(e));
        setStatus('Developer source build failed');
      }
      worker?.terminate();
    });
    return () => {
      disposed = true;
      abort.abort();
      worker?.terminate();
      streams.forEach((stream) => stream.close());
      window.removeEventListener('message', receive);
      connection.current = null;
    };
  }, [projectId, attempt, Boolean(editor)]);
  useEffect(() => {
    if (!active || !revision || (window as any).__studioSourceBuild) return;
    const abort = new AbortController();
    const check = () => {
      void fetch(
        '/api/source-preview?project=' + encodeURIComponent(projectId || ''),
        { signal: abort.signal, credentials: 'same-origin', cache: 'no-store' },
      )
        .then((r) => (r.ok ? r.json() : null))
        .then((v) => {
          if (v && !abort.signal.aborted)
            setStale((v as { revision: string }).revision !== revision);
        })
        .catch(() => {});
    };
    const timer = setInterval(check, 10000);
    window.addEventListener('focus', check);
    return () => {
      abort.abort();
      clearInterval(timer);
      window.removeEventListener('focus', check);
    };
  }, [active, revision, projectId]);
  return (
    <div className={editor ? 'studio-source-editor' : 'studio-source-preview'}>
      {status && !error && (
        <EditorLoading title="Building source…" detail={status} />
      )}
      {(stale || error) && (
        <output className="studio-source-status">
          <span>
            {status}
            {stale && ' · New source changes available'}
          </span>
          <button
            disabled={dirty}
            title={dirty ? 'Save your edits before rebuilding' : undefined}
            onClick={() => setAttempt((v) => v + 1)}
          >
            Rebuild source preview
          </button>
        </output>
      )}
      {error && (
        <pre role="alert" className="studio-source-error">
          {error}
        </pre>
      )}
      {editor && projectId && (
        <Dialog open={projectsOpen} onOpenChange={setProjectsOpen}>
          <DialogContent>
            <DialogTitle>Projects</DialogTitle>
            <DialogDescription>
              Manage your project or switch to another website.
            </DialogDescription>
            <StudioProjects
              current={projectId}
              onSwitch={(id) =>
                window.location.assign(
                  '/?studio=1&project=' + encodeURIComponent(id),
                )
              }
            />
          </DialogContent>
        </Dialog>
      )}
      {editor && exportOpen && (
        <ExportPanel
          disabled={false}
          standalone
          onClose={() => setExportOpen(false)}
        />
      )}
      {editor && (
        <AiLinkDialog
          open={aiPage !== null}
          onOpenChange={(open) => {
            if (!open) setAiPage(null);
          }}
          page={aiPage || page}
          pageTitle={aiPage || page}
        />
      )}
      <iframe
        ref={frame}
        title={editor ? 'Website editor' : 'Developer source preview'}
        sandbox="allow-scripts allow-same-origin allow-presentation allow-downloads"
        allow="fullscreen *"
        style={{ width }}
      />
    </div>
  );
}
