import { revealSection } from '../app/section-links';
import { createRoot } from 'react-dom/client';
import { memo, useEffect, useState, useRef, useMemo } from 'react';
import Home from '../app/home';
import { pageCatalog } from '../app/custom-pages';
import type { Blocks } from '../app/content';
import { applyPreviewChanges } from '../app/preview-sync';
import '../app/globals.css';

const PreviewHome = memo(Home);

function Preview({
  data,
  projectId,
  page,
  anchor,
}: {
  data: Blocks;
  projectId?: string;
  page: string;
  anchor?: { id: string; visit: number };
}) {
  const lastVisit = useRef<number | undefined>(undefined);
  const anchorId = anchor?.id,
    anchorVisit = anchor?.visit;
  useEffect(() => {
    if (!anchorId || lastVisit.current === anchorVisit) return;
    lastVisit.current = anchorVisit;
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => {
        document
          .querySelector(`[data-layer-id="${CSS.escape(anchorId)}"]`)
          ?.scrollIntoView({ block: 'start' });
      });
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [anchorId, anchorVisit]);
  const [current, setCurrent] = useState(page);
  const pages = useMemo(() => pageCatalog(data), [data]);
  useEffect(() => {
    if (parent !== window)
      parent.postMessage({ type: 'prion-preview-rendered' }, location.origin);
  }, [data, page]);
  useEffect(() => {
    // Register custom elements in this iframe's own browser realm.
    if (
      data['layout:' + current]?.value.includes('"model"') ||
      document.querySelector('model-viewer')
    )
      void import('@google/model-viewer');
  }, [data, current]);
  useEffect(() => {
    // Search dialogs and custom template controls can live outside React's root.
    // Handle their links in this document too, without leaving the preview frame.
    const navigate = (event: MouseEvent) => {
      const link = event.target instanceof Element
        ? event.target.closest('a')
        : null;
      const href = link?.getAttribute('href');
      if (
        event.defaultPrevented || !href ||
        link?.hasAttribute('download') ||
        (link?.target && link.target !== '_self') ||
        event.metaKey || event.ctrlKey || event.shiftKey || event.altKey ||
        event.button !== 0
      ) return;
      let url: URL;
      try { url = new URL(href, location.href); } catch { return; }
      if (url.origin !== location.origin) return;
      const slug = url.pathname.replace(/^\/+|\/+$/g, '') || 'home';
      if (slug !== 'home' && !pages.some((p) => p.slug === slug)) return;
      event.preventDefault();
      setCurrent(slug);
      requestAnimationFrame(() => {
        if (url.hash) revealSection(url.hash);
        else window.scrollTo(0, 0);
      });
    };
    // Bubble phase lets a result close its dialog and respects widget handlers
    // that already consumed a click. Modified/new-tab/download links stay native.
    document.addEventListener('click', navigate);
    return () => document.removeEventListener('click', navigate);
  }, [pages]);
  return (
    <div>
      <PreviewHome
        key={current}
        user={null}
        projectId={projectId}
        publication
        initialData={data}
        wiki={pages.find((p) => p.slug === current)}
      />
    </div>
  );
}
const root = createRoot(document.getElementById('root')!);
if (parent !== window) {
  let snapshot: Blocks | undefined;
  let projectId: string | undefined;
  window.addEventListener('message', (event) => {
    if (
      event.origin !== window.location.origin ||
      event.source !== parent ||
      !['prion-preview-data', 'prion-preview-patch'].includes(event.data?.type)
    )
      return;
    if (typeof event.data.page !== 'string') return;
    const nextProject =
      typeof event.data.projectId === 'string'
        ? event.data.projectId
        : undefined;
    if (event.data.type === 'prion-preview-data') {
      if (!event.data.data || typeof event.data.data !== 'object') return;
      snapshot = event.data.data;
      projectId = nextProject;
    } else {
      if (!snapshot || projectId !== nextProject) {
        parent.postMessage({ type: 'prion-preview-ready' }, location.origin);
        return;
      }
      if (!event.data.changes || !Array.isArray(event.data.removed)) return;
      snapshot = applyPreviewChanges(
        snapshot,
        event.data.changes,
        event.data.removed,
      );
    }
    const raw = event.data.anchor;
    const anchor =
      raw &&
      typeof raw.id === 'string' &&
      raw.id.length < 200 &&
      typeof raw.visit === 'number'
        ? { id: raw.id, visit: raw.visit }
        : undefined;
    root.render(
      <Preview
        key={(projectId || '') + ':' + event.data.page}
        data={snapshot!}
        projectId={projectId}
        page={event.data.page}
        anchor={anchor}
      />,
    );
  });
  parent.postMessage({ type: 'prion-preview-ready' }, window.location.origin);
} else if (location.pathname === '/mcp/preview') {
  // Opened directly by an AI's browser tool through its MCP link.
  const params = new URLSearchParams(location.search);
  fetch(
    '/mcp/preview-data?key=' + encodeURIComponent(params.get('key') || ''),
    { cache: 'no-store' },
  )
    .then((response) =>
      response.ok
        ? (response.json() as Promise<{ data: Blocks }>)
        : Promise.reject(),
    )
    .then(({ data }: { data: Blocks }) =>
      root.render(<Preview data={data} page={params.get('page') || 'home'} />),
    )
    .catch(() =>
      root.render(<p>This preview link is invalid, expired or revoked.</p>),
    );
}
