import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir, readFile, unlink } from 'node:fs/promises';
import { partitionSource } from '../scripts/source-parts.mjs';
import path from 'node:path';
import os from 'node:os';
import {
  safePath,
  extractZip,
  csvRows,
  hostedURL,
  repositoryFile,
  sourceFiles,
  publicationSources,
  manifest,
  ensureTemplateFonts,
  mergeChanges,
  crc32,
  uploadFolder,
} from './files.mjs';
import { OfficialSites, svgUpload } from './sites.mjs';
function zip(entries) {
  let offset = 0;
  const chunks = [],
    directory = [];
  for (const [name, text, bad = false] of entries) {
    const n = Buffer.from(name),
      data = Buffer.from(text),
      crc = (crc32(data) ^ 0xffffffff) >>> 0,
      h = Buffer.alloc(30),
      c = Buffer.alloc(46);
    h.writeUInt32LE(0x04034b50);
    h.writeUInt16LE(20, 4);
    h.writeUInt32LE(bad ? 0 : crc, 14);
    h.writeUInt32LE(data.length, 18);
    h.writeUInt32LE(data.length, 22);
    h.writeUInt16LE(n.length, 26);
    c.writeUInt32LE(0x02014b50);
    c.writeUInt16LE(20, 4);
    c.writeUInt16LE(20, 6);
    c.writeUInt32LE(bad ? 0 : crc, 16);
    c.writeUInt32LE(data.length, 20);
    c.writeUInt32LE(data.length, 24);
    c.writeUInt16LE(n.length, 28);
    c.writeUInt32LE(offset, 42);
    chunks.push(h, n, data);
    directory.push(c, n);
    offset += h.length + n.length + data.length;
  }
  const d = Buffer.concat(directory),
    e = Buffer.alloc(22);
  e.writeUInt32LE(0x06054b50);
  e.writeUInt16LE(entries.length, 8);
  e.writeUInt16LE(entries.length, 10);
  e.writeUInt32LE(d.length, 12);
  e.writeUInt32LE(offset, 16);
  return Buffer.concat([...chunks, d, e]);
}
await test('ZIP import rejects traversal, duplicates and corrupt content', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'rgel-zip-'));
  for (const [i, entries, ok] of [
    [0, [['app/test.ts', 'hello']], true],
    [1, [['../outside', 'bad']], false],
    [
      2,
      [
        ['one', 'a'],
        ['ONE', 'b'],
      ],
      false,
    ],
    [3, [['one', 'bad', true]], false],
  ]) {
    const file = path.join(root, i + '.zip');
    await writeFile(file, zip(entries));
    if (ok) {
      await extractZip(file, path.join(root, String(i)));
      assert.equal(
        await readFile(path.join(root, '0/app/test.ts'), 'utf8'),
        'hello',
      );
    } else await assert.rejects(extractZip(file, path.join(root, String(i))));
  }
  assert.throws(() => safePath(root, 'C:/secret'));
  assert.throws(() => safePath(root, '../outside'));
});
await test('CSV keeps quoted URLs and commas; only actual iGEM asset/embed URLs accepted', () => {
  assert.equal(
    csvRows('source,file\r\n"https://x/a,b","a""b.svg"\r\n')[0].file,
    'a"b.svg',
  );
  assert.throws(() => csvRows('a\n"bad'));
  assert.equal(
    hostedURL('https://static.igem.wiki/teams/6377/wiki/a.avif', 'image'),
    true,
  );
  for (const u of [
    'https://static.igem.wiki.evil.com/a',
    'https://name:pass@static.igem.wiki/a',
    'https://static.igem.wiki/YOUR-TEAM/uploaded-file',
    'http://static.igem.wiki/a',
  ])
    assert.equal(hostedURL(u, 'image'), false);
  assert.equal(hostedURL('https://video.igem.org/w/a', 'video'), false);
  assert.equal(
    hostedURL('https://video.igem.org/videos/embed/abcd-123', 'video'),
    true,
  );
});
await test('GitLab source allowlist excludes every Markdown, guide, manifest, credential and binary', async () => {
  for (const file of [
    'README.md',
    'STATIC-EXPORT.md',
    'app/NOTES.md',
    'UPLOAD-FIRST.txt',
    'upload-manifest.csv',
    'bundle-info.json',
    'app/LICENSE.txt',
    'LICENSE.md',
    '.env',
    'server/app.mjs',
    'node_modules/x.js',
    'assets/logo.png',
    'publication/url-check.json',
  ])
    assert.equal(repositoryFile(file), false, file);
  for (const file of [
    'app/home.tsx',
    'scripts/build-igem.mjs',
    'package-lock.json',
    'LICENSE',
    '.gitlab-ci.yml',
    'publication/content.json',
    'publication/fonts.css',
  ])
    assert.equal(repositoryFile(file), true, file);
  const root = await mkdtemp(path.join(os.tmpdir(), 'rgel-src-'));
  await mkdir(path.join(root, 'app'));
  await writeFile(path.join(root, 'app/home.tsx'), 'example');
  await writeFile(path.join(root, 'README.md'), 'exclude');
  assert.deepEqual(await sourceFiles(root), [
    { path: 'app/home.tsx', content: 'example' },
  ]);
});
await test('Diff skips identical files and never deletes remote files', () => {
  const remote = new Map([
    ['a', { content: 'same', last_commit_id: '1' }],
    ['b', { content: 'old', last_commit_id: '2' }],
    ['LICENSE', { content: 'original' }],
  ]);
  assert.deepEqual(
    mergeChanges(
      [
        { path: 'a', content: 'same' },
        { path: 'b', content: 'new' },
        { path: 'c', content: 'create' },
      ],
      remote,
    ),
    [
      { action: 'update', file_path: 'b', content: 'new', last_commit_id: '2' },
      { action: 'create', file_path: 'c', content: 'create' },
    ],
  );
});
await test('Converted AVIF URLs resume without a second file upload', async () => {
  const sites = new OfficialSites();
  sites.tabs.assets = {
    isClosed: () => false,
    url: () => 'https://teams.igem.org/6377/deliverables/wiki/uploads',
    locator: () => ({
      evaluateAll: async () => [
        'https://static.igem.wiki/teams/6377/wiki/rgel-aaaaaaaaaaaaaaaaaaaaaaaa.avif',
      ],
    }),
  };
  assert.equal(
    await sites.asset(
      { hash: 'a'.repeat(64), kind: 'image', attempted: true },
      '/unused',
      '6377',
      async () => {},
    ),
    'https://static.igem.wiki/teams/6377/wiki/rgel-aaaaaaaaaaaaaaaaaaaaaaaa.avif',
  );
});
await test('Resuming an attempted upload refreshes stale listing without uploading again', async () => {
  const sites = new OfficialSites();
  let refreshed = 0;
  const url =
    'https://static.igem.wiki/teams/6377/wiki/rgel-' + 'a'.repeat(24) + '.avif';
  sites.assetProgress = async () => ({ text: '', failed: false });
  sites.tabs.assets = {
    isClosed: () => false,
    url: () => 'https://teams.igem.org/6377/deliverables/wiki/uploads',
    reload: async () => {
      refreshed++;
    },
    locator: (selector) => {
      assert.match(selector, /^a\[/);
      return { evaluateAll: async () => (refreshed ? [url] : []) };
    },
  };
  assert.equal(
    await sites.asset(
      {
        hash: 'a'.repeat(64),
        kind: 'image',
        file: 'logo.png',
        attempted: true,
      },
      '/unused',
      '6377',
      async () => {
        throw Error('Must not upload');
      },
    ),
    url,
  );
  assert.equal(refreshed, 1);
  await assert.rejects(
    sites.asset(
      { hash: 'a'.repeat(64), kind: 'image' },
      '/unused',
      '999',
      async () => {},
    ),
    /for this team/,
  );
});

await test('Completed processing refreshes the folder and captures the returned converted URL', async () => {
  const messages = [],
    sites = new OfficialSites((text) => messages.push(text));
  let refreshed = 0;
  sites.assetProgress = async () => ({ text: 'Completed', failed: false });
  const page = {
    reload: async () => {
      refreshed++;
    },
  };
  const url =
    'https://static.igem.wiki/teams/6377/wiki/rgel-' +
    'a'.repeat(24) +
    '.png.avif';
  assert.equal(
    await sites.waitForAsset(
      page,
      { hash: 'a'.repeat(64), file: 'logo.png' },
      async () => (refreshed ? url : undefined),
    ),
    url,
  );
  assert.equal(refreshed, 1);
  assert.ok(messages.some((text) => text.includes('completed')));
});

await test('Active processing is not refreshed; failed jobs stop with their actual reason', async () => {
  const sites = new OfficialSites();
  let checks = 0,
    refreshed = 0;
  sites.assetProgress = async () => ({
    text: ++checks < 3 ? 'Processing... 50%' : 'Completed',
    failed: false,
  });
  const page = {
    reload: async () => {
      assert.ok(checks >= 3);
      refreshed++;
    },
  };
  const row = { hash: 'a'.repeat(64), file: 'logo.png' };
  assert.equal(
    await sites.waitForAsset(
      page,
      row,
      async () => (refreshed ? 'saved-url' : undefined),
      { resume: true, pollMs: 1 },
    ),
    'saved-url',
  );
  assert.equal(refreshed, 1);
  sites.assetProgress = async () => ({
    text: 'Unsupported image format',
    failed: true,
  });
  await assert.rejects(
    sites.waitForAsset(page, row, async () => undefined),
    /Unsupported image format/,
  );
  assert.equal(refreshed, 1);
  assert.equal(row.rejected, true);
  assert.match(row.uploadError, /Unsupported image format/);
  delete row.uploadError;
  delete row.rejected;
  sites.assetProgress = async () => ({ text: 'Queued', failed: false });
  await assert.rejects(
    sites.waitForAsset(page, row, async () => undefined, {
      resume: true,
      timeoutMs: 8,
      pollMs: 1,
    }),
    /still pending/,
  );
  assert.equal(refreshed, 1);
  sites.stopped = true;
  await assert.rejects(
    sites.waitForAsset(page, row, async () => undefined),
    /Paused/,
  );
});

await test('GitLab plan creates LICENSE on the review branch when main has none', async () => {
  const calls = [];
  let remoteLicense;
  let uploaded = false;
  const sites = new OfficialSites();
  sites.git = async (method, url, body) => {
    calls.push({ method, url, body });
    if (method === 'POST') {
      if (url.endsWith('/repository/commits')) uploaded = true;
      return {
        status: 201,
        data: url.endsWith('/merge_requests')
          ? { web_url: 'https://gitlab.igem.org/2026/test/-/merge_requests/1' }
          : { id: 'commit' },
      };
    }
    if (url.endsWith('/branches/wiki-upload-test'))
      return uploaded
        ? { status: 200, data: { commit: { id: 'commit' } } }
        : { status: 404, data: { message: 'not found' } };
    if (url.includes('/merge_requests?'))
      return { status: 200, data: [] };
    if (url.endsWith('/projects/2026%2Ftest'))
      return {
        status: 200,
        data: { path_with_namespace: '2026/test', default_branch: 'main' },
      };
    if (url.endsWith('/branches/main'))
      return { status: 200, data: { commit: { id: 'base123' } } };
    if (url.includes('/files/LICENSE?') && remoteLicense !== undefined)
      return {
        status: 200,
        data: {
          content: Buffer.from(remoteLicense).toString('base64'),
          last_commit_id: 'license123',
        },
      };
    if (url.includes('/files/app%2Fhome.tsx?'))
      return {
        status: 200,
        data: {
          content: Buffer.from('old').toString('base64'),
          last_commit_id: 'prior123',
        },
      };
    return { status: 404, data: { message: 'not found' } };
  };
  const plan = await sites.plan('test', [
    { path: 'app/home.tsx', content: 'new' },
    { path: 'publication/config.json', content: '{}' },
    { path: 'LICENSE', content: 'CC-BY-4.0' },
  ]);
  assert.equal(plan.sha, 'base123');
  assert.equal(plan.actions.length, 3);
  assert.deepEqual(
    plan.actions.find((a) => a.file_path === 'LICENSE'),
    { action: 'create', file_path: 'LICENSE', content: 'CC-BY-4.0' },
  );
  assert.equal(calls.filter((c) => c.method === 'POST').length, 0);
  assert.equal(plan.actions[0].last_commit_id, 'prior123');
  const result = await sites.commit(plan, 'wiki-upload-test');
  assert.match(result.url, /merge_requests\/1$/);
  const posts = calls.filter((c) => c.method === 'POST');
  assert.equal(posts.length, 2);
  assert.equal(posts[0].body.branch, 'wiki-upload-test');
  assert.equal(posts[0].body.start_sha, 'base123');
  assert.equal(posts[1].body.target_branch, 'main');
  assert.ok(posts[0].body.actions.every((a) => a.action !== 'delete'));
  remoteLicense = 'CC-BY-4.0';
  assert.deepEqual(
    (await sites.plan('test', [{ path: 'LICENSE', content: 'CC-BY-4.0' }]))
      .actions,
    [],
  );
  remoteLicense = 'previous licence';
  assert.deepEqual(
    (await sites.plan('test', [{ path: 'LICENSE', content: 'CC-BY-4.0' }]))
      .actions,
    [
      {
        action: 'update',
        file_path: 'LICENSE',
        content: 'CC-BY-4.0',
        last_commit_id: 'license123',
      },
    ],
  );
  sites.git = async () => ({
    status: 200,
    data: { path_with_namespace: '2026/different', default_branch: 'main' },
  });
  await assert.rejects(sites.plan('test', []), /identity/);
});

for (const sourceVersion of [1, 2])
await test(`Local HTTP v${sourceVersion} import validates its session, ZIP64 exports, mapping and resume`, async (t) => {
  const { spawn } = await import('node:child_process');
  const { fileURLToPath } = await import('node:url');
  const { zipStream } = await import('../server/export-zip.mjs');
  const root = await mkdtemp(path.join(os.tmpdir(), 'rgel-http-'));
  const child = spawn(process.execPath, ['server.mjs', '--no-browser'], {
    cwd: process.env.HELPER_TEST_ROOT || fileURLToPath(new URL('.', import.meta.url)),
    env: { ...process.env, HELPER_JOBS_DIR: root, HELPER_PORT: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(() => child.kill());
  const address = await new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(
      () => reject(Error('Server startup timed out')),
      10000,
    );
    child.stdout.on('data', (c) => {
      output += c;
      const match = output.match(
        /http:\/\/127\.0\.0\.1:\d+\/\?session=[a-f0-9]+/,
      );
      if (match) {
        clearTimeout(timer);
        resolve(match[0]);
      }
    });
    child.on('error', reject);
  });
  const url = new URL(address),
    token = url.searchParams.get('session'),
    base = url.origin;
  assert.equal((await fetch(base + '/api/state')).status, 403);
  assert.equal(
    (
      await fetch(base + '/api/state', {
        headers: {
          'X-Helper-Session': token,
          Origin: 'https://unrelated.example',
        },
      })
    ).status,
    403,
  );
  const welcome = await fetch(address),
    cookie = welcome.headers.get('set-cookie').split(';')[0];
  assert.equal(welcome.status, 200);
  assert.equal(
    (await fetch(base, { headers: { Cookie: cookie } })).status,
    200,
  );
  assert.equal((await fetch(base)).status, 403);
  const call = async (name, body) => {
    const r = await fetch(base + '/api/' + name, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        'X-Helper-Session': token,
        Origin: base,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: r.status, data: await r.json() };
  };
  assert.equal((await call('new', { teamId: '6377' })).status, 200);
  const contentFiles = partitionSource(
    { format: 'prion-wiki-source', version: 1, values: { brand: 'Import fixture' } },
    { force: sourceVersion === 2 },
  );
  const source = zip([
    [
      'publication/config.json',
      JSON.stringify({
        teamSlug: 'imperial-college',
        repository: 'https://gitlab.igem.org/2026/imperial-college',
        source: 'publication/content.json',
        mediaMap: 'publication/media-map.json',
        review: 'publication/review.json',
      }),
    ],
    ...contentFiles.map((file) => [file.path, file.content]),
    ['publication/media-map.json', '{}'],
    ['publication/recording-todos.json', '[{"kind":"video","source":"missing.mp4"}]'],
    [
      'upload-manifest.csv',
      'source,file,kind\n/templates/logo.png,assets/icons/logo.png,image\n',
    ],
  ]);
  const chunks = [];
  for await (const c of zipStream([
    { name: 'assets/icons/logo.png', size: 4, data: Buffer.from('test') },
  ]))
    chunks.push(c);
  for (const [kind, data] of [
    ['source', source],
    ['assets', Buffer.concat(chunks)],
  ]) {
    const response = await fetch(base + '/api/import?kind=' + kind, {
      method: 'POST',
      headers: { 'X-Helper-Session': token, Origin: base },
      body: data,
    });
    assert.equal(response.status, 200, await response.text());
  }
  if (sourceVersion === 2) {
    const importState = (await call('state')).data;
    const part = contentFiles[1];
    const partPath = path.join(root, importState.job.id, 'source', part.path);
    await writeFile(partPath, part.content + ' ');
    const corrupt = await call('prepare', {});
    assert.equal(corrupt.status, 400);
    assert.match(corrupt.data.error, /incomplete or changed/);
    assert.ok(!(await call('state')).data.job.team);
    await unlink(partPath);
    assert.equal((await call('prepare', {})).status, 400);
    assert.ok(!(await call('state')).data.job.team);
    await writeFile(partPath, part.content);
    // Resume the already-extracted import left behind by an older helper.
    const resumed = await call('resume', { id: importState.job.id });
    assert.equal(resumed.status, 200, JSON.stringify(resumed.data));
    assert.equal((await call('state')).data.job.team, 'imperial-college');
  }
  const prepared = await call('prepare', {});
  assert.equal(prepared.status, 200, JSON.stringify(prepared.data));
  const state = (await call('state')).data;
  assert.equal(state.job.rows.length, 1);
  assert.equal(state.job.recordingTodoCount, 1);
  assert.equal(uploadFolder(state.job.rows[0]), 'icons');
  assert.equal((await call('scan-storage', {})).status, 202);
  let scanState;
  for (let attempt = 0; attempt < 20; attempt++) {
    scanState = (await call('state')).data;
    if (!scanState.busy) break;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.equal(scanState.activity.phase, 'error');
  assert.equal(scanState.activity.action, 'scan-storage');
  assert.equal(scanState.activity.code, 'SIGN_IN_REQUIRED');
  assert.match(scanState.activity.message, /Sign in to iGEM Uploads/);
  assert.equal(scanState.cleanup, null);
  assert.equal(
    (
      await call('mapping', {
        source: '/templates/logo.png',
        url: 'https://evil.example/logo.png',
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await call('mapping', {
        source: '/templates/logo.png',
        url: 'https://static.igem.wiki/teams/6377/wiki/logo.avif',
      })
    ).status,
    200,
  );
  assert.equal((await call('resume', { id: state.job.id })).status, 200);
  assert.match((await call('state')).data.job.rows[0].url, /logo.avif$/);
  assert.equal((await call('resume', { id: '../../outside' })).status, 400);
  assert.equal(
    (
      await call('review', {
        attributionUrl: 'https://teams.igem.org/wiki/6377/attributions',
        systemFonts: true,
      })
    ).status,
    202,
  );
  let reviewState;
  for (let attempt = 0; attempt < 40; attempt++) {
    reviewState = (await call('state')).data;
    if (!reviewState.busy) break;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.equal(reviewState.activity.phase, 'error');
  assert.match(reviewState.activity.message, /GitLab/);
  assert.ok(!/checkbox|reviewer/i.test(reviewState.activity.message));

  const mapped = JSON.parse(
    await readFile(
      path.join(root, state.job.id, 'source/publication/media-map.json'),
      'utf8',
    ),
  );
  assert.equal(
    mapped['/templates/logo.png'],
    'https://static.igem.wiki/teams/6377/wiki/logo.avif',
  );
});

await test('Recording capture is scoped to one transfer and detaches on pause', async () => {
  for (const paused of [false, true]) {
    const sites = new OfficialSites();
    let listener,
      saved = 0,
      detached = 0,
      selected = 0;
    sites.stopped = paused;
    sites.tabs.media = {
      isClosed: () => false,
      url: () => 'https://video.igem.org/videos/publish',
      on: (_event, callback) => {
        listener = callback;
      },
      off: (_event, callback) => {
        assert.equal(callback, listener);
        detached++;
      },
      bringToFront: async () => {},
      locator: () => ({
        count: async () => 1,
        setInputFiles: async () => {
          selected++;
          if (!paused)
            await listener({
              url: () => 'https://video.igem.org/api/v1/videos/upload',
              ok: () => true,
              json: async () => ({ video: { uuid: 'test-uuid' } }),
            });
        },
      }),
    };
    const row = { localFile: '/fixture.mp4' };
    if (paused)
      await assert.rejects(
        sites.video(row, '/unused', async () => {
          saved++;
        }),
        /Paused/,
      );
    else
      assert.equal(
        await sites.video(row, '/unused', async () => {
          saved++;
        }),
        'https://video.igem.org/videos/embed/test-uuid',
      );
    assert.equal(selected, 1);
    assert.equal(detached, 1);
    assert.ok(saved >= 1);
    if (paused)
      await assert.rejects(
        sites.video(row, '/unused', async () => {}),
        /already started/,
      );
    else
      assert.equal(
        await sites.video(row, '/unused', async () => {}),
        'https://video.igem.org/videos/embed/test-uuid',
      );
    assert.equal(selected, 1);
  }
});

await test('SVG upload uses explicit image MIME and preserves vector markup', async () => {
  const artwork =
    '<svg xmlns="http://www.w3.org/2000/svg"><path fill="#8f50ff" d="M0 0h10v10z"/></svg>';
  const input =
    '\ufeff<?xml version="1.0" encoding="UTF-8"?>\n<!-- Export -->\n<!DOCTYPE svg PUBLIC "SVG" "example.dtd">\n' +
    artwork;
  const payload = svgUpload(Buffer.from(input), 'logo.svg');
  assert.equal(payload.mimeType, 'image/svg+xml');
  assert.equal(payload.name, 'logo.svg');
  assert.equal(payload.buffer.toString(), artwork);
  assert.throws(
    () => svgUpload(Buffer.from('<html><svg/></html>'), 'bad.svg'),
    /does not contain/,
  );
  assert.throws(
    () =>
      svgUpload(
        Buffer.from('<!DOCTYPE svg [<!ENTITY x "test">]><svg>&x;</svg>'),
        'entities.svg',
      ),
    /entity definitions/,
  );
  const logo = await readFile(
    new URL(
      '../public/templates/regelerate/sponsor-logos/geneious.svg',
      import.meta.url,
    ),
  );
  assert.match(logo.toString(), /^<\?xml/);
  assert.match(svgUpload(logo, 'geneious.svg').buffer.toString(), /^<svg/);
});

await test('Five completed uploads share one refresh and SVG MIME reaches the file input', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'rgel-batch-'));
  const sites = new OfficialSites(),
    rows = [],
    completed = new Set(),
    payloads = [];
  let current,
    refreshes = 0,
    saves = 0;
  for (let i = 0; i < 5; i++) {
    const file = path.join(root, i + '.svg');
    await writeFile(
      file,
      '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"><title>' +
        i +
        '</title></svg>',
    );
    rows.push({
      hash: String(i + 1).repeat(64),
      kind: 'image',
      file: i + '.svg',
      localFile: file,
    });
  }
  const page = {
    isClosed: () => false,
    url: () => 'https://teams.igem.org/6377/deliverables/wiki/uploads',
    on: () => {},
    off: () => {},
    reload: async () => {
      assert.equal(completed.size, 5);
      refreshes++;
    },
    locator: (selector) =>
      selector.startsWith('a[')
        ? {
            evaluateAll: async () =>
              refreshes
                ? [...completed].map(
                    (name) =>
                      'https://static.igem.wiki/teams/6377/wiki/' +
                      name +
                      '.avif',
                  )
                : [],
          }
        : {
            count: async () => 1,
            setInputFiles: async (payload) => {
              current = payload.name;
              payloads.push(payload);
            },
          },
    getByRole: () => ({
      waitFor: async () => {},
      isEnabled: async () => true,
      click: async (options) => {
        if (options?.trial) return;
        completed.add(current);
      },
    }),
  };
  sites.tabs.assets = page;
  sites.assetProgress = async (_page, name) => ({
    text: completed.has(name) ? 'Completed' : '',
    failed: false,
  });
  await sites.assetBatch(rows, root, '6377', async () => {
    saves++;
  });
  assert.equal(refreshes, 1);
  assert.equal(payloads.length, 5);
  assert.ok(saves >= 5);
  assert.ok(rows.every((row) => row.url.endsWith('.svg.avif')));
  assert.ok(
    payloads.every(
      (payload) =>
        payload.mimeType === 'image/svg+xml' &&
        payload.buffer.toString().startsWith('<svg'),
    ),
  );
  await sites.assetBatch(rows, root, '6377', async () => {});
  assert.equal(refreshes, 1);
  assert.equal(payloads.length, 5);
});

await test('Batch resume keeps completed uploads and partial URL progress', async () => {
  const sites = new OfficialSites();
  let refreshes = 0,
    saves = 0;
  const rows = [1, 2].map((n) => ({
    hash: String(n).repeat(64),
    kind: 'image',
    file: n + '.png',
    attempted: true,
    processingComplete: true,
  }));
  const url =
    'https://static.igem.wiki/teams/6377/wiki/rgel-' + '1'.repeat(24) + '.avif';
  sites.tabs.assets = {
    isClosed: () => false,
    url: () => 'https://teams.igem.org/6377/deliverables/wiki/uploads',
    reload: async () => {
      refreshes++;
    },
    locator: (selector) => {
      assert.match(selector, /^a\[/);
      return { evaluateAll: async () => (refreshes ? [url] : []) };
    },
  };
  await assert.rejects(
    sites.assetBatch(
      rows,
      '/unused',
      '6377',
      async () => {
        saves++;
      },
      { timeoutMs: 8, pollMs: 1 },
    ),
    /Some completed files/,
  );
  assert.equal(refreshes, 1);
  assert.equal(rows[0].url, url);
  assert.equal(rows[1].url, undefined);
  assert.ok(saves > 0);
});

await test('A matched 422 stops promptly, is saved, and never auto-retries', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'rgel-reject-')),
    file = path.join(root, 'bad.png');
  await writeFile(file, 'fixture');
  const sites = new OfficialSites();
  let listener,
    current,
    clicks = 0,
    detached = 0;
  const row = {
    hash: 'f'.repeat(64),
    file: 'bad.png',
    localFile: file,
    kind: 'image',
  };
  sites.tabs.assets = {
    isClosed: () => false,
    url: () => 'https://teams.igem.org/6377/deliverables/wiki/uploads',
    on: (_event, fn) => {
      listener = fn;
    },
    off: () => {
      detached++;
    },
    locator: (selector) =>
      selector.startsWith('a[')
        ? { evaluateAll: async () => [] }
        : {
            count: async () => 1,
            setInputFiles: async (input) => {
              current = input;
            },
          },
    getByRole: () => ({
      waitFor: async () => {},
      isEnabled: async () => true,
      click: async (options) => {
        if (options?.trial) return;
        clicks++;
        listener({
          status: () => 422,
          request: () => ({
            method: () => 'POST',
            postDataBuffer: () =>
              Buffer.from('filename="' + path.basename(current) + '"'),
          }),
          json: async () => ({
            message: 'File mime-type application/xml not allowed',
          }),
        });
        await Promise.resolve();
      },
    }),
  };
  await assert.rejects(
    sites.asset(row, root, '6377', async () => {}, { deferRefresh: true }),
    /422.*application\/xml/,
  );
  assert.equal(row.rejected, true);
  assert.equal(detached, 1);
  assert.equal(clicks, 1);
  await assert.rejects(
    sites.asset(row, root, '6377', async () => {}, { deferRefresh: true }),
    /422/,
  );
  assert.equal(clicks, 1);
});

await test('Export media categories use safe folders and preserve original URL identity', async () => {
  const { mediaFolder } = await import('../scripts/export-media.mjs');
  for (const [source, kind, expected] of [
    ['/templates/a/hero.png', 'image', 'banners'],
    ['/sponsor-logos/benchling.svg', 'image', 'logos'],
    ['/a/favicon.svg', 'image', 'icons'],
    ['/api/media/uuid.png', 'image', 'images'],
    ['/api/media/uuid.pdf', 'image', 'documents'],
    ['/api/media/uuid.glb', 'model', 'models'],
    ['https://cdn.example/test.woff2?x=1', 'font', 'fonts'],
    ['/templates/runtime/pdfjs-6.4.299-worker.js', 'runtime', 'runtime'],
    ['/api/media/uuid.mp4', 'video', 'videos'],
    ['/api/media/uuid.mp3', 'audio', 'audio'],
    ['https://video.igem.org/videos/embed/id', 'embed', 'videos'],
  ])
    assert.equal(mediaFolder(source, kind), expected, source);
  assert.equal(
    mediaFolder('/api/media/uuid.png', 'image', {
      'site:header': '{"logo":"/api/media/uuid.png"}',
    }),
    'logos',
  );
  assert.equal(uploadFolder({ file: 'assets/logos/unique-logo.svg' }), 'logos');
  assert.equal(uploadFolder({ file: 'assets/old-flat-logo.svg' }), '');
  assert.equal(
    uploadFolder({ file: 'custom-font.woff2', folder: 'fonts' }),
    'fonts',
  );
  assert.throws(() => uploadFolder({ file: 'assets/../../escape.svg' }));
  assert.throws(() => uploadFolder({ folder: '../private' }));
});

await test('Helper accepts every exported static folder, including the PDF runtime', async () => {
  const { mediaFolder, PDF_WORKER_SOURCE } = await import('../scripts/export-media.mjs');
  for (const [source, kind] of [
    ['/templates/a/hero.png', 'image'],
    ['/sponsor-logos/logo.svg', 'image'],
    ['/a/favicon.svg', 'image'],
    ['/api/media/photo.jpg', 'image'],
    ['/api/media/notebook.pdf', 'pdf'],
    ['/api/media/model.glb', 'model'],
    ['/templates/fonts/font.ttf', 'font'],
    [PDF_WORKER_SOURCE, 'runtime'],
  ]) {
    const folder = mediaFolder(source, kind);
    const row = { source, kind, file: `assets/${folder}/${path.basename(source)}` };
    assert.equal(uploadFolder(row), folder);
    assert.equal(uploadFolder({ ...row, folder }), folder);
  }
  assert.throws(() => uploadFolder({ file: 'assets/private/worker.js' }), /Unsupported static-media folder/);
  assert.throws(() => uploadFolder({ folder: 'runtime/../private' }), /Unsupported upload folder/);
});

function folderFixture({
  folder = 'logos',
  existing = false,
  open = false,
  failFill = false,
  failConfirm = false,
  lostInput = false,
} = {}) {
  const sites = new OfficialSites();
  const exists = existing;
  let url = 'https://teams.igem.org/6377/deliverables/wiki/uploads',
    inputValue = '',
    blurred = false;
  const counts = { created: 0, opened: 0, entered: 0, cancelled: 0 };
  const link = {
    waitFor: async () => {
      if (!exists) throw Error('Folder absent');
    },
    click: async () => {
      assert.ok(exists);
      assert.equal(open, false);
      counts.entered++;
      url += '?path=' + folder;
    },
  };
  const dialog = {
    filter: () => dialog,
    // iGEM's form has zero height: its popup is positioned fixed.
    isVisible: async () => false,
    locator: (selector) => {
      assert.equal(selector, 'input[name="name"]');
      return {
        isVisible: async () => open,
        waitFor: async ({ state }) => {
          if (state === 'visible') {
            assert.ok(open);
            if (failFill) throw Error('Missing input');
          } else if (open) throw Error('Dialog still open');
        },
        fill: async (value) => {
          assert.ok(open);
          if (failFill) throw Error('Missing input');
          inputValue = value;
        },
        pressSequentially: async (value) => {
          inputValue += value;
        },
        press: async (key) => {
          assert.equal(key, 'Tab');
          blurred = true;
        },
        inputValue: async () => (lostInput ? '' : inputValue),
      };
    },
    getByRole: (role, options) => {
      assert.equal(role, 'button');
      return {
        click: async () => {
          if (options.name === 'Cancel') {
            counts.cancelled++;
            open = false;
            return;
          }
          assert.equal(options.name, 'Create');
          assert.equal(inputValue, folder);
          assert.equal(blurred, true);
          counts.created++;
          if (!failConfirm) {
            // iGEM navigates directly; the empty folder has no parent link.
            assert.equal(exists, false);
            url += '?path=' + folder;
            counts.entered++;
            open = false;
          }
        },
      };
    },
    waitFor: async () => {
      throw Error('The zero-height form cannot be used to wait for the popup');
    },
  };
  sites.tabs.assets = {
    isClosed: () => false,
    url: () => url,
    getByRole: (role) =>
      role === 'dialog'
        ? dialog
        : {
            waitFor: async () => {},
            click: async () => {
              assert.equal(open, false, 'Do not click behind an open dialog');
              open = true;
              counts.opened++;
            },
          },
    locator: (selector) =>
      selector === 'form'
        ? dialog
        : selector.startsWith('a[')
          ? { count: async () => (exists ? 1 : 0), first: () => link }
          : { waitFor: async () => {} },
    waitForURL: async (predicate) => assert.ok(predicate(new URL(url))),
  };
  return { sites, counts };
}

await test('Folder creation works with a zero-height form around an existing or new fixed-position popup', async () => {
  for (const open of [false, true]) {
    const { sites, counts } = folderFixture({ open });
    await sites.assetFolder('6377', 'logos');
    await sites.assetFolder('6377', 'logos');
    assert.equal(counts.created, 1);
    assert.equal(counts.opened, open ? 0 : 1);
    assert.equal(counts.entered, 1);
    await assert.rejects(
      sites.assetFolder('6377', '../outside'),
      /Invalid upload folder/,
    );
    await assert.rejects(sites.assetFolder('999', 'logos'), /for this team/);
  }
});

await test('Folder creation never submits when typed text is lost', async () => {
  const { sites, counts } = folderFixture({ lostInput: true });
  await assert.rejects(sites.assetFolder('6377', 'logos'), /Could not enter/);
  assert.equal(counts.created, 0);
});

await test('Every static export category opens and reuses its browser upload folder', async () => {
  const { mediaFolder, PDF_WORKER_SOURCE } = await import('../scripts/export-media.mjs');
  for (const [source, kind] of [
    ['/hero.png', 'image'], ['/sponsor-logos/logo.svg', 'image'],
    ['/favicon.svg', 'image'], ['/photo.jpg', 'image'], ['/book.pdf', 'pdf'],
    ['/model.glb', 'model'], ['/font.ttf', 'font'], [PDF_WORKER_SOURCE, 'runtime'],
  ]) {
    const folder = uploadFolder({ file: `assets/${mediaFolder(source, kind)}/file` });
    for (const existing of [false, true]) {
      const { sites, counts } = folderFixture({ folder, existing });
      await sites.assetFolder('6377', folder);
      await sites.assetFolder('6377', folder);
      assert.equal(counts.created, existing ? 0 : 1);
      assert.equal(counts.entered, 1);
    }
  }
  const { sites } = folderFixture();
  await assert.rejects(sites.assetFolder('6377', 'private'), /Invalid upload folder/);
  await assert.rejects(sites.assetFolder('bad-id', 'runtime'), /Invalid upload folder/);
});
await test('Existing folders are reused without submission, including with a leftover dialog', async () => {
  for (const open of [false, true]) {
    const { sites, counts } = folderFixture({ existing: true, open });
    await sites.assetFolder('6377', 'logos');
    assert.equal(counts.created, 0);
    assert.equal(counts.cancelled, open ? 1 : 0);
    assert.equal(counts.entered, 1);
  }
});
await test('Missing folder field and unconfirmed creation report recovery instructions without repeated submissions', async () => {
  for (const failFill of [false, true]) {
    const { sites, counts } = folderFixture({
      failFill,
      failConfirm: !failFill,
    });
    await assert.rejects(
      sites.assetFolder('6377', 'logos'),
      failFill ? /Could not enter.*logos/ : /not confirmed.*logos/,
    );
    assert.equal(counts.created, failFill ? 0 : 1);
    assert.equal(counts.entered, 0);
  }
});
await test('Pause before folder submission leaves the dialog resumable', async () => {
  const { sites, counts } = folderFixture({ open: true });
  sites.stopped = true;
  await assert.rejects(
    sites.assetFolder('6377', 'logos'),
    /Paused before creating/,
  );
  assert.equal(counts.created, 0);
  sites.stopped = false;
  await sites.assetFolder('6377', 'logos');
  assert.equal(counts.created, 1);
  assert.equal(counts.opened, 0);
});

await test('One upload action waits for delayed file readiness; timeout and pause never submit', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'rgel-readiness-'));
  const file = path.join(root, 'logo.png');
  await writeFile(file, 'fixture');
  for (const outcome of ['ready', 'timeout', 'paused']) {
    const sites = new OfficialSites();
    const row = {
      hash: 'a'.repeat(64),
      kind: 'image',
      file: 'logo.png',
      localFile: file,
    };
    let ready = false,
      selected = 0,
      submitted = 0,
      savedAttempt = false;
    sites.tabs.assets = {
      isClosed: () => false,
      url: () => 'https://teams.igem.org/6377/deliverables/wiki/uploads',
      on: () => {},
      off: () => {},
      locator: (selector) =>
        selector.startsWith('a[')
          ? { evaluateAll: async () => [] }
          : {
              count: async () => 1,
              setInputFiles: async () => {
                selected++;
              },
            },
      getByRole: () => ({
        waitFor: async () => {},
        isEnabled: async () => ready,
        click: async (options) => {
          if (options?.trial) {
            assert.equal(row.attempted, undefined);
            assert.equal(options.timeout, 15000);
            await new Promise((resolve) => setTimeout(resolve, 10));
            if (outcome === 'timeout') throw Error('Still disabled');
            ready = true;
            if (outcome === 'paused') sites.stopped = true;
            return;
          }
          assert.ok(ready, 'Wait for the form before submitting');
          assert.ok(savedAttempt, 'Persist the attempt before submitting');
          submitted++;
        },
      }),
    };
    sites.waitForAsset = async () =>
      'https://static.igem.wiki/teams/6377/wiki/logo.avif';
    const upload = sites.asset(row, root, '6377', async () => {
      savedAttempt = row.attempted;
    });
    if (outcome === 'ready') {
      assert.match(await upload, /logo.avif$/);
      assert.equal(submitted, 1);
    } else {
      await assert.rejects(
        upload,
        outcome === 'timeout' ? /did not become ready/ : /Paused/,
      );
      assert.equal(submitted, 0);
      assert.equal(row.attempted, undefined);
    }
    assert.equal(selected, 1);
  }
});

async function seedCurrentCompilerRequirements(root) {
  for (const name of ['package.json', 'package-lock.json', 'app/pdf-parts-viewer.ts', 'publication/katex-LICENSE.txt', 'publication/pdf-processing-LICENSES.txt']) {
    await mkdir(path.dirname(path.join(root, name)), { recursive: true });
    await writeFile(path.join(root, name), await readFile(new URL('../' + name, import.meta.url)));
  }
}

await test('Older exports receive the current compiler without publishing review attestations or Markdown', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'rgel-old-export-'));
  await mkdir(path.join(root, 'scripts'));
  await mkdir(path.join(root, 'publication'));
  await writeFile(
    path.join(root, 'scripts/build-igem.mjs'),
    'old checklist gate',
  );
  await writeFile(
    path.join(root, 'publication/review.json'),
    '{"sourceReviewed":false}',
  );
  await writeFile(path.join(root, 'README.md'), 'guide');
  await assert.rejects(publicationSources(root), /prepare fresh two ZIPs/);
  await seedCurrentCompilerRequirements(root);
  const files = await publicationSources(root);
  assert.deepEqual(
    files.map((f) => f.path),
    [
      '.gitlab-ci.yml',
      'app/pdf-parts-viewer.ts',
      'LICENSE',
      'ops/igem.gitlab-ci.yml',
      'package-lock.json',
      'package.json',
      'publication/katex-LICENSE.txt',
      'publication/pdf-processing-LICENSES.txt',
      'scripts/artifact-size.mjs',
      'scripts/build-igem.mjs',
      'scripts/export-media.mjs', 'scripts/export-recordings.mjs',
      'scripts/export-static.mjs',
      'scripts/google-fonts.mjs',
      'scripts/image-export.mjs',
      'scripts/pdf-parts.mjs',
      'scripts/publication-runtime.mjs',
      'scripts/share-publication-assets.mjs',
      'scripts/source-parts.mjs',
      'scripts/static-runtime.ts',
    ],
  );
  assert.equal(
    files.find((f) => f.path === 'scripts/build-igem.mjs').content,
    await readFile(
      new URL('../scripts/build-igem.mjs', import.meta.url),
      'utf8',
    ),
  );
  assert.ok(
    !files
      .find((f) => f.path === 'scripts/build-igem.mjs')
      .content.includes('review.reviewer'),
  );
  assert.equal(
    files.find((f) => f.path === 'LICENSE').content,
    await readFile(
      new URL('../publication/wiki-LICENSE.txt', import.meta.url),
      'utf8',
    ),
  );
  await writeFile(path.join(root, 'LICENSE'), 'old export licence');
  assert.equal(
    (await publicationSources(root)).find((f) => f.path === 'LICENSE').content,
    files.find((f) => f.path === 'LICENSE').content,
  );
  assert.equal(
    await readFile(path.join(root, 'publication/review.json'), 'utf8'),
    '{"sourceReviewed":false}',
  );
});

await test('Older exports replace the original Yarn pipeline and publish the generated wiki folder', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'rgel-old-pipeline-'));
  const original = `image: node:22
pages:
  stage: build
  before_script:
    - yarn install --frozen-lockfile
  script:
    - yarn build
    - cp -a dist/. public/
  artifacts:
    paths:
      - public
`;
  const expected = await readFile(
    new URL('../ops/igem.gitlab-ci.yml', import.meta.url),
    'utf8',
  );
  // Missing configuration is supplied too, including the source copy used by the compiler.
  await seedCurrentCompilerRequirements(root);
  let files = await publicationSources(root);
  for (const name of ['.gitlab-ci.yml', 'ops/igem.gitlab-ci.yml'])
    assert.equal(files.find((f) => f.path === name).content, expected);
  await mkdir(path.join(root, 'ops'));
  await writeFile(path.join(root, '.gitlab-ci.yml'), original);
  await writeFile(path.join(root, 'ops/igem.gitlab-ci.yml'), original);
  files = await publicationSources(root);
  for (const name of ['.gitlab-ci.yml', 'ops/igem.gitlab-ci.yml']) {
    const file = files.find((f) => f.path === name);
    assert.equal(file.content, expected);
    assert.doesNotMatch(file.content, /yarn|dist\/|^pages:/m);
    assert.match(file.content, /publish: igem-build\/public/);
  }
  const remote = new Map([
    ['.gitlab-ci.yml', { content: original, last_commit_id: 'old-pipeline' }],
  ]);
  const changes = mergeChanges(files, remote);
  assert.deepEqual(
    changes.find((f) => f.file_path === '.gitlab-ci.yml'),
    {
      action: 'update',
      file_path: '.gitlab-ci.yml',
      content: expected,
      last_commit_id: 'old-pipeline',
    },
  );
  remote.set('.gitlab-ci.yml', { content: expected });
  assert.ok(
    !mergeChanges(files, remote).some((f) => f.file_path === '.gitlab-ci.yml'),
  );
});

await test('Bundled font uploads preserve family, variable weights, italic style and OFL notices', async () => {
  const { bundledFonts, templateFonts, fontLicenses } =
    await import('../scripts/export-media.mjs');
  assert.equal(templateFonts({ 'site:template': 'regelerate' }).length, 4);
  assert.equal(templateFonts({ 'site:template': 'notebook-purple' }).length, 4);
  assert.deepEqual(
    templateFonts({ 'site:template': 'swiss' }).map((font) => font.family),
    ['Caveat'],
  );
  assert.equal(templateFonts({ 'site:template': 'blank' }).length, 0);
  const root = await mkdtemp(path.join(os.tmpdir(), 'rgel-fonts-'));
  const original = new URL('../public/templates/fonts/', import.meta.url);
  const { fileURLToPath } = await import('node:url');
  await writeFile(
    path.join(root, 'upload-manifest.csv'),
    'source,kind,bundle,file,igem_url\n' +
      bundledFonts
        .map((font) =>
          [
            font.source,
            'font',
            '02-static-assets.zip',
            path.basename(font.source),
            '',
          ].join(','),
        )
        .join('\n'),
  );
  const rows = await manifest(root, { assets: fileURLToPath(original) }, {});
  assert.equal(rows.length, 4);
  assert.equal(rows[1].fontStyle, 'italic');
  assert.equal(rows[0].fontWeight, '100 1000');
  assert.ok(
    rows.every((row) => row.fontLicense.includes('SIL OPEN FONT LICENSE')),
  );
  assert.equal(Object.keys(fontLicenses).length, 3);
});

await test('Resuming older exports adds bundled fonts once and preserves uploaded URLs', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'rgel-resume-fonts-'));
  await mkdir(path.join(root, 'publication'));
  await writeFile(
    path.join(root, 'publication/content.json'),
    JSON.stringify({ format: 'prion-wiki-source', version: 1, values: { 'site:template': 'notebook-purple' } }),
  );
  const rows = [];
  await ensureTemplateFonts(root, rows);
  assert.equal(rows.length, 4);
  rows[0].url = 'https://static.igem.wiki/teams/6377/fonts/dm.ttf';
  await ensureTemplateFonts(root, rows);
  assert.equal(rows.length, 4);
  assert.match(rows[0].url, /dm.ttf$/);
  assert.ok(
    rows.every((row) => row.folder === 'fonts' && row.hash.length === 64),
  );
});

await test('One upload pass creates a virtual folder and submits its first file without a second request', async () => {
  const { sites, counts } = folderFixture();
  const root = await mkdtemp(path.join(os.tmpdir(), 'rgel-new-folder-upload-'));
  const file = path.join(root, 'logo.png');
  await writeFile(file, 'fixture');
  const row = {
    source: '/logo.png',
    kind: 'image',
    file: 'assets/logos/logo.png',
    localFile: file,
    hash: 'b'.repeat(64),
  };
  const page = sites.tabs.assets;
  const originalLocator = page.locator;
  const originalRole = page.getByRole;
  let submissions = 0,
    selections = 0;
  page.on = () => {};
  page.off = () => {};
  page.locator = (selector) =>
    selector === 'input[type="file"]'
      ? {
          waitFor: async () => {},
          count: async () => 1,
          setInputFiles: async () => {
            selections++;
          },
        }
      : selector.startsWith('a[href^=')
        ? { evaluateAll: async () => [] }
        : originalLocator(selector);
  page.getByRole = (role, options) =>
    options?.name === 'Upload'
      ? {
          click: async (options) => {
            if (!options?.trial) submissions++;
          },
        }
      : originalRole(role, options);
  sites.waitForAsset = async () =>
    'https://static.igem.wiki/teams/6377/logos/logo.png';
  await sites.assetFolder('6377', 'logos');
  await sites.assetBatch([row], root, '6377', async () => {});
  assert.equal(counts.created, 1);
  assert.equal(counts.entered, 1);
  assert.equal(selections, 1);
  assert.equal(submissions, 1);
  assert.match(row.url, /logos\/logo.png$/);
});
