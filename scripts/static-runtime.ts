import { startSectionLinks } from '../app/section-links';
startSectionLinks();
import { startWebsiteSearch } from '../app/site-search';
const searchURL = document.body.dataset.siteSearch;
if (searchURL) startWebsiteSearch(async () => (await import(/* @vite-ignore */ searchURL)).default, document.body.dataset.siteBase || '/');
import '../app/globals.css';
import { watchImageDisplay } from '../app/image-display';
document
  .querySelectorAll<HTMLImageElement>('img[data-image-small]')
  .forEach(watchImageDisplay);
if (document.querySelector('model-viewer')) void import('@google/model-viewer');

import { startTemplateMotion } from '../app/template-motion';
for (const root of document.querySelectorAll<HTMLElement>(
  '[data-template-theme]',
))
  startTemplateMotion(root);

import { startReferenceNavigation } from '../app/reference-navigation';
startReferenceNavigation();

import { startPdfParts } from '../app/pdf-parts-viewer';
startPdfParts();

import { loadHtmlFrame } from '../app/html-document';
import { followHtmlLink } from '../app/html-navigation';
import { watchHtmlFrame } from '../app/html-visibility';
const htmlRoutes = JSON.parse(document.body.dataset.customHtmlRoutes || '{}');
const htmlImages = JSON.parse(
  atob(document.body.dataset.customHtmlMedia || 'e30='),
);
const htmlSources = new Map<string, Promise<unknown>>();
function loadHtmlSource(url: string): Promise<unknown> {
  if (!htmlSources.has(url))
    htmlSources.set(
      url,
      (async () => {
        const target = new URL(url, document.baseURI);
        if (target.origin !== location.origin)
          throw Error('Invalid custom HTML source origin');
        const response = await fetch(target);
        if (!response.ok) throw Error('Could not load custom HTML component');
        return response.json();
      })(),
    );
  return htmlSources.get(url)!;
}
for (const frame of document.querySelectorAll<HTMLIFrameElement>(
  '.custom-html-frame[data-html-document], .custom-html-frame[data-html-source]',
)) {
  watchHtmlFrame(frame, () => {
    if (frame.dataset.htmlSource) {
      void loadHtmlSource(frame.dataset.htmlSource)
        .then(async (source) => {
          if (!Array.isArray(source) || source.length > 1000)
            throw Error('Invalid component');
          const parts = await Promise.all(
            source.map(async (part: unknown) => {
              if (typeof part === 'string') return part;
              if (
                !part ||
                typeof part !== 'object' ||
                !('url' in part) ||
                typeof part.url !== 'string'
              )
                throw Error('Invalid component part');
              const text = await loadHtmlSource(part.url);
              if (typeof text !== 'string')
                throw Error('Invalid component text');
              return text;
            }),
          );
          loadHtmlFrame(frame, parts.join(''), document.baseURI, htmlImages);
        })
        .catch(() => {
          const error = document.createElement('output');
          error.className = 'custom-html-error';
          error.textContent =
            'Could not load this component. Reload the page to retry.';
          frame.parentElement?.appendChild(error);
        });
    } else
      loadHtmlFrame(
        frame,
        frame.dataset.htmlDocument || '',
        document.baseURI,
        htmlImages,
      );
  });
  window.addEventListener('message', (event) =>
    followHtmlLink(event, frame, undefined, htmlRoutes),
  );
}
