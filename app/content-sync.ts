import type { Blocks } from './content';

/** Collapse a burst of revision notifications without losing the last update. */
export function coalesceRefresh(refresh: () => Promise<void>) {
  let running: Promise<void> | null = null;
  let again = false;
  return () => {
    if (running) {
      again = true;
      return running;
    }
    running = (async () => {
      do {
        again = false;
        await refresh();
      } while (again);
    })().finally(() => {
      running = null;
    });
    return running;
  };
}
/** Preserve identity when polling returns the same revisions, so the canvas stays still. */
export function mergeContentRows(
  previous: Blocks,
  rows: ({ id: string } & Blocks[string])[],
): Blocks {
  let next = previous;
  for (const row of rows) {
    const old = previous[row.id];
    if (
      old &&
      (row.version < old.version ||
        (row.version === old.version &&
          row.value === old.value &&
          row.author === old.author))
    )
      continue;
    if (next === previous) next = { ...previous };
    next[row.id] = row;
  }
  return next;
}
