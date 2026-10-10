// Used only by server routes. Database failures propagate; they never render
// an editable default page in place of content we could not retrieve.
import { getDb } from '@/db';
import { blocks } from '@/db/schema';
import { initial, type Blocks } from './content';
import { resolveContentRows } from '../server/content-rows';

export async function loadContentRows() {
  return resolveContentRows(initial, await getDb().select().from(blocks));
}
export async function loadContent() {
  return Object.fromEntries(
    (await loadContentRows()).map((row) => [row.id, row]),
  ) as Blocks;
}
