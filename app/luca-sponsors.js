// Keep one editable set of sponsor layers. A presentation-only copy completes
// the seamless loop; it is never saved or exposed to keyboard/screen readers.
export function startLucaSponsors(root) {
  const cleanups = [];
  for (const row of root.querySelectorAll('[data-layer-id^="luca-"][data-layer-id*="-sponsors-"]')) {
    const track = row.querySelector(':scope > .canvas-children');
    if (!track) continue;
    let copy;
    const refresh = () => {
      copy?.remove();
      const count = track.children.length;
      if (!count) return;
      for (const image of track.querySelectorAll('img')) {
        if (image.loading !== 'eager') image.loading = 'eager';
      }
      const width = row.clientWidth;
      const cell = Math.max(width < 600 ? 150 : 200, Math.ceil((width + 260) / count));
      row.style.setProperty('--luca-card-width', `${cell - 12}px`);
      row.style.setProperty('--luca-cycle', `${cell * count}px`);
      const index = Number(row.dataset.layerId.split('-').pop());
      row.style.setProperty('--luca-duration', `${[96, 82, 90][index % 3]}s`);
      row.dataset.lucaDirection = index === 1 ? 'left' : 'right';
      copy = track.cloneNode(true);
      copy.className = 'luca-sponsor-copy';
      copy.setAttribute('aria-hidden', 'true');
      copy.setAttribute('inert', '');
      for (const node of copy.querySelectorAll('*')) {
        for (const attr of [...node.attributes]) {
          if (attr.name === 'id' || attr.name.startsWith('data-')) node.removeAttribute(attr.name);
        }
        if (node.matches('a,button,input,[tabindex]')) node.setAttribute('tabindex', '-1');
        if (node.tagName === 'IMG') { node.alt = ''; node.loading = 'eager'; }
      }
      row.appendChild(copy);
      row.dataset.lucaReady = 'true';
      // Replacements and viewport resizes must not restart only the repeat.
      // Both tracks need the same phase to avoid a gap at the join.
      const originalAnimation = track.getAnimations()[0];
      const repeatAnimation = copy.getAnimations()[0];
      if (originalAnimation && repeatAnimation)
        repeatAnimation.currentTime = originalAnimation.currentTime;
    };
    refresh();
    const resize = new ResizeObserver(refresh);
    resize.observe(row);
    // Changes in the original layers (including image replacements/deletion)
    // update the visual copy without introducing duplicate editor layers.
    const changes = new MutationObserver(refresh);
    changes.observe(track, { childList: true, subtree: true, attributes: true });
    cleanups.push(() => {
      resize.disconnect(); changes.disconnect(); copy?.remove();
      delete row.dataset.lucaReady;
    });
  }
  return () => cleanups.forEach(cleanup => cleanup());
}
