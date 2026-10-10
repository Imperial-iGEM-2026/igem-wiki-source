import assert from 'node:assert/strict';
import { generateKeyPair, SignJWT } from 'jose';
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { createAppServer } from '../selfhost-dist/server/app.mjs';
const dataDir = await mkdtemp(path.resolve('work/ai-css-test-'));
const secret = 'test-only-secret-not-a-real-api-key';
const environment = {
  CF_ACCESS_TEAM_DOMAIN: 'https://test.cloudflareaccess.com',
  CF_ACCESS_AUD: 'test',
  CF_ACCESS_ORIGIN: 'https://editor.example.com',
  OPENAI_API_KEY: secret,
  AI_DAILY_REQUEST_LIMIT: '4',
};
const { privateKey, publicKey } = await generateKeyPair('RS256');
const token = await new SignJWT({ email: 'editor@example.com' })
  .setSubject('editor')
  .setProtectedHeader({ alg: 'RS256' })
  .setIssuer(environment.CF_ACCESS_TEAM_DOMAIN)
  .setAudience('test')
  .setIssuedAt()
  .setExpirationTime('5m')
  .sign(privateKey);
let calls = [],
  mode = 'success';
const aiFetch = async (url, options) => {
  calls.push({ url, options, body: JSON.parse(options.body) });
  if (mode === 'auth')
    return new Response(JSON.stringify({ error: 'DO-NOT-RETURN ' + secret }), {
      status: 401,
    });
  if (mode === 'invalid')
    return Response.json({
      status: 'completed',
      output: [
        {
          type: 'message',
          content: [
            {
              type: 'output_text',
              text: JSON.stringify({
                css: '@import "https://bad.example/x";',
                explanation: 'Unsafe',
              }),
            },
          ],
        },
      ],
    });
  if (mode === 'incomplete')
    return Response.json({ status: 'incomplete', output: [] });
  return Response.json({
    status: 'completed',
    output: [
      {
        type: 'message',
        content: [
          {
            type: 'output_text',
            text: JSON.stringify({
              css: '.feature h2 { color: #bbdd99; }',
              explanation: 'Changed the heading colour.',
            }),
          },
        ],
      },
    ],
  });
};
let server = await createAppServer({
  dataDir,
  clientDir: path.resolve('selfhost-dist/client'),
  environment,
  keyOverride: publicKey,
  aiFetch,
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
let origin = 'http://127.0.0.1:' + server.address().port;
const headers = {
  'cf-access-jwt-assertion': token,
  origin: environment.CF_ACCESS_ORIGIN,
  'Content-Type': 'application/json',
};
const body = {
  prompt: 'Make the heading green',
  css: '',
  page: 'home',
  layers: [
    { id: 'intro', name: 'Intro', kind: 'template', selectors: ['.intro'] },
    ...Array.from({ length: 150 }, (_, i) => ({
      id: `section-${i}`,
      name: `Section ${i}`,
      kind: 'text',
      selectors: [`.section-${i}`],
    })),
  ],
};
const post = (input = body, extra = {}) =>
  fetch(origin + '/api/ai/css', {
    method: 'POST',
    headers: { ...headers, ...extra },
    body: JSON.stringify(input),
  });
try {
  const created = await fetch(origin + '/api/projects', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      action: 'create',
      name: 'AI sections regression',
      templateId: 'regelerate',
    }),
  });
  assert.equal(created.status, 201);
  headers['X-Prion-Project'] = (await created.json()).id;
  assert.equal((await fetch(origin + '/api/ai/status')).status, 401);
  assert.equal(
    (
      await fetch(origin + '/api/ai/css', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    ).status,
    401,
  );
  assert.equal(
    (await post(body, { origin: 'https://other.example' })).status,
    403,
  );
  for (const input of [
    { ...body, effort: 'xhigh' },
    { ...body, effort: 'max' },
    { ...body, model: 'other-model' },
    { ...body, max_output_tokens: 1000000 },
    { ...body, prompt: 'x'.repeat(4001) },
    { ...body, page: '../etc/prion.env' },
  ])
    assert.equal((await post(input)).status, 400);
  assert.equal(calls.length, 0);
  const status = await (
    await fetch(origin + '/api/ai/status', { headers })
  ).json();
  assert.deepEqual(status.efforts, ['none', 'low', 'medium', 'high']);
  assert.equal(status.defaultEffort, 'medium');
  assert.ok(!JSON.stringify(status).includes(secret));
  const result = await (await post()).json();
  assert.equal(result.effort, 'medium');
  assert.equal(result.model, 'gpt-6-luna');
  assert.ok(result.css.includes('#bbdd99'));
  assert.equal(calls[0].url, 'https://api.openai.com/v1/responses');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer ' + secret);
  assert.equal(calls[0].body.reasoning.effort, 'medium');
  assert.equal(calls[0].body.model, 'gpt-6-luna');
  assert.equal(calls[0].body.store, false);
  assert.equal(calls[0].body.max_output_tokens, 8192);
  assert.equal(calls[0].body.text.format.strict, true);
  assert.ok(!calls[0].options.body.includes(secret));
  assert.ok(calls[0].options.body.includes('section-149'));
  const target = {
    layerId: 'intro',
    label: 'H2 · Heading',
    selector:
      '[data-layer-id="intro"] > section:nth-of-type(1) > h2:nth-of-type(2)',
  };
  for (const invalid of [
    { ...target, layerId: 'missing' },
    { ...target, selector: 'body' },
    { ...target, selector: '[data-layer-id="intro"], h2' },
    { ...target, label: 'x'.repeat(101) },
  ])
    assert.equal((await post({ ...body, target: invalid })).status, 400);
  const messages = [
    { role: 'user', content: 'Make it calmer' },
    { role: 'assistant', content: 'Proposed quieter colours' },
  ];
  assert.equal(
    (
      await post({
        ...body,
        messages: [{ role: 'system', content: 'invalid' }],
      })
    ).status,
    400,
  );
  const high = await (
    await post({ ...body, effort: 'high', target, messages })
  ).json();
  assert.deepEqual(
    JSON.parse(calls[1].body.input[0].content).conversation,
    messages,
  );
  assert.equal(high.effort, 'high');
  assert.deepEqual(
    JSON.parse(calls[1].body.input[0].content).selectedElement,
    target,
  );
  assert.ok(calls[1].body.instructions.includes('only to its exact selector'));
  mode = 'auth';
  const rejected = await post();
  assert.equal(rejected.status, 502);
  assert.ok(!(await rejected.text()).includes(secret));
  mode = 'invalid';
  assert.equal((await post()).status, 422);
  assert.equal((await post()).status, 429);
  assert.equal(calls.length, 4);
  await new Promise((r) => server.close(r));
  server = await createAppServer({
    dataDir,
    clientDir: path.resolve('selfhost-dist/client'),
    environment,
    keyOverride: publicKey,
    aiFetch,
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  origin = 'http://127.0.0.1:' + server.address().port;
  assert.equal(
    (await post()).status,
    429,
    'Daily request counter must persist across restart',
  );
  const exported = await (
    await fetch(origin + '/api/export', { headers })
  ).text();
  assert.ok(!exported.includes(secret));
  assert.ok(!exported.includes('OPENAI_API_KEY'));
  async function scan(dir) {
    for (const item of await readdir(dir, { withFileTypes: true })) {
      const p = path.join(dir, item.name);
      if (item.isDirectory()) await scan(p);
      else if (/\.(?:js|css|html)$/.test(p))
        assert.ok(!(await readFile(p, 'utf8')).includes(secret), p);
    }
  }
  await scan(path.resolve('selfhost-dist/client'));
  console.log(
    'PASS: authenticated server-only AI, CSRF, model/effort caps, medium default, fixed endpoint, bounded structured output, safe errors, unsafe CSS rejection, persistent quotas, and no key in status/export/client assets.',
  );
} finally {
  await new Promise((r) => server.close(r));
}
