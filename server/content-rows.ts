import type { Block } from '../app/content';

// Server-only default resolution. Never validate-and-replace a saved value:
// even empty strings or malformed JSON must be returned intact for recovery.
export function resolveContentRows(
  defaults: Record<string, string>,
  saved: ({ id: string } & Block)[],
) {
  const rows = new Map(saved.map((row) => [row.id, row]));
  return Object.entries(defaults).map(([id, value]) =>
    rows.has(id) ? rows.get(id)! : { id, value, version: 0, author: '' },
  );
}
