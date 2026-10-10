// Recovery for the 24 layouts identified by the 2026-10-05 diagnostic.
// Default is read-only. --apply requires exact backup/live hashes and versions.
import { DatabaseSync, backup } from 'node:sqlite';
import { execFileSync } from 'node:child_process';
import { mkdtemp, writeFile, rm, chmod, mkdir } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';

const manifest = {
  project: '778d6038-19b8-4175-b255-9c3ba692f512',
  pages: [
    {
      id: 'layout:attributions',
      beforeHash:
        '4572e6eb672aaccef098efa57ee80fe87e24945c392dc67dfd797039629c9b70',
      beforeVersion: 7,
      afterHash:
        'a75511064eefb5b75ff6fb289d819ac6a17eb12d50a8e8985553b95c0edf7595',
      afterVersion: 8,
    },
    {
      id: 'layout:contribution',
      beforeHash:
        '0de83532b710e6e61dccbecb6f5b719446c7b2a7c73ba90ce028965583cf2b3a',
      beforeVersion: 20,
      afterHash:
        '1a8d149fda58d5d2d3b17c80001edeecd519425d42b9e5e72fc54e40225d7528',
      afterVersion: 21,
    },
    {
      id: 'layout:description',
      beforeHash:
        '513a86772abbd3d81480f18806ee80d4017e5ee65f7699c2faef9ff9b85e86de',
      beforeVersion: 27,
      afterHash:
        '981e7c393a0cb8a3b2e08774f446dbf6a1c71857d76cc2eecd55d54ae5036beb',
      afterVersion: 28,
    },
    {
      id: 'layout:design',
      beforeHash:
        '019c71b2c1586767becf4d5a82159ecac3480ba023d2fa4cde4b286057e65560',
      beforeVersion: 20,
      afterHash:
        '4b895221af923b1e32021496c6fd01fd8d775ea2ed0cf5f578a6f5bc417f515c',
      afterVersion: 21,
    },
    {
      id: 'layout:education',
      beforeHash:
        '4572e6eb672aaccef098efa57ee80fe87e24945c392dc67dfd797039629c9b70',
      beforeVersion: 7,
      afterHash:
        'a75511064eefb5b75ff6fb289d819ac6a17eb12d50a8e8985553b95c0edf7595',
      afterVersion: 8,
    },
    {
      id: 'layout:engineering',
      beforeHash:
        'ffc1b7789dda808360f6f2192ba2069bd31604e4af455643e640f63f91df83b3',
      beforeVersion: 20,
      afterHash:
        '9ac738b4b4f983518375fcb2d5fdfa2c77278185ea0e5461d0119d000b39a26f',
      afterVersion: 21,
    },
    {
      id: 'layout:experiments',
      beforeHash:
        '4572e6eb672aaccef098efa57ee80fe87e24945c392dc67dfd797039629c9b70',
      beforeVersion: 7,
      afterHash:
        'a75511064eefb5b75ff6fb289d819ac6a17eb12d50a8e8985553b95c0edf7595',
      afterVersion: 8,
    },
    {
      id: 'layout:human-practices',
      beforeHash:
        '4572e6eb672aaccef098efa57ee80fe87e24945c392dc67dfd797039629c9b70',
      beforeVersion: 7,
      afterHash:
        'a75511064eefb5b75ff6fb289d819ac6a17eb12d50a8e8985553b95c0edf7595',
      afterVersion: 8,
    },
    {
      id: 'layout:implementation',
      beforeHash:
        'c648ce6303b381e3a637d4cd84df5ba13c283faf9f5074aaa58da6defc528492',
      beforeVersion: 20,
      afterHash:
        '48a5c6ecd6db8da686770e1f4a331a90310f03bc90deba44703b4f646804a4e2',
      afterVersion: 21,
    },
    {
      id: 'layout:home',
      beforeHash:
        '0782a20f94ddf1ea01517e480fc68d0c0035d855a74c1b9b639c0699848fed1b',
      beforeVersion: 60,
      afterHash:
        '3bf1102aa9dbe69d9ff141059ae75c0c3ec1aa69d9771659a1647095f647b76d',
      afterVersion: 61,
    },
    {
      id: 'layout:members',
      beforeHash:
        'ce1cb1319950d1dd13caea4c8d5a319ece13686bbd7f53d5b3a5cef16083ac9f',
      beforeVersion: 33,
      afterHash:
        'e2facfa797006a9071d75af062364132f013ac6c7e75096ab9ce804b6f7a8641',
      afterVersion: 34,
    },
    {
      id: 'layout:model',
      beforeHash:
        '4572e6eb672aaccef098efa57ee80fe87e24945c392dc67dfd797039629c9b70',
      beforeVersion: 7,
      afterHash:
        'a75511064eefb5b75ff6fb289d819ac6a17eb12d50a8e8985553b95c0edf7595',
      afterVersion: 8,
    },
    {
      id: 'layout:notebook',
      beforeHash:
        '4572e6eb672aaccef098efa57ee80fe87e24945c392dc67dfd797039629c9b70',
      beforeVersion: 7,
      afterHash:
        'a75511064eefb5b75ff6fb289d819ac6a17eb12d50a8e8985553b95c0edf7595',
      afterVersion: 8,
    },
    {
      id: 'layout:parts',
      beforeHash:
        '4572e6eb672aaccef098efa57ee80fe87e24945c392dc67dfd797039629c9b70',
      beforeVersion: 7,
      afterHash:
        'a75511064eefb5b75ff6fb289d819ac6a17eb12d50a8e8985553b95c0edf7595',
      afterVersion: 8,
    },
    {
      id: 'layout:protocols',
      beforeHash:
        '66cfa204c269a9dc81960254663ce9935e6939bde86a4416f75f34016be32c63',
      beforeVersion: 206,
      afterHash:
        '80edb3d3aec135c02c3015a92fa093fe0695bf4dcd40c345f5fdd9869ee7e72c',
      afterVersion: 207,
    },
    {
      id: 'layout:results',
      beforeHash:
        'd1778b3ff2bb65b5e5c748054528740160933e9d55e8381baa36125f962c25c8',
      beforeVersion: 448,
      afterHash:
        '4abfa84d2531426de83677d519d08bf942199b17da144717a88f568f2e9a31a5',
      afterVersion: 472,
    },
    {
      id: 'layout:safety',
      beforeHash:
        'a2783df87e825cb3397ff2249ebdd23415212eeb9756507588e44e3fe9bc5e30',
      beforeVersion: 170,
      afterHash:
        '0c3f0e373d13cafbdec985c05dbeb00f467859deec60ac88ddd0317ee7e903ab',
      afterVersion: 171,
    },
    {
      id: 'layout:software',
      beforeHash:
        '4572e6eb672aaccef098efa57ee80fe87e24945c392dc67dfd797039629c9b70',
      beforeVersion: 7,
      afterHash:
        'a75511064eefb5b75ff6fb289d819ac6a17eb12d50a8e8985553b95c0edf7595',
      afterVersion: 8,
    },
    {
      id: 'layout:sponsors',
      beforeHash:
        '226f2c5271ac21ae19f951fdd859d7245efe4b6ed05cd1aa49ae97e7783e7826',
      beforeVersion: 33,
      afterHash:
        'acfe8e9b742a965a7aeafc741d7183c72a2006371c0e9d91aa6610833c9aa8a6',
      afterVersion: 34,
    },
    {
      id: 'layout:sustainability',
      beforeHash:
        '4572e6eb672aaccef098efa57ee80fe87e24945c392dc67dfd797039629c9b70',
      beforeVersion: 7,
      afterHash:
        'a75511064eefb5b75ff6fb289d819ac6a17eb12d50a8e8985553b95c0edf7595',
      afterVersion: 8,
    },
    {
      id: 'layout:inclusivity',
      beforeHash:
        'e70bb620e84a5db5affb30f81aaced4a759ca1518289a314f8f63c54aa372d4c',
      beforeVersion: 7,
      afterHash:
        '72b171bf2c6486b8a1e6a4a9211df025dd9b50f845fa1e103b19c53936383427',
      afterVersion: 8,
    },
    {
      id: 'layout:ethics',
      beforeHash:
        'e70bb620e84a5db5affb30f81aaced4a759ca1518289a314f8f63c54aa372d4c',
      beforeVersion: 7,
      afterHash:
        '72b171bf2c6486b8a1e6a4a9211df025dd9b50f845fa1e103b19c53936383427',
      afterVersion: 8,
    },
    {
      id: 'layout:entrepreneurship',
      beforeHash:
        'e70bb620e84a5db5affb30f81aaced4a759ca1518289a314f8f63c54aa372d4c',
      beforeVersion: 7,
      afterHash:
        '72b171bf2c6486b8a1e6a4a9211df025dd9b50f845fa1e103b19c53936383427',
      afterVersion: 8,
    },
    {
      id: 'layout:simulations',
      beforeHash:
        'e70bb620e84a5db5affb30f81aaced4a759ca1518289a314f8f63c54aa372d4c',
      beforeVersion: 7,
      afterHash:
        '72b171bf2c6486b8a1e6a4a9211df025dd9b50f845fa1e103b19c53936383427',
      afterVersion: 8,
    },
  ],
};
const args = process.argv.slice(2);
const apply = args.includes('--apply');
if (args.some((arg) => arg.startsWith('--') && arg !== '--apply'))
  throw Error('Unknown option');
const positional = args.filter((arg) => arg !== '--apply');
if (!positional.length || positional.length > 2)
  throw Error(
    'Usage: node recover-notebook-layouts.mjs BACKUP/prion.tar.gz [LIVE/wiki.sqlite] [--apply]',
  );
const archive = path.resolve(positional[0]);
const livePath = path.resolve(positional[1] || '/var/lib/prion/wiki.sqlite');
const scratch = await mkdtemp(path.join(os.tmpdir(), 'prion-layout-recovery-'));
await chmod(scratch, 0o700);
const hash = (value) => createHash('sha256').update(value).digest('hex');
let source,
  live,
  transaction = false;
try {
  const names = execFileSync('tar', ['-tzf', archive], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 ** 2,
  }).split(/\r?\n/);
  for (const suffix of ['', '-wal', '-shm']) {
    const expected = 'var/lib/prion/wiki.sqlite' + suffix;
    const matches = names.filter(
      (name) => name === expected || name === './' + expected,
    );
    if (matches.length > 1) throw Error('Ambiguous database member in backup');
    if (!matches.length) {
      if (!suffix) throw Error('Backup has no var/lib/prion/wiki.sqlite');
      continue;
    }
    const bytes = execFileSync('tar', ['-xOzf', archive, matches[0]], {
      maxBuffer: 512 * 1024 ** 2,
    });
    await writeFile(path.join(scratch, 'wiki.sqlite' + suffix), bytes, {
      mode: 0o600,
    });
  }
  source = new DatabaseSync(path.join(scratch, 'wiki.sqlite'), {
    readOnly: true,
  });
  // Never create a missing live database by mistake.
  const probe = new DatabaseSync(livePath, { readOnly: true });
  probe.close();
  live = new DatabaseSync(livePath, { readOnly: !apply });
  live.exec('PRAGMA busy_timeout=5000');
  function plan() {
    const changes = [];
    for (const item of manifest.pages) {
      const old = source
        .prepare(
          'SELECT value,version FROM project_blocks WHERE project_id=? AND id=?',
        )
        .get(manifest.project, item.id);
      const current = live
        .prepare(
          'SELECT value,version FROM project_blocks WHERE project_id=? AND id=?',
        )
        .get(manifest.project, item.id);
      if (
        !old ||
        hash(old.value) !== item.beforeHash ||
        old.version !== item.beforeVersion
      )
        throw Error(
          'Backup does not match the reviewed recovery source: ' + item.id,
        );
      if (!current)
        throw Error('Live page is missing; no changes made: ' + item.id);
      const oldLayout = JSON.parse(old.value);
      if (!Array.isArray(oldLayout.nodes) || !Array.isArray(oldLayout.order))
        throw Error('Invalid backup layout: ' + item.id);
      if (hash(current.value) === item.beforeHash) continue; // Already restored, including repeat runs.
      if (
        hash(current.value) !== item.afterHash ||
        current.version !== item.afterVersion
      )
        throw Error(
          'Page changed since the diagnostic; stopping to preserve newer work: ' +
            item.id +
            '. Run diagnose-layout-loss.mjs again.',
        );
      changes.push({
        ...item,
        value: old.value,
        currentVersion: current.version,
        restoredNodes: oldLayout.nodes.length,
      });
    }
    return changes;
  }
  let changes = plan();
  const report = (extra = {}) =>
    console.log(
      JSON.stringify(
        {
          mode: apply ? 'apply' : 'read-only preview',
          project: manifest.project,
          layouts: changes.map((item) => ({
            page: item.id.slice(7),
            restoredLayers: item.restoredNodes,
            fromVersion: item.currentVersion,
            toVersion: item.currentVersion + 1,
          })),
          count: changes.length,
          ...extra,
        },
        null,
        2,
      ),
    );
  if (!apply || !changes.length) {
    report({
      message: changes.length
        ? 'Checks passed. No data changed. Close all editor tabs, install the fixed server, stop prion, then run with --apply.'
        : 'These layouts are already restored. No data changed.',
    });
  } else {
    // Keep a complete, consistent copy of the live SQLite DB before any UPDATE.
    const safetyDir = path.join(
      path.dirname(livePath),
      'layout-recovery-' + randomUUID(),
    );
    await mkdir(safetyDir, { mode: 0o700 });
    const safetyPath = path.join(safetyDir, 'before-recovery.sqlite');
    await backup(live, safetyPath);
    await chmod(safetyPath, 0o600);
    live.exec('BEGIN IMMEDIATE');
    transaction = true;
    changes = plan(); // Recheck under the write lock; never overwrite a concurrent edit.
    const update = live.prepare(
      'UPDATE project_blocks SET value=?,version=version+1,author=? WHERE project_id=? AND id=? AND version=?',
    );
    for (const item of changes) {
      const result = update.run(
        item.value,
        'Backup recovery (2026-10-05)',
        manifest.project,
        item.id,
        item.currentVersion,
      );
      if (result.changes !== 1) throw Error('Concurrent change: ' + item.id);
      const saved = live
        .prepare('SELECT value FROM project_blocks WHERE project_id=? AND id=?')
        .get(manifest.project, item.id);
      if (hash(saved.value) !== item.beforeHash)
        throw Error('Recovery verification failed: ' + item.id);
    }
    live.exec('COMMIT');
    transaction = false;
    report({
      safetyBackup: safetyPath,
      message:
        'Recovery committed and hashes verified. Start prion and reopen the editor.',
    });
  }
} finally {
  if (transaction) live.exec('ROLLBACK');
  live?.close();
  source?.close();
  // Only remove the private directory created by this invocation.
  await rm(scratch, { recursive: true, force: true });
}
