import { getEditorUser } from '../../auth';
import { getDb } from '@/db';
import { blocks } from '@/db/schema';
import { initial } from '../../content';

// One query freezes all saved revisions together; drafts and identities are excluded.
export async function GET() {
  if (!(await getEditorUser()))
    return Response.json({ error: 'Sign in to export.' }, { status: 401 });
  try {
    const rows = await getDb()
      .select({ id: blocks.id, value: blocks.value })
      .from(blocks);
    const values = { ...initial };
    for (const row of rows)
      if (Object.hasOwn(values, row.id)) values[row.id] = row.value;
    return Response.json(
      {
        format: 'prion-wiki-snapshot',
        version: 1,
        exportedAt: new Date().toISOString(),
        values,
      },
      {
        headers: {
          'Cache-Control': 'private, no-store',
          'X-Content-Type-Options': 'nosniff',
        },
      },
    );
  } catch {
    return Response.json(
      { error: 'Could not read the saved content. Try again.' },
      { status: 503 },
    );
  }
}
