/** Stable fragment IDs survive section renames and reordering. */
export const sectionAnchor = (nodeId: string, itemId?: string) =>
  'section-' + nodeId + (itemId ? '--item-' + itemId : '');

export function revealSection(hash: string) {
  let id: string;
  try { id = decodeURIComponent(hash.replace(/^#/, '')); } catch { return false; }
  const target = document.getElementById(id);
  if (!target) return false;
  for (let el: HTMLElement | null = target; el; el = el.parentElement)
    if (el instanceof HTMLDetailsElement) el.open = true;
  target.style.scrollMarginTop = '110px';
  target.scrollIntoView({ block: 'start', behavior: 'instant' });
  if (id.startsWith('section-')) {
    target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches)
      target.animate([{ outline: '3px solid #9866e8' }, { outline: '3px solid transparent' }], { duration: 1400 });
  }
  return true;
}
export function startSectionLinks() {
  const visit = () => { if (location.hash.startsWith('#section-')) revealSection(location.hash); };
  const click = (event: MouseEvent) => {
    if (event.defaultPrevented || event.button || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
    const link = (event.target as Element)?.closest?.('a');
    if (!link || link.target === '_blank' || link.hasAttribute('download')) return;
    const url = new URL(link.href, location.href);
    if (url.origin !== location.origin || url.pathname !== location.pathname || url.search !== location.search || !url.hash.startsWith('#section-')) return;
    if (revealSection(url.hash)) { event.preventDefault(); history.pushState(history.state, '', url.hash); }
  };
  document.addEventListener('click', click);
  window.addEventListener('hashchange', visit);
  window.addEventListener('popstate', visit);
  const frame = requestAnimationFrame(visit);
  return () => { cancelAnimationFrame(frame); document.removeEventListener('click', click); window.removeEventListener('hashchange', visit); window.removeEventListener('popstate', visit); };
}
