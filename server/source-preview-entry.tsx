import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import Home from '../app/home';
import { pageCatalog } from '../app/custom-pages';
import { revealSection } from '../app/section-links';
import type { Blocks } from '../app/content';
import '../app/globals.css';

function SourcePage({
  data,
  page,
  projectId,
}: {
  data: Blocks;
  page: string;
  projectId?: string;
}) {
  const [current, setCurrent] = useState(page);
  const pages = pageCatalog(data);
  useEffect(() => {
    const navigate = (event: MouseEvent) => {
      const link =
        event.target instanceof Element ? event.target.closest('a') : null;
      if (
        !link ||
        event.defaultPrevented ||
        event.button ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.shiftKey ||
        link.hasAttribute('download') ||
        (link.target && link.target !== '_self')
      )
        return;
      const url = new URL(link.href, document.baseURI);
      if (url.origin !== new URL(document.baseURI).origin) return;
      const next = url.pathname.replace(/^\/+|\/+$/g, '') || 'home';
      if (next !== 'home' && !pages.some((p) => p.slug === next)) return;
      event.preventDefault();
      setCurrent(next);
      requestAnimationFrame(() =>
        url.hash ? revealSection(url.hash) : window.scrollTo(0, 0),
      );
    };
    document.addEventListener('click', navigate);
    return () => document.removeEventListener('click', navigate);
  }, [pages]);
  return (
    <Home
      key={current}
      user={null}
      projectId={projectId}
      publication
      initialData={data}
      wiki={pages.find((p) => p.slug === current)}
    />
  );
}
const root = createRoot(document.getElementById('root')!);
(
  window as Window & {
    __mountSourcePreview?: (
      data: Blocks,
      page: string,
      projectId?: string,
    ) => void;
  }
).__mountSourcePreview = (data: Blocks, page: string, projectId?: string) =>
  root.render(
    <SourcePage key={page} data={data} page={page} projectId={projectId} />,
  );
