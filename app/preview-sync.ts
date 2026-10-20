import type { Blocks } from './content';

/** Compare row values, not object identity: drafts and live sync can recreate rows. */
export function previewChanges(previous: Blocks, next: Blocks) {
  const changes: Blocks = {};
  const removed: string[] = [];
  for (const [id, row] of Object.entries(next)) {
    const old = previous[id];
    if (
      old !== row &&
      (!old ||
        old.value !== row.value ||
        old.version !== row.version ||
        old.author !== row.author)
    )
      changes[id] = row;
  }
  for (const id of Object.keys(previous))
    if (!Object.hasOwn(next, id)) removed.push(id);
  return { changes, removed };
}

export function applyPreviewChanges(
  previous: Blocks,
  changes: Blocks,
  removed: string[],
) {
  if (!Object.keys(changes).length && !removed.length) return previous;
  const next = { ...previous, ...changes };
  for (const id of removed) delete next[id];
  return next;
}
