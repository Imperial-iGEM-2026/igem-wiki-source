import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import {
  createCodexWorker,
  classifyCodexFailure,
  codexResponseSchema,
} from '../server/codex-worker.mjs';
const root = await mkdtemp(path.resolve('work/worker-test-'));
const fixture = path.join(root, 'fake-codex.mjs');
await writeFile(
  fixture,
  `
import fs from 'node:fs';
if (!fs.existsSync(process.env.CODEX_HOME)) {
  console.error('CODEX_HOME directory does not exist'); process.exit(2);
}
const args = process.argv.slice(2);
if (!args.includes('--output-schema') || !args.includes('read-only') || !args.includes('features.shell_tool=false')) process.exit(3);
const responseSchema = JSON.parse(fs.readFileSync(args[args.indexOf('--output-schema') + 1], 'utf8'));
if (responseSchema.properties.css) {
  if (responseSchema.properties.layout || !responseSchema.required.includes('css')) process.exit(8);
}
let input = ''; for await (const chunk of process.stdin) input += chunk;
if (!input.includes('Latest design request')) process.exit(4);
if (!input.includes('Do not hotlink third-party images') || !input.includes('upload the original to Studio')) process.exit(11);
if (input.includes('user-A-only') && input.includes('user-B-only')) process.exit(10);
if (process.env.PRION_TEST_MODE === 'image') {
  const image = args[args.indexOf('--image') + 1];
  if (!image || !fs.existsSync(image) || fs.readFileSync(image)[0] !== 137 || input.includes('iVBORw0KGgo')) process.exit(9);
}

if (process.env.PRION_TEST_MODE === 'fail') {
  console.error('CODEX_HOME directory does not exist ' + process.env.CODEX_API_KEY + ' PRIVATE_PROMPT'); process.exit(2);
}
if (process.env.PRION_TEST_MODE === 'hang') await new Promise(() => { setInterval(() => {}, 1000); });
console.log(JSON.stringify({ type: 'turn.started' }));
console.log(JSON.stringify({ type: 'item.started', item: { type: 'reasoning', text: 'PRIVATE_REASONING' } }));
fs.writeFileSync(args[args.indexOf('--output-last-message') + 1], JSON.stringify(responseSchema.properties.css ? { kind: 'proposal', reply: 'Styled selection', css: 'h1 { color: blue; }', fields: [], explanation: 'Selected styling' } : { kind: 'chat', reply: input.includes('user-A-only') ? 'A' : input.includes('user-B-only') ? 'B' : 'Hello!', layout: '', fields: [], explanation: 'Preview ready — 页面' }));
`,
);
let mode = 'success',
  calls = 0;
const secret = 'test-worker-credential-never-publish',
  logs = [];
const workspaces = new Set();
const server = await createCodexWorker({
  executable: process.execPath,
  jobsRoot: path.join(root, 'jobs'),
  apiKey: secret,
  log: (entry) => logs.push(entry),
  spawnImpl: (_file, args, options) => {
    calls++;
    assert.equal(args[args.indexOf('-m') + 1], 'gpt-6-luna');
    assert.ok(args.includes('model_reasoning_effort="medium"'));
    assert.equal(options.env.CODEX_API_KEY, secret);
    assert.equal(options.env.OPENAI_API_KEY, undefined);
    assert.equal(options.env.CF_ACCESS_AUD, undefined);
    assert.ok(
      !workspaces.has(options.cwd),
      'Each request needs a fresh workspace',
    );
    workspaces.add(options.cwd);
    assert.equal(options.env.HOME, options.cwd);
    assert.equal(
      path.normalize(options.env.CODEX_HOME),
      path.join(options.cwd, 'home'),
    );
    assert.ok(
      args.includes('--ephemeral') && args.includes('--ignore-user-config'),
    );
    assert.ok(!args.includes('resume'));
    return spawn(process.execPath, [fixture, ...args], {
      ...options,
      env: { ...options.env, PRION_TEST_MODE: mode },
    });
  },
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = 'http://127.0.0.1:' + server.address().port;
const status = async () => (await fetch(base + '/status')).json();
const post = (stream = false, target = null, images = [], marker = '') =>
  fetch(base + '/propose', {
    method: 'POST',
    headers: { Accept: stream ? 'application/x-ndjson' : 'application/json' },
    body: JSON.stringify({
      images,
      effort: 'medium',
      prompt: 'Latest design request ' + marker,
      ...(target ? { target } : {}),
    }),
  });
async function settle() {
  for (let i = 0; i < 100; i++) {
    if (!(await status()).running) return;
    await delay(10);
  }
  throw Error('Worker did not release its job');
}
try {
  assert.equal((await status()).enabled, true);
  assert.equal((await status()).model, 'gpt-6-luna');
  let result = await post();
  assert.equal(result.status, 200);
  assert.equal((await result.json()).explanation, 'Preview ready — 页面');
  await settle();
  assert.deepEqual(await readdir(path.join(root, 'jobs')), []);
  mode = 'image';
  const imageBytes = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    Buffer.alloc(20),
  ]);
  assert.equal(
    (
      await post(false, null, [
        { name: 'screenshot.png', data: imageBytes.toString('base64') },
      ])
    ).status,
    200,
  );
  await settle();
  assert.deepEqual(await readdir(path.join(root, 'jobs')), []);
  const callsBeforeInvalid = calls;
  assert.equal(
    (await post(false, null, [{ path: '/etc/prion.env' }])).status,
    502,
  );
  await settle();
  assert.equal(calls, callsBeforeInvalid);
  mode = 'fail';
  result = await post();
  assert.equal(result.status, 502);
  assert.equal((await result.json()).code, 'home');
  await settle();
  const failed = await status();
  assert.equal(failed.lastFailure.code, 'home');
  assert.equal(failed.lastFailure.exitCode, 2);
  assert.ok(!JSON.stringify({ failed, logs }).includes(secret));
  assert.ok(!JSON.stringify({ failed, logs }).includes('PRIVATE_PROMPT'));
  mode = 'success';
  assert.equal((await post()).status, 200);
  await settle();
  assert.equal((await status()).lastFailure, null);
  const streamed = await post(true);
  const streamText = await streamed.text();
  const events = streamText
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  assert.ok(events.some((event) => event.phase === 'thinking'));
  assert.equal(events.at(-1).data.kind, 'chat');
  assert.ok(!streamText.includes('PRIVATE_REASONING'));
  await settle();
  const nestedTarget = {
    layerId: 'cycle',
    selector: '[data-layer-id="cycle"] > div:nth-of-type(1)',
  };
  const elementSchema = codexResponseSchema(nestedTarget);
  assert.ok(elementSchema.properties.css && !elementSchema.properties.layout);
  assert.ok(
    codexResponseSchema({
      layerId: 'cycle',
      selector: '[data-layer-id="cycle"]',
    }).properties.layout,
  );
  const elementResponse = await post(false, nestedTarget);
  assert.equal(elementResponse.status, 200);
  assert.equal((await elementResponse.json()).kind, 'proposal');
  await settle();
  for (const [marker, reply] of [
    ['user-A-only', 'A'],
    ['user-B-only', 'B'],
  ]) {
    const isolated = await post(false, null, [], marker);
    assert.equal(isolated.status, 200);
    assert.equal((await isolated.json()).reply, reply);
    await settle();
    assert.deepEqual(await readdir(path.join(root, 'jobs')), []);
  }
  mode = 'hang';
  const abort = new AbortController();
  const hanging = await fetch(base + '/propose', {
    method: 'POST',
    signal: abort.signal,
    headers: { Accept: 'application/x-ndjson' },
    body: JSON.stringify({ effort: 'medium', prompt: 'Latest design request' }),
  });
  const hangingReader = hanging.body.getReader();
  await hangingReader.read();
  assert.equal(
    (await post()).status,
    429,
    'A second job must not join or cancel the first',
  );
  assert.equal((await status()).running, true);
  abort.abort();
  await settle();
  assert.equal((await status()).lastFailure.code, 'cancelled');
  assert.equal(calls, 9);
  assert.equal(
    classifyCodexFailure('cli', "unexpected argument '--flag'").code,
    'arguments',
  );
  assert.equal(classifyCodexFailure('cli', 'model_not_found').code, 'model');
  assert.equal(
    classifyCodexFailure('cli', '401 Unauthorized').code,
    'authentication',
  );
  console.log(
    'PASS: worker HTTP -> real child process -> schema/stdin/env -> JSON, pre-existing CODEX_HOME, cleanup, failure categorisation, no secret/prompt leakage, recovery. No live OpenAI request.',
  );
} finally {
  await new Promise((resolve) => server.close(resolve));
}
