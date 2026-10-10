import type { Blocks } from './content';
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
