import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createCssAssistant } from '../selfhost-dist/server/ai-css.mjs';
import { createPageAssistant } from '../selfhost-dist/server/ai-page.mjs';

const db = new DatabaseSync(':memory:');
let sent;
const assistant = createCssAssistant({
  db,
  environment: { OPENAI_API_KEY: 'test-only' },
  fetchImpl: async (_url, request) => {
    sent = JSON.parse(request.body);
    return Response.json({
      status: 'completed',
      output: [
        {
          type: 'message',
          content: [
            {
              type: 'output_text',
              text: JSON.stringify({
                css: 'h1 { color: blue; }',
                explanation: 'Updated heading.',
              }),
            },
          ],
        },
      ],
    });
  },
});
try {
  assert.equal(assistant.status().model, 'gpt-6-luna');
  assert.equal(assistant.status().defaultEffort, 'medium');
  assert.equal(assistant.status().maxEffort, 'high');
  await assistant.propose(
    { prompt: 'Blue heading', page: 'home' },
    'test-user',
  );
  assert.equal(sent.model, 'gpt-6-luna');
  assert.equal(sent.reasoning.effort, 'medium');
  await assert.rejects(
    assistant.propose(
      { prompt: 'Blue heading', page: 'home', effort: 'xhigh' },
      'test-user',
    ),
    { status: 400 },
  );
  const page = createPageAssistant({
    environment: {},
    db,
    runner: async () => {
      throw Error('Worker offline');
    },
  });
  assert.equal((await page.status()).model, 'gpt-6-luna');
  console.log(
    'PASS: server model, outgoing Responses request, Medium default, High cap, and offline worker status. No live API call.',
  );
} finally {
  db.close();
}
