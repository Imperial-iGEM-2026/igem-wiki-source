// Publication policy only: never mutate the project's saved Studio values.
// Match complete slug segments, so scientific pages such as testing-methods
// and contest remain published. Keep this aligned with the search index.
export const isDevelopmentPage = (slug) =>
  /(?:^|-)(?:backup|test|scratch)(?:-|$)/i.test(slug);

export function publicationValues(values, pages = []) {
  const custom = JSON.parse(values['pages:custom'] || '[]');
  const removed = JSON.parse(values['pages:removed'] || '[]');
  const excludedPages = [...new Set([
    ...pages.map((page) => page.slug),
    ...custom.map((page) => page.slug),
    ...removed,
    ...Object.keys(values).filter((key) => key.startsWith('layout:')).map((key) => key.slice(7)),
  ].filter(isDevelopmentPage))].sort();
  const excluded = new Set(excludedPages);
  const result = Object.fromEntries(Object.entries(values).filter(([key]) => {
    const [prefix, slug] = key.split(':');
    return !excluded.has(prefix) &&
      !(['layout', 'copy', 'template', 'wiki'].includes(prefix) && excluded.has(slug));
  }));
  if (excluded.size) {
    result['pages:custom'] = JSON.stringify(custom.filter((page) => !excluded.has(page.slug)));
    result['pages:removed'] = JSON.stringify([...new Set([...removed, ...excludedPages])]);
  }
  return { values: result, excludedPages };
}
