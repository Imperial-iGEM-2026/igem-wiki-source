import { useEffect, useRef, useState } from 'react';
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
}: {
  data: Blocks;
  page: string;
  projectId?: string;
  width: number;
  active: boolean;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const latest = useRef({ data, page, projectId });
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState('Preparing developer source…');
  const [error, setError] = useState('');
  const [revision, setRevision] = useState('');
  const [stale, setStale] = useState(false);
  const connection = useRef<{ token: string; ready: boolean } | null>(null);
  useEffect(() => {
    latest.current = { data, page, projectId };
    if (connection.current?.ready)
      frame.current?.contentWindow?.postMessage(
        {
          type: 'source-preview-data',
          token: connection.current.token,
          data,
          page,
          projectId,
        },
        '*',
      );
  }, [data, page, projectId]);
  useEffect(() => {
    const abort = new AbortController();
    let worker: Worker | undefined;
    let disposed = false;
    let inflight = 0;
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
      if (message.type === 'source-preview-ready')
        frame.current?.contentWindow?.postMessage(
          {
            type: 'source-preview-load',
            token,
            javascript,
            vendor,
            tailwind,
            ...latest.current,
          },
          '*',
        );
      if (message.type === 'source-preview-loaded') {
        connection.current = { token, ready: true };
        setStatus(
          'Developer source · ' +
            bundle.modifiedFiles.length +
            ' changed files',
        );
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
          const url = new URL(message.url);
          if (
            url.origin !== location.origin ||
            !(
              /^\/api\/media\/[a-zA-Z0-9.-]+$/.test(url.pathname) ||
              /^\/(assets|templates)\/[a-zA-Z0-9_./-]+$/.test(url.pathname) ||
              url.pathname === '/api/search-index' ||
              url.pathname === '/prion-hero.png'
            )
          )
            throw Error(
              'This resource is not available to the read-only source preview.',
            );
          if (url.pathname === '/api/search-index')
            url.search = '?project=' + encodeURIComponent(projectId || '');
          const response = await fetch(url, {
            credentials: 'same-origin',
            signal: abort.signal,
          });
          if (Number(response.headers.get('content-length')) > 64 * 1024 * 1024)
            throw Error(
              'Preview resource exceeds 64 MiB. Use the installed preview for this file.',
            );
          const body = await response.arrayBuffer();
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
      if (
        attempt === 0 &&
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
            () =>
              reject(
                Error(
                  'Source build timed out. Retry or use Installed version.',
                ),
              ),
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
              location.href,
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
        location.origin,
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
      window.removeEventListener('message', receive);
      connection.current = null;
    };
  }, [projectId, attempt]);
  useEffect(() => {
    if (!active || !revision) return;
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
    <div className="studio-source-preview">
      <output className="studio-source-status">
        <span>
          {status}
          {stale && ' · New source changes available'}
        </span>
        <button onClick={() => setAttempt((v) => v + 1)}>
          Rebuild source preview
        </button>
      </output>
      {error && (
        <pre role="alert" className="studio-source-error">
          {error}
        </pre>
      )}
      <iframe
        ref={frame}
        title="Developer source preview"
        sandbox="allow-scripts allow-same-origin allow-presentation"
        allow="fullscreen *"
        style={{ width }}
      />
    </div>
  );
}
