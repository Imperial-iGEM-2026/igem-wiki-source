// A small conceptual explorer. No continuous animation or network requests.
export function startPurpleInteractions(root) {
  if (
    !['notebook-purple', 'notebook-white'].includes(
      root.dataset.templateTheme,
    ) ||
    root.dataset.editorViewport
  )
    return () => {};
  const cleanups = [];
  for (const panel of root.querySelectorAll('[data-purple-network]')) {
    const slider = panel.querySelector('input[type=range]');
    const output = panel.querySelector('[data-network-count]');
    const edges = [...panel.querySelectorAll('[data-network-edge]')];
    if (!slider || !output) continue;
    const update = () => {
      const count = Math.max(
        0,
        Math.min(edges.length, Number(slider.value) || 0),
      );
      edges.forEach((edge, index) => {
        edge.style.opacity = index < count ? '1' : '.1';
      });
      output.textContent = `${count} / ${edges.length}`;
      slider.setAttribute(
        'aria-valuetext',
        `${count} of ${edges.length} illustrated connections`,
      );
    };
    slider.addEventListener('input', update);
    update();
    cleanups.push(() => slider.removeEventListener('input', update));
  }
  return () => cleanups.forEach((cleanup) => cleanup());
}
