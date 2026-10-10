// Read-only content comparison. Never starts the application or writes to a live DB.
import { DatabaseSync } from 'node:sqlite';
import { execFileSync } from 'node:child_process';
import { mkdtemp, writeFile, rm, chmod } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';

const [backupArchive, liveDatabase = '/var/lib/prion/wiki.sqlite'] =
  process.argv.slice(2);
if (!backupArchive)
  throw Error(
    'Usage: node diagnose-layout-loss.mjs BACKUP/prion.tar.gz [LIVE/wiki.sqlite]',
  );
const scratch = await mkdtemp(path.join(os.tmpdir(), 'prion-layout-audit-'));
await chmod(scratch, 0o700);
const hash = (value) => createHash('sha256').update(value).digest('hex');
function inspect(filename) {
  const db = new DatabaseSync(filename, { readOnly: true });
  try {
    const tables = new Set(
      db
        .prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .all()
        .map((r) => r.name),
    );
    const projects = tables.has('projects')
      ? db.prepare('SELECT id,name FROM projects').all()
      : [{ id: 'main', name: 'Main' }];
    const rows = [];
    if (tables.has('blocks'))
      rows.push(
        ...db
          .prepare(
            "SELECT 'main' AS project_id,id,value,version,author FROM blocks WHERE id LIKE 'layout:%'",
          )
          .all(),
      );
    if (tables.has('project_blocks'))
      rows.push(
        ...db
          .prepare(
            "SELECT project_id,id,value,version,author FROM project_blocks WHERE id LIKE 'layout:%'",
          )
          .all(),
      );
    return {
      projects,
      rows: new Map(rows.map((row) => [row.project_id + '/' + row.id, row])),
    };
  } finally {
    db.close();
  }
}
function summary(row) {
  if (!row) return null;
  let layout;
  try {
    layout = JSON.parse(row.value);
  } catch {
    /* Report malformed data without printing it. */
  }
  return {
    version: row.version,
    author: row.author,
    sha256: hash(row.value),
    nodes: Array.isArray(layout?.nodes) ? layout.nodes.length : null,
    order: Array.isArray(layout?.order) ? layout.order.length : null,
    cssCharacters:
      typeof layout?.customCss === 'string' ? layout.customCss.length : 0,
    old100LimitWouldReject:
      (layout?.nodes?.length || 0) > 100 || (layout?.order?.length || 0) > 100,
  };
}
try {
  const names = execFileSync('tar', ['-tzf', path.resolve(backupArchive)], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 ** 2,
  }).split(/\r?\n/);
  // Extract only the three exact SQLite members, never config, media or arbitrary paths.
  for (const suffix of ['', '-wal', '-shm']) {
    const expected = 'var/lib/prion/wiki.sqlite' + suffix;
    const member = names.find(
      (name) => name === expected || name === './' + expected,
    );
    if (!member) {
      if (!suffix) throw Error('Backup has no var/lib/prion/wiki.sqlite');
      continue;
    }
    const bytes = execFileSync(
      'tar',
      ['-xOzf', path.resolve(backupArchive), member],
      { maxBuffer: 512 * 1024 ** 2 },
    );
    await writeFile(path.join(scratch, 'wiki.sqlite' + suffix), bytes, {
      mode: 0o600,
    });
  }
  const before = inspect(path.join(scratch, 'wiki.sqlite'));
  const after = inspect(path.resolve(liveDatabase));
  const changes = [];
  for (const key of new Set([...before.rows.keys(), ...after.rows.keys()])) {
    const old = before.rows.get(key),
      current = after.rows.get(key);
    if (old?.value === current?.value && old?.version === current?.version)
      continue;
    changes.push({ page: key, before: summary(old), after: summary(current) });
  }
  console.log(
    JSON.stringify(
      {
        readOnly: true,
        projects: after.projects,
        backupLayouts: before.rows.size,
        currentLayouts: after.rows.size,
        changes,
      },
      null,
      2,
    ),
  );
} finally {
  // Only the private temporary directory created by this script is removed.
  await rm(scratch, { recursive: true, force: true });
}
