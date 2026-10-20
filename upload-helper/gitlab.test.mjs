import test from 'node:test';
import assert from 'node:assert/strict';
import { checkGitResponse, publishGitLab, publicationComplete, publicationTarget, publicationDigest } from './gitlab.mjs';
import { OfficialSites } from './sites.mjs';

const plan = (n = 5) => ({
  base: '/api/v4/projects/2026%2Ftest', sha: 'base',
  actions: Array.from({ length: n }, (_, i) => ({
    action: 'create', file_path: `page-${i}.json`,
    content: JSON.stringify({ text: 'α'.repeat(75000) }),
  })),
});
function fixture() {
  const f = {
    head: null, saved: undefined, posts: [], files: new Map(), requests: [],
    fail: null, counter: 0, messages: [],
  };
  f.persist = async (state) => { f.saved = structuredClone(state); };
  f.git = async (method, url, body) => {
    if (method === 'GET') {
      if (url.includes('/branches/'))
        return f.head ? { status: 200, data: { commit: f.head } }
          : { status: 404, data: { message: 'not found' } };
      if (url.includes('/files/')) {
        const name = decodeURIComponent(url.split('/files/')[1].split('?')[0]);
        assert.equal(url.split('?ref=')[1], f.head.id);
        return { status: 200, data: { content: Buffer.from(f.files.get(name)).toString('base64') } };
      }
      if (url.includes('/merge_requests?'))
        return { status: 200, data: f.requests };
    }
    f.posts.push(structuredClone(body));
    if (f.fail) await f.fail('before', url, body);
    let data;
    if (url.endsWith('/commits')) {
      assert.ok(!f.head ? body.start_sha === 'base' : !body.start_sha);
      for (const action of body.actions) {
        assert.ok(!f.files.has(action.file_path), 'never repeat a confirmed file');
        f.files.set(action.file_path, action.content);
      }
      f.head = { id: `commit-${++f.counter}`, parent_ids: [f.head?.id || 'base'], message: body.commit_message };
      data = f.head;
    } else {
      assert.ok(url.endsWith('/merge_requests'));
      data = { source_branch: body.source_branch, target_branch: body.target_branch,
        web_url: 'https://gitlab.igem.org/2026/test/-/merge_requests/1', state: 'opened' };
      f.requests.push(data);
    }
    if (f.fail) await f.fail('after', url, body);
    return { status: 201, data };
  };
  f.send = (p) => publishGitLab(f.git, p, 'wiki-upload-test', f.saved, f.persist, (m) => f.messages.push(m));
  return f;
}

test('HTTP failures retain status and request ID, without printing response HTML', async () => {
  for (const [status, pattern] of [[413, /too large/], [429, /rate limiting/], [502, /temporarily unavailable/], [403, /denied/]]) {
    const sites = new OfficialSites();
    sites.tabs.gitlab = { isClosed: () => false, url: () => 'https://gitlab.igem.org/2026/test',
      evaluate: async () => ({ status, data: null, contentType: 'text/html', requestId: 'trace-123' }) };
    await assert.rejects(sites.git('POST', '/api/v4/projects/1/repository/commits', {}), (e) => {
      assert.equal(e.status, status);
      assert.match(e.message, pattern);
      assert.match(e.message, new RegExp(`HTTP ${status}`));
      assert.match(e.message, /trace-123/);
      return true;
    });
  }
  assert.throws(() => checkGitResponse({ status: 200, data: null, contentType: 'text/html' }, 'GET', '/api/v4/projects/1'), /HTML page.*security check/);
  assert.equal(checkGitResponse({ status: 404, data: {} }, 'GET', '/api/v4/test').status, 404);
});

test('batches measured in UTF-8 bytes and creates one review request', async () => {
  const f = fixture(), p = plan(9);
  const result = await f.send(p);
  const commits = f.posts.filter((b) => b.actions);
  assert.ok(commits.length > 1);
  assert.ok(commits.every((b) => Buffer.byteLength(JSON.stringify(b)) <= 512 * 1024));
  assert.equal(f.files.size, 9);
  assert.equal(f.requests.length, 1);
  assert.equal(f.saved.next, 9);
  assert.equal(result.complete, true);
  await f.send(p);
  assert.equal(f.requests.length, 1);
  assert.equal(f.posts.filter((b) => b.actions).length, commits.length);
});

test('explicit 413 reduces batch; individual rejected file is named', async () => {
  const f = fixture();
  f.fail = async (phase, url, body) => {
    if (phase === 'before' && url.endsWith('/commits') && body.actions.length > 1)
      throw Object.assign(Error('too large'), { status: 413 });
  };
  await f.send(plan());
  assert.equal(f.files.size, 5);
  assert.ok(f.messages.some((m) => m.includes('smaller')));
  const g = fixture();
  g.fail = async () => { throw Object.assign(Error('too large'), { status: 413 }); };
  await assert.rejects(g.send(plan(1)), /individual source file is page-0.json/);
  assert.equal(g.files.size, 0);
});

test('failure before commit can retry; lost commit response recovers exact bytes after restart', async () => {
  for (const stage of ['before', 'after']) {
    const f = fixture(), p = plan();
    f.fail = async (phase, url) => {
      if (phase === stage && url.endsWith('/commits')) throw Error('connection lost');
    };
    await assert.rejects(f.send(p), /connection lost/);
    // Recreate the saved object as if it had been read from state.json.
    f.saved = JSON.parse(JSON.stringify(f.saved));
    f.fail = null;
    await f.send(p);
    assert.equal(f.files.size, 5);
    assert.equal(f.counter, 2);
    assert.equal(f.requests.length, 1);
  }
});

test('lost response on a later batch resumes without replaying earlier files', async () => {
  const f = fixture(), p = plan(8);
  f.fail = async (phase, url) => {
    if (phase === 'after' && url.endsWith('/commits') && f.counter === 2) throw Error('lost second response');
  };
  await assert.rejects(f.send(p), /lost second/);
  assert.equal(f.saved.next, 3);
  f.fail = null;
  await f.send(p);
  assert.equal(f.counter, 3);
  assert.equal(f.files.size, 8);
});

test('merge request failure resumes without duplicating commits or requests', async () => {
  for (const stage of ['before', 'after']) {
    const f = fixture(), p = plan();
    f.fail = async (phase, url) => {
      if (phase === stage && url.endsWith('/merge_requests')) throw Error('request failed');
    };
    await assert.rejects(f.send(p), /request failed/);
    const commits = f.counter;
    f.fail = null;
    await f.send(p);
    assert.equal(f.counter, commits);
    assert.equal(f.requests.length, 1);
    assert.equal(f.saved.complete, true);
  }
});

test('refuses changed plan, unrelated branch edits and corrupted recovered contents', async () => {
  for (const change of ['plan', 'branch', 'content']) {
    const f = fixture(), p = plan();
    f.fail = async (phase) => { if (phase === 'after') throw Error('lost'); };
    await assert.rejects(f.send(p), /lost/);
    f.fail = null;
    if (change === 'plan') p.actions[0].content = 'different';
    if (change === 'branch') f.head.message = 'Another developer changed this branch';
    if (change === 'content') f.files.set('page-0.json', 'different');
    const writes = f.posts.length;
    await assert.rejects(f.send(p), /changed|does not match/);
    assert.equal(f.posts.length, writes);
  }
});

test('legacy failed attempt retries only when its branch does not exist', async () => {
  const f = fixture(), p = plan(1);
  f.saved = { attempted: true, branch: 'wiki-upload-test' };
  await f.send(p);
  assert.equal(f.saved.complete, true);
  const g = fixture();
  g.head = { id: 'old' };
  g.saved = { attempted: true, branch: 'wiki-upload-test' };
  await assert.rejects(g.send(p), /earlier upload already exists/);
  assert.equal(g.posts.length, 0);
  assert.ok(publicationComplete({ url: 'https://gitlab.igem.org/2026/test/-/merge_requests/34' }));
});

test('re-reviewed upgraded source uses a fresh branch and then resumes that branch', () => {
  const p = plan(1);
  const old = { attempted: true, branch: 'wiki-upload-test', digest: 'old-source', head: 'partial' };
  const target = publicationTarget(p, 'wiki-upload-test', old);
  assert.ok(target.branch.startsWith('wiki-upload-test-'));
  assert.equal(target.publication, undefined);
  assert.equal(target.replacedBranch, old.branch);
  const saved = { digest: publicationDigest(p), branch: target.branch, next: 1 };
  assert.deepEqual(publicationTarget(p, 'wiki-upload-test', saved), { branch: target.branch, publication: saved });
});
