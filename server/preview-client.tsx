import { createRoot } from 'react-dom/client';
import { useEffect, useState, useRef } from 'react';
import Home from '../app/home';
import { pageCatalog } from '../app/custom-pages';
import type { Blocks } from '../app/content';
import '../app/globals.css';

function Preview({
  data,
  page,
  anchor,
}: {
  data: Blocks;
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
  useEffect(() => {
    if (parent !== window)
      parent.postMessage({ type: 'prion-preview-rendered' }, location.origin);
  }, [data, page]);
  useEffect(() => {
    // Register custom elements in this iframe's own browser realm.
    if (
      Object.entries(data).some(
        ([id, row]) =>
          id.startsWith('layout:') && row.value.includes('"model"'),
      )
    )
      void import('@google/model-viewer');
  }, [data]);
  return (
    <div
      onClickCapture={(e) => {
        const link = (e.target as Element).closest('a');
        const href = link?.getAttribute('href');
        if (
          !href?.startsWith('/') ||
          href.startsWith('//') ||
          link?.hasAttribute('download') ||
          link?.target === '_blank' ||
          e.metaKey ||
          e.ctrlKey ||
          e.shiftKey ||
          e.altKey ||
          e.button !== 0
        )
          return;
        const slug = href.split(/[?#]/)[0].replace(/^\/+|\/+$/g, '') || 'home';
        if (slug === 'home' || pageCatalog(data).some((p) => p.slug === slug)) {
          e.preventDefault();
          e.stopPropagation();
          setCurrent(slug);
          requestAnimationFrame(() => {
            const hash = href.split('#')[1];
            if (hash) {
              try {
                document
                  .getElementById(decodeURIComponent(hash))
                  ?.scrollIntoView();
              } catch {}
            } else window.scrollTo(0, 0);
          });
        }
      }}
    >
      <Home
        key={current}
        user={null}
        publication
        initialData={data}
        wiki={pageCatalog(data).find((p) => p.slug === current)}
      />
    </div>
  );
}
const root = createRoot(document.getElementById('root')!);
if (parent !== window) {
  window.addEventListener('message', (event) => {
    if (
      event.origin !== window.location.origin ||
      event.source !== parent ||
      event.data?.type !== 'prion-preview-data'
    )
      return;
    if (!event.data.data || typeof event.data.page !== 'string') return;
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
        key={event.data.page}
        data={event.data.data}
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
