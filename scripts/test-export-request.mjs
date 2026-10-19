import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
const dir = await mkdtemp(path.resolve('work/export-request-'));
const file = path.join(dir, 'export-request.mjs');
await writeFile(
  file,
  ts.transpileModule(await readFile('app/export-request.ts', 'utf8'), {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
  }).outputText,
);
const { readExportResponse, prepareExport } = await import(pathToFileURL(file));
for (const [status, match] of [
  [504, /proxy time limit/],
  [524, /not a sign-in error/],
  [502, /backend could not be reached/],
  [401, /session expired/],
  [200, /webpage instead of JSON/],
  [403, /proxy denied/],
])
  await assert.rejects(
    readExportResponse(
      new Response('<html>Proxy</html>', {
        status,
        headers: { 'Content-Type': 'text/html' },
      }),
    ),
    match,
  );
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
await assert.rejects(
  readExportResponse(
    json({ error: 'Bad image', mediaIssues: [{ source: 'x' }] }, 422),
  ),
  (err) => err.status === 422 && err.mediaIssues.length === 1,
);
const statusURL = '/api/export/jobs/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const replies = [
  json({ state: 'queued', statusURL }, 202),
  new Response('timeout', { status: 504 }),
  json({ state: 'preparing', message: 'Splitting notebook.pdf' }),
  json({ state: 'ready', result: { downloads: [{ key: 'source' }] } }),
];
const calls = [],
  progress = [];
const result = await prepareExport({
  fetcher: async (url, options) => {
    calls.push({ url, options });
    return replies.shift();
  },
  body: { team: 'test', requiredPages: [], requestId: 'id' },
  onJob: (url) => assert.equal(url, statusURL),
  onProgress: (m) => progress.push(m),
  active: () => true,
  pollMs: 1,
});
assert.equal(result.downloads.length, 1);
assert.equal(calls.filter((c) => c.options.method === 'POST').length, 1);
assert.equal(calls[0].options.headers.Prefer, 'respond-async');
assert.ok(progress.some((m) => m.includes('Reconnecting')));
assert.ok(progress.includes('Splitting notebook.pdf'));
let polls = 0;
await assert.rejects(
  prepareExport({
    fetcher: async () => {
      assert.ok(++polls < 3);
      return json({
        state: 'failed',
        error: 'Unavailable worker',
        errorStatus: 503,
      });
    },
    body: { team: 'test', requiredPages: [], requestId: 'id' },
    resumeURL: statusURL,
    onJob: () => {},
    onProgress: () => {},
    active: () => true,
    pollMs: 1,
  }),
  (err) => err.terminal && err.status === 503,
);
assert.equal(polls, 1);
console.log(
  'PASS: timeout/auth/proxy diagnostics, asynchronous progress, transient reconnect without duplicate exports, and terminal errors.',
);

let timeoutCalls = 0;
await assert.rejects(
  prepareExport({
    fetcher: async () => {
      timeoutCalls++;
      throw new DOMException(
        'The operation was aborted due to timeout',
        'TimeoutError',
      );
    },
    body: { team: 'test', requiredPages: [], requestId: 'same' },
    resumeURL: statusURL,
    onJob: () => {},
    onProgress: () => {},
    active: () => true,
    pollMs: 1,
  }),
  (e) =>
    e instanceof Error &&
    e.status === 504 &&
    !e.terminal &&
    /same job/.test(e.message),
);
assert.equal(timeoutCalls, 6);
const interrupted = new Response('', {
  headers: { 'Content-Type': 'application/json' },
});
interrupted.json = async () => {
  throw new DOMException('Body timed out', 'TimeoutError');
};
await assert.rejects(
  readExportResponse(interrupted),
  (e) => e.name === 'TimeoutError',
);
console.log(
  'PASS: exhausted progress timeouts preserve the resumable job and provide a clear error; response-body timeouts remain retryable.',
);
