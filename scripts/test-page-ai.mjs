import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { generateKeyPair, SignJWT } from 'jose';
import { createAppServer } from '../selfhost-dist/server/app.mjs';
import { validatePageProposal } from '../selfhost-dist/server/ai-page.mjs';
const keys = await generateKeyPair('RS256');
const environment = {
  CF_ACCESS_TEAM_DOMAIN: 'https://example.cloudflareaccess.com',
  CF_ACCESS_AUD: 'test-aud',
  CF_ACCESS_ORIGIN: 'https://editor.example.com',
  CODEX_SOCKET: 'mock',
};
const jwt = await new SignJWT({ email: 'editor@example.test' })
  .setProtectedHeader({ alg: 'RS256' })
  .setIssuer(environment.CF_ACCESS_TEAM_DOMAIN)
  .setSubject('editor')
  .setAudience('test-aud')
  .setIssuedAt()
  .setExpirationTime('1h')
  .sign(keys.privateKey);
let calls = 0,
  releaseChat,
  chatFinished = false;
const chatGate = new Promise((resolve) => {
  releaseChat = resolve;
});
const dataDir = await mkdtemp(path.resolve('work/page-ai-'));
const imageBytes = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9XcAAAAASUVORK5CYII=',
  'base64',
);
const server = await createAppServer({
  environment,
  dataDir,
  clientDir: path.resolve('selfhost-dist/client'),
  keyOverride: keys.publicKey,
  codexRunner: async (route, body, _signal, onProgress) => {
    if (route === '/status')
      return { enabled: true, provider: 'codex', model: 'gpt-6-luna' };
    calls++;
    if (body.prompt === 'image reference') {
      assert.equal(body.images.length, 1);
      assert.equal(body.images[0].data, imageBytes.toString('base64'));
      return { kind: 'chat', reply: 'I can see the reference.' };
    }
    if (body.prompt === 'fontblue')
      return {
        kind: 'proposal',
        reply: 'Made the selected text bigger and blue.',
        css:
          body.target.selector +
          ' { font-size: 20px !important; color: #2563eb !important; }',
        fields: [],
        explanation: 'Updated selected text styles.',
      };
    if (body.prompt === 'hello') {
      onProgress?.({ type: 'progress', phase: 'thinking', state: 'running' });
      await chatGate;
      chatFinished = true;
      return {
        kind: 'chat',
        reply: 'Hello! What would you like to discuss?',
        layout: 'invalid ignored edit',
        fields: [{ id: 'headline', value: 'Never apply' }],
      };
    }
    return {
      layout: JSON.stringify({
        ...body.layout,
        nodes: body.layout.nodes.map((n) => ({ ...n, body: 'Updated text' })),
      }),
      fields: [{ id: 'headline', value: 'Updated headline' }],
      explanation: 'Updated the page text.',
    };
  },
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = 'http://127.0.0.1:' + server.address().port;
const send = (route, body, headers = {}) =>
  fetch(base + route, {
    method: body ? 'POST' : 'GET',
    headers: {
      origin: environment.CF_ACCESS_ORIGIN,
      'X-Prion-Layout-Protocol': '2',
      'cf-access-jwt-assertion': jwt,
      'Content-Type': 'application/json',
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
const node = {
  id: 'text-1',
  kind: 'text',
  title: 'Section',
  body: 'Before',
  src: '',
  caption: '',
  alt: '',
  span: 12,
  align: 'left',
  background: '',
  padding: 0,
  hidden: false,
};
const context = {
  page: 'home',
  layout: {
    order: [node.id],
    nodes: [node],
    gap: 0,
    width: 'full',
    sidebar: true,
  },
  layoutVersion: 0,
  fields: {
    headline: { value: 'Small proteins.\nBig questions.', version: 0 },
  },
  messages: [],
  prompt: 'Improve this page',
  effort: 'medium',
};
try {
  assert.equal((await (await send('/api/ai/status')).json()).provider, 'codex');
  assert.equal(
    (await send('/api/ai/page', context, { origin: 'https://bad.example' }))
      .status,
    403,
  );
  assert.equal(
    (await send('/api/ai/page', { ...context, effort: 'xhigh' })).status,
    400,
  );
  assert.equal(
    (
      await send('/api/ai/page', {
        ...context,
        fields: { 'other:title': { value: 'x', version: 0 } },
      })
    ).status,
    400,
  );
  const result = await send('/api/ai/page', context);
  assert.equal(result.status, 200);
  const proposal = await result.json();
  assert.equal(proposal.layout.nodes[0].body, 'Updated text');
  assert.equal(
    (await (await send('/api/export')).json()).values.headline,
    context.fields.headline.value,
    'Generation never saves',
  );
  const apply = await send('/api/ai/apply', { ...context, proposal });
  assert.equal(apply.status, 200);
  const saved = await (await send('/api/export')).json();
  assert.equal(saved.values.headline, 'Updated headline');
  assert.equal(
    JSON.parse(saved.values['layout:home']).nodes[0].body,
    'Updated text',
  );
  assert.equal(
    (await send('/api/ai/apply', { ...context, proposal })).status,
    409,
    'Stale proposal cannot overwrite',
  );
  const changed = {
    ...context,
    layoutVersion: 1,
    fields: { headline: { value: 'Updated headline', version: 0 } },
  };
  assert.equal(
    (
      await send('/api/ai/apply', {
        ...changed,
        proposal: {
          ...proposal,
          fields: [{ id: 'headline', value: 'Must not save' }],
        },
      })
    ).status,
    409,
  );
  assert.equal(
    (await (await send('/api/export')).json()).values.headline,
    'Updated headline',
    'Conflict rolls back every field',
  );
  const validationContext = {
    ...context,
    pages: ['/'],
    layout: { ...context.layout, nodes: [{ ...node, locked: true }] },
  };
  assert.throws(
    () => validatePageProposal(proposal, validationContext),
    /locked/,
  );
  assert.throws(
    () =>
      validatePageProposal(
        { ...proposal, fields: [{ id: 'intro', value: 'No' }] },
        context,
      ),
    /text field/,
  );
  const scoped = {
    ...context,
    pages: ['/'],
    target: { layerId: node.id, selector: '[data-layer-id="text-1"]' },
  };
  for (const selector of [
    '[data-layer-id="text-1"] + .outside',
    '[data-layer-id="text-1"]:hover ~ .outside',
    '.outside',
  ]) {
    assert.throws(
      () =>
        validatePageProposal(
          {
            ...proposal,
            layout: {
              ...context.layout,
              customCss: selector + ' { color: red; }',
            },
          },
          scoped,
        ),
      /outside the selection/,
    );
  }
  assert.doesNotThrow(() =>
    validatePageProposal(
      {
        ...proposal,
        layout: {
          ...context.layout,
          customCss: '[data-layer-id="text-1"] > p + p { color: red; }',
        },
      },
      scoped,
    ),
  );
  assert.throws(
    () => validatePageProposal({ ...proposal, layout: '{bad' }, context),
    /invalid layout JSON/,
  );
  const nested = {
    ...scoped,
    target: {
      layerId: node.id,
      selector: '[data-layer-id="text-1"] > div:nth-of-type(1)',
    },
  };
  const cssProposal = {
    css:
      nested.target.selector +
      ' { font-size: 20px !important; color: #2563eb !important; }',
    fields: [],
    explanation: 'Bigger blue text',
  };
  const normalized = validatePageProposal(cssProposal, nested);
  assert.deepEqual(normalized.layout.nodes, nested.layout.nodes);
  assert.deepEqual(normalized.layout.order, nested.layout.order);
  assert.equal(normalized.layout.customCss, cssProposal.css);
  const reorderKeys = (value) =>
    Array.isArray(value)
      ? value.map(reorderKeys)
      : value && typeof value === 'object'
        ? Object.fromEntries(
            Object.entries(value)
              .reverse()
              .map(([key, v]) => [key, reorderKeys(v)]),
          )
        : value;
  assert.doesNotThrow(
    () =>
      validatePageProposal(
        { ...normalized, layout: reorderKeys(normalized.layout) },
        nested,
      ),
    'Object property order is not a layout change',
  );
  assert.throws(
    () =>
      validatePageProposal(
        { ...normalized, layout: { ...normalized.layout, gap: 24 } },
        nested,
      ),
    /containing layout/,
  );
  assert.throws(
    () =>
      validatePageProposal(
        {
          ...normalized,
          layout: { ...normalized.layout, nodes: [{ ...node, fontSize: 20 }] },
        },
        nested,
      ),
    /containing layout/,
  );
  assert.throws(
    () =>
      validatePageProposal(
        { ...cssProposal, css: '.other-section { color: blue; }' },
        nested,
      ),
    /outside the selection/,
  );
  assert.throws(
    () =>
      validatePageProposal(
        { ...cssProposal, fields: [{ id: 'intro', value: 'Unselected' }] },
        nested,
      ),
    /text field/,
  );
  const selectedContext = {
    ...context,
    prompt: 'fontblue',
    fields: {},
    layoutVersion: 1,
    layout: JSON.parse(saved.values['layout:home']),
    target: nested.target,
  };
  const styleResponse = await send('/api/ai/page', selectedContext);
  assert.equal(styleResponse.status, 200);
  const styleProposal = await styleResponse.json();
  assert.deepEqual(styleProposal.layout.nodes, selectedContext.layout.nodes);
  assert.equal(
    (
      await send('/api/ai/apply', {
        ...selectedContext,
        proposal: styleProposal,
      })
    ).status,
    200,
  );
  const afterStyle = JSON.parse(
    (await (await send('/api/export')).json()).values['layout:home'],
  );
  assert.equal(afterStyle.customCss, cssProposal.css);
  assert.deepEqual(
    afterStyle.nodes,
    selectedContext.layout.nodes,
    'Nested text styling never changes layer structure',
  );
  const chatResponse = await send(
    '/api/ai/page',
    { ...context, prompt: 'hello' },
    { Accept: 'application/x-ndjson' },
  );
  assert.equal(chatResponse.status, 200);
  assert.ok(
    chatResponse.headers.get('content-type').includes('application/x-ndjson'),
  );
  const chatReader = chatResponse.body.getReader();
  const first = await chatReader.read();
  assert.ok(new TextDecoder().decode(first.value).includes('thinking'));
  assert.equal(
    chatFinished,
    false,
    'Progress arrives before generation completes',
  );
  releaseChat();
  let remaining = '';
  for (;;) {
    const item = await chatReader.read();
    if (item.done) break;
    remaining += new TextDecoder().decode(item.value);
  }
  const chatResult = remaining
    .trim()
    .split('\n')
    .map(JSON.parse)
    .find((e) => e.type === 'result').data;
  assert.deepEqual(chatResult, {
    kind: 'chat',
    reply: 'Hello! What would you like to discuss?',
  });
  assert.equal(
    (await (await send('/api/export')).json()).values.headline,
    'Updated headline',
    'Chat cannot modify the page',
  );
  assert.equal(calls, 3);
  const imageKey = '12345678-1234-1234-1234-123456789012.png';
  await writeFile(path.join(dataDir, 'media', imageKey), imageBytes);
  const imageBody = {
    ...context,
    prompt: 'image reference',
    images: [{ url: '/api/media/' + imageKey, name: 'Screenshot.png' }],
  };
  assert.equal(
    (
      await send('/api/ai/page', imageBody, {
        'X-Prion-Layout-Protocol': '2',
        'cf-access-jwt-assertion': '',
      })
    ).status,
    401,
  );
  const withImage = await send('/api/ai/page', imageBody);
  assert.equal(withImage.status, 200);
  assert.equal((await withImage.json()).reply, 'I can see the reference.');
  const invalidImage = await send('/api/ai/page', {
    ...imageBody,
    images: [{ url: 'https://example.com/private.png' }],
  });
  assert.equal(invalidImage.status, 400);
  assert.equal(calls, 4, 'Invalid or unauthenticated images never reach Codex');

  console.log(
    'PASS: Codex context validation, CSRF, effort cap, proposal-only generation, atomic layout/text save, stale conflict rollback and locked layers.',
  );
} finally {
  await new Promise((resolve) => server.close(resolve));
}
