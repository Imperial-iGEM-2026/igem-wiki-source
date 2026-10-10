/** One delegated listener also serves the non-React static export. */
export function startReferenceNavigation(root: Document = document) {
  const click = (event: MouseEvent) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    const link = (event.target as Element)?.closest?.('a[data-citation-link]');
    if (!link) return;
    const href = link.getAttribute('href');
    if (!href?.startsWith('#')) return;
    let target: HTMLElement | null;
    try {
      target = root.getElementById(decodeURIComponent(href.slice(1)));
    } catch {
      return;
    }
    if (!target) return;
    event.preventDefault();
    const reduced = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    target.scrollIntoView({
      behavior: reduced ? 'instant' : 'smooth',
      block: 'center',
    });
    target.focus({ preventScroll: true });
    target.getAnimations().forEach((animation) => animation.cancel());
    if (!reduced)
      target.animate(
        [
          { backgroundColor: '#fff0bc' },
          { backgroundColor: '#fff0bc', offset: 0.35 },
          { backgroundColor: 'transparent' },
        ],
        { duration: 1800 },
      );
    try {
      history.replaceState(history.state, '', href);
    } catch {
      /* Hash navigation still works without history access. */
    }
  };
  root.addEventListener('click', click);
  return () => root.removeEventListener('click', click);
}
