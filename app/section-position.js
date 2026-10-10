/** Positions are sorted by document top, then by DOM order. No layout reads on scroll. */
export function currentSection(positions, offset, current = -1) {
  if (!positions.length) return -1;
  let lo = 0,
    hi = positions.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (positions[mid].top <= offset) lo = mid + 1;
    else hi = mid;
  }
  let index = Math.max(0, lo - 1);
  const top = positions[index].top;
  // Side-by-side headings share a scroll position. Keep the clicked/current marker.
  while (index > 0 && Math.abs(positions[index - 1].top - top) < 1) index--;
  const first = index;
  while (index < positions.length && Math.abs(positions[index].top - top) < 1) {
    if (positions[index].index === current) return current;
    index++;
  }
  return positions[first].index;
}
