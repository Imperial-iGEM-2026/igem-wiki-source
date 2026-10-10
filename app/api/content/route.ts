import { validHeader } from '../../header-schema';
import { LAYOUT_WRITE_PROTOCOL } from '../../layout-protocol';
import { getEditorUser, mayRead } from '../../auth';
import { validateLayout } from '../../canvas-schema';
import { getDb } from '@/db';
import { blocks, presence } from '@/db/schema';
import { and, eq, gt } from 'drizzle-orm';
import { initial } from '../../content';
import { loadContentRows } from '../../load-content';
const json = (v: unknown, status = 200) =>
  Response.json(v, { status, headers: { 'Cache-Control': 'no-store' } });
export async function GET() {
  if (!(await mayRead()))
    return json({ error: 'Sign in to view content.' }, 401);
  try {
    const db = getDb();
    const rows = await loadContentRows();
    const people = await db
      .select({ name: presence.name, id: presence.id })
      .from(presence)
      .where(gt(presence.seen, Date.now() - 20000));
    return json({ rows, people });
  } catch {
    return json({ error: 'Shared content is temporarily unavailable.' }, 503);
  }
}
export async function POST(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin)
    return json({ error: 'Invalid origin' }, 403);
  const user = await getEditorUser();
  if (!user) return json({ error: 'Sign in to edit.' }, 401);
  try {
    const body = (await request.json()) as {
      presence?: boolean;
      id: string;
      value: string;
      version: number;
    };
    const db = getDb();
    if (body.presence) {
      await db
        .insert(presence)
        .values({ id: user.userId, name: user.displayName, seen: Date.now() })
        .onConflictDoUpdate({
          target: presence.id,
          set: { name: user.displayName, seen: Date.now() },
        });
      return json({ ok: true });
    }
    const { id, value, version } = body;
    if (
      typeof id !== 'string' ||
      !Object.hasOwn(initial, id) ||
      typeof value !== 'string' ||
      (id.startsWith('layout:')
        ? (() => {
            try {
              return JSON.stringify({ ...JSON.parse(value), customCss: '' })
                .length;
            } catch {
              return Infinity;
            }
          })()
        : value.length) >
        (id === 'site:header'
          ? 24000
          : id.startsWith('layout:')
            ? 200000
            : id.startsWith('wiki:')
              ? 12000
              : 2000) ||
      !value.trim() ||
      !Number.isInteger(version) ||
      version < 0
    )
      return json(
        { error: 'Enter valid content within the section character limit.' },
        400,
      );
    if (id === 'site:header' && !validHeader(JSON.parse(value)))
      return json({ error: 'Invalid header settings.' }, 400);
    if (id.startsWith('layout:')) {
      if (
        request.headers.get('X-Prion-Layout-Protocol') !== LAYOUT_WRITE_PROTOCOL
      )
        return json(
          {
            error:
              'This editor tab is out of date. Reload before saving this page. Your saved content has not been changed.',
          },
          409,
        );
      let valid = false;
      try {
        valid = validateLayout(JSON.parse(value));
      } catch {}
      if (!valid) return json({ error: 'Invalid page layout.' }, 400);
    }
    if (
      id === 'order' &&
      !/^(1,2,3|1,3,2|2,1,3|2,3,1|3,1,2|3,2,1)$/.test(value)
    )
      return json({ error: 'Invalid order' }, 400);
    let result;
    if (version === 0) {
      result = await db
        .insert(blocks)
        .values({ id, value, version: 1, author: user.displayName })
        .onConflictDoNothing()
        .returning();
    } else {
      result = await db
        .update(blocks)
        .set({ value, version: version + 1, author: user.displayName })
        .where(and(eq(blocks.id, id), eq(blocks.version, version)))
        .returning();
    }
    if (!result.length)
      return json(
        {
          error:
            'Someone updated this text. Your draft is kept below; review the latest version before saving again.',
        },
        409,
      );
    return json(result[0]);
  } catch {
    return json(
      { error: 'Could not save. Your draft is still available; try again.' },
      503,
    );
  }
}
