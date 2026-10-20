import { serveHtmlSearch } from '../app/html-search';
import { createWebsiteSearch } from '../app/site-search';
import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import Home from '../app/home';
import { pageCatalog } from '../app/custom-pages';
import { revealSection } from '../app/section-links';
import { startWebsiteAccessibility } from '../app/site-accessibility';
import { setApiProject } from '../app/project-api';
import type { Blocks } from '../app/content';
import '../app/globals.css';

function SourcePage({
  data,
  page,
  projectId,
  editor,
}: {
  data: Blocks;
  page: string;
  projectId?: string;
  editor?: { id: string; name: string };
}) {
  const [current, setCurrent] = useState(page);
  useEffect(() => {
    if (!editor)
      window.dispatchEvent(
        new CustomEvent('source-preview-route', { detail: current }),
      );
  }, [current, editor]);
  useEffect(() => {
    // Older project Home overrides may predate this visitor API. Export starts it
    // in the publication runtime, so keep source preview equivalent as well.
    if (
      !editor &&
      !(window as Window & { websiteAccessibility?: unknown })
        .websiteAccessibility
    )
      return startWebsiteAccessibility('preview:' + (projectId || 'default'));
  }, [projectId, editor]);
  useEffect(() => {
    if (
      (window as Window & { __htmlSearchBridge?: unknown }).__htmlSearchBridge
    )
      return;
    const api = createWebsiteSearch(async () => {
      const response = await fetch(
        '/api/search-index?project=' + encodeURIComponent(projectId || ''),
      );
      if (!response.ok) throw Error('Search unavailable');
      return response.json();
    });
    return serveHtmlSearch(api.search);
  }, [projectId]);
  const pages = pageCatalog(data);
  useEffect(() => {
    if (editor) return;
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
  }, [pages, editor]);
  return (
    <Home
      key={current}
      user={editor || null}
      projectId={projectId}
      publication={!editor}
      startEditing={Boolean(editor)}
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
      editor?: { id: string; name: string },
    ) => void;
  }
).__mountSourcePreview = (
  data: Blocks,
  page: string,
  projectId?: string,
  editor?: { id: string; name: string },
) => {
  if (projectId) setApiProject(projectId);
  root.render(
    <SourcePage
      key={page}
      data={data}
      page={page}
      projectId={projectId}
      editor={editor}
    />,
  );
};
