import test from 'node:test';
import assert from 'node:assert/strict';
import {
  scanStorage,
  confirmCleanup,
  removeStorage,
  clearDeletedMappings,
  folderFromURL,
  storageRoute,
  storageAdapter,
} from './cleanup.mjs';

test('Official deletion checks URL, size and dialog filename before confirming', async () => {
  for (const scenario of ['success', 'changed', 'wrong-dialog']) {
    let url = storageRoute('6377'),
      confirmed = 0,
      absent = false;
    const file = {
      url: 'https://static.igem.wiki/team/logo.png',
      name: 'logo.png',
      folder: 'logos',
      size: '5 KB',
    };
    const dialog = {
      getByText: () => ({ waitFor: async () => {} }),
      locator: () => ({
        textContent: async () =>
          scenario === 'wrong-dialog' ? 'another.png' : 'logo.png',
      }),
      getByRole: () => ({
        click: async () => {
          confirmed++;
          absent = true;
        },
      }),
      waitFor: async () => assert.equal(absent, true),
    };
    const row = {
      count: async () => (absent ? 0 : 1),
      locator: () => ({
        nth: () => ({
          textContent: async () => (scenario === 'changed' ? '6 KB' : '5 KB'),
        }),
      }),
      getByRole: () => ({ click: async () => {} }),
      waitFor: async () => assert.equal(absent, true),
    };
    const page = {
      isClosed: () => false,
      url: () => url,
      goto: async (next) => {
        url = next;
      },
      waitForFunction: async () => {},
      getByRole: (role) =>
        role === 'dialog'
          ? dialog
          : { waitFor: async () => {}, click: async () => {} },
      locator: (selector) =>
        selector === 'table tbody tr' ? { filter: () => row } : {},
    };
    const adapter = storageAdapter({ tabs: { assets: page }, log: () => {} });
    if (scenario === 'success') await adapter.remove('6377', file);
    else
      await assert.rejects(
        adapter.remove('6377', file),
        scenario === 'changed' ? /changed/ : /different file/,
      );
    assert.equal(confirmed, scenario === 'success' ? 1 : 0);
  }
});

test('Team-wide scan includes nested files from outside the current export; scan never deletes', async () => {
  let removes = 0;
  const root = storageRoute('6377');
  const listings = {
    '': [
      {
        name: 'logo.png',
        url: 'https://static.igem.wiki/team/logo.png',
        size: '5 KB',
      },
      { name: 'documents', url: root + '?path=documents' },
    ],
    documents: [
      {
        name: 'team.pdf',
        url: 'https://static.igem.wiki/team/team.pdf',
        size: '6 KB',
      },
      { name: 'archive', url: root + '?path=documents%2Farchive' },
    ],
    'documents/archive': [
      {
        name: 'old.pdf',
        url: 'https://static.igem.wiki/team/old.pdf',
        size: '7 KB',
      },
    ],
  };
  const plan = await scanStorage(
    {
      list: async (_, folder) => listings[folder],
      remove: async () => removes++,
    },
    '6377',
    'imperial-college',
  );
  assert.equal(plan.files.length, 3);
  assert.equal(plan.folders, 2);
  assert.equal(removes, 0);
  assert.equal(plan.files[2].folder, 'documents/archive');
});
test('Confirmation binds the preview to its team and expires; cannot replay a deletion', () => {
  const plan = {
    id: 'preview',
    teamId: '6377',
    team: 'imperial-college',
    createdAt: Date.now(),
  };
  const data = {
    id: 'preview',
    confirmTeam: 'imperial-college',
    acknowledged: true,
  };
  assert.doesNotThrow(() => confirmCleanup(plan, data, plan));
  for (const change of [
    { id: 'other' },
    { confirmTeam: 'wrong' },
    { acknowledged: false },
  ])
    assert.throws(() => confirmCleanup(plan, { ...data, ...change }, plan));
  assert.throws(() => confirmCleanup(plan, data, { ...plan, teamId: '999' }));
  assert.throws(
    () =>
      confirmCleanup({ ...plan, createdAt: Date.now() - 900001 }, data, plan),
    /expired/,
  );
  assert.throws(
    () => confirmCleanup({ ...plan, started: true }, data, plan),
    /already started/,
  );
});
test('Cleanup deletes only reviewed entries; partial failure records only verified removals', async () => {
  const plan = {
    teamId: '6377',
    files: [{ url: 'first' }, { url: 'second' }, { url: 'third' }],
    deleted: [],
  };
  const attempted = [],
    persisted = [];
  await assert.rejects(
    removeStorage(
      {
        remove: async (_, f) => {
          attempted.push(f.url);
          if (f.url === 'second') throw Error('official UI failed');
        },
      },
      plan,
      async (f) => persisted.push(f.url),
    ),
    /official UI failed/,
  );
  assert.deepEqual(attempted, ['first', 'second']);
  assert.deepEqual(plan.deleted, ['first']);
  assert.deepEqual(persisted, ['first']);
  assert.equal(plan.started, true);
});
test('Pause stops deletion before the next file and preserves completed results', async () => {
  const plan = { files: [{ url: 'a' }, { url: 'b' }], deleted: [] };
  let count = 0;
  await assert.rejects(
    removeStorage(
      { remove: async () => count++ },
      plan,
      async () => {},
      () => count === 1,
    ),
    /paused/,
  );
  assert.equal(count, 1);
  assert.deepEqual(plan.deleted, ['a']);
});
test('Deleted media links are cleared without removing local originals or video links', () => {
  const job = {
    rows: [
      {
        source: 'logo',
        url: 'https://static.igem.wiki/logo',
        localFile: '/original.png',
        attempted: true,
        processingComplete: true,
      },
      { source: 'video', url: 'https://video.igem.org/videos/embed/abc' },
    ],
    publication: { url: 'branch' },
  };
  const map = {
    logo: job.rows[0].url,
    video: job.rows[1].url,
    legacy: job.rows[0].url,
  };
  assert.equal(
    clearDeletedMappings(job, map, new Set([job.rows[0].url])),
    true,
  );
  assert.deepEqual(Object.keys(map), ['video']);
  assert.equal(job.rows[0].localFile, '/original.png');
  assert.equal(job.rows[0].attempted, false);
  assert.equal(job.publication.mediaRemoved, true);
  assert.ok(job.rows[1].url);
});
test('Storage scan rejects off-team folders, malformed IDs and unexpected file hosts', async () => {
  assert.throws(() => storageRoute('../6377'));
  assert.equal(
    folderFromURL(storageRoute('999') + '?path=logos', '6377', ''),
    null,
  );
  assert.equal(
    folderFromURL(storageRoute('6377') + '?path=elsewhere', '6377', 'logos'),
    null,
  );
  assert.equal(
    folderFromURL(
      storageRoute('6377') + '?path=logos/../other',
      '6377',
      'logos',
    ),
    null,
  );
  await assert.rejects(
    scanStorage(
      { list: async () => [{ url: 'https://evil.example/file' }] },
      '6377',
      'team',
    ),
    /Unrecognized/,
  );
  const sites = {
    tabs: { assets: { isClosed: () => false, url: () => storageRoute('999') } },
    log: () => {},
  };
  await assert.rejects(storageAdapter(sites).list('6377', ''), {
    code: 'SIGN_IN_REQUIRED',
  });
});

test('Storage access failures produce sign-in notifications without reading or deleting files', async () => {
  for (const scenario of [
    'missing',
    'closed',
    'login-redirect',
    'expired-redirect',
    '401',
    '403',
    'no-controls',
  ]) {
    let url =
      scenario === 'login-redirect'
        ? 'https://teams.igem.org/login'
        : storageRoute('6377');
    let readFiles = false;
    const page = {
      isClosed: () => scenario === 'closed',
      url: () => url,
      goto: async () => {
        if (scenario === 'expired-redirect')
          url = 'https://teams.igem.org/login';
        return { status: () => Number(scenario) || 200 };
      },
      getByRole: () => ({
        waitFor: async () => {
          throw Error('Timeout waiting for controls');
        },
      }),
      locator: () => {
        readFiles = true;
        throw Error('Must not read unauthenticated storage');
      },
    };
    const sites = {
      tabs: scenario === 'missing' ? {} : { assets: page },
      log: () => {},
    };
    const expected = ['401', '403', 'no-controls'].includes(scenario)
      ? 'STORAGE_ACCESS_REQUIRED'
      : 'SIGN_IN_REQUIRED';
    await assert.rejects(
      storageAdapter(sites).list('6377', ''),
      (e) => e.code === expected && /Sign in to iGEM Uploads/.test(e.message),
      scenario,
    );
    assert.equal(readFiles, false);
  }
});
