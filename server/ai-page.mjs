import { request } from 'node:http';
import { isDeepStrictEqual } from 'node:util';
import {
  nodeLocked,
  linkAllowed,
  validateLayout,
  cssError,
  outsideTargetCss,
} from './shared.mjs';
const fail = (status, message) => Object.assign(Error(message), { status });
export function callCodex(socketPath, route, body, signal, onProgress) {
  return new Promise((resolve, reject) => {
    const req = request(
      {
        socketPath,
        path: route,
        method: body ? 'POST' : 'GET',
        headers: {
          'Content-Type': 'application/json',
          Accept: onProgress ? 'application/x-ndjson' : 'application/json',
        },
        signal,
      },
      async (res) => {
        let text = '',
          length = 0,
          result,
          resultSeen = false;
        const streaming = res.headers['content-type']?.includes(
          'application/x-ndjson',
        );
        res.setEncoding('utf8');
        try {
          for await (const chunk of res) {
            length += Buffer.byteLength(chunk);
            if (length > 1000000) throw fail(502, 'Codex response too large');
            text += chunk;
            if (streaming) {
              let newline;
              while ((newline = text.indexOf('\n')) >= 0) {
                const event = JSON.parse(text.slice(0, newline));
                text = text.slice(newline + 1);
                if (event.type === 'progress') onProgress?.(event);
                if (event.type === 'error')
                  throw fail(502, event.error || 'Codex worker failed');
                if (event.type === 'result') {
                  result = event.data;
                  resultSeen = true;
                }
              }
            }
          }
          if (!streaming) {
            result = JSON.parse(text);
            resultSeen = true;
            if (res.statusCode !== 200)
              throw fail(
                res.statusCode,
                result.error || 'Codex worker unavailable',
              );
          }
          if (!resultSeen)
            throw fail(502, 'Codex response ended before completion');
          resolve(result);
        } catch (error) {
          reject(
            error.status
              ? error
              : fail(502, 'Invalid or interrupted Codex response'),
          );
        }
      },
    );
    req.setTimeout(route === '/status' ? 2000 : 95000, () => req.destroy());
    req.on('error', () =>
      reject(
        fail(
          503,
          'Codex worker is unavailable. Ask an administrator to check prion-codex.',
        ),
      ),
    );
    req.end(body ? JSON.stringify(body) : undefined);
  });
}
export function allowedPageField(page, id) {
  if (
    id.startsWith('copy:' + page + ':') ||
    id.startsWith('template:' + page + ':') ||
    /^template:(header|footer):text[0-9]+$/.test(id)
  )
    return true;
  return page === 'home'
    ? /^(headline|intro|feature|featureBody|title[123]|body[123]|home:[a-z0-9-]+)$/.test(
        id,
      )
    : id.startsWith('wiki:' + page + ':') || id.startsWith(page + ':');
}
export function validatePageProposal(proposal, context) {
  const elementTarget =
    context.target &&
    context.target.selector !== `[data-layer-id="${context.target.layerId}"]`;
  let layout;
  try {
    if (elementTarget && typeof proposal?.css === 'string') {
      if (proposal.layout !== undefined)
        throw Error('Mixed element and layout proposal');
      layout = { ...context.layout, customCss: proposal.css };
    } else {
      layout =
        typeof proposal?.layout === 'string'
          ? JSON.parse(proposal.layout)
          : proposal?.layout;
    }
  } catch {
    throw fail(422, 'Codex returned invalid layout JSON.');
  }
  if (
    !validateLayout(layout) ||
    cssError(layout.customCss || '') ||
    JSON.stringify({ ...layout, customCss: '' }).length > 1024 * 1024 ||
    !Array.isArray(proposal.fields) ||
    proposal.fields.length > 100 ||
    typeof proposal.explanation !== 'string' ||
    proposal.explanation.length > 4000
  )
    throw fail(422, 'Codex returned an invalid page proposal.');
  if (
    context.target &&
    outsideTargetCss(layout.customCss || '', context.target.selector) !==
      outsideTargetCss(context.layout.customCss || '', context.target.selector)
  )
    throw fail(422, 'Proposal changed styles outside the selection');
  if (
    elementTarget &&
    !isDeepStrictEqual(
      { ...layout, customCss: '' },
      { ...context.layout, customCss: '' },
    )
  )
    throw fail(
      422,
      'The AI proposal changed the containing layout instead of only the selected element. Your selection is valid; retry this styling request.',
    );
  const ids = new Set();
  for (const field of proposal.fields) {
    if (
      !field ||
      !Object.hasOwn(context.fields, field.id) ||
      ids.has(field.id) ||
      typeof field.value !== 'string' ||
      field.value.length > (field.id.startsWith('wiki:') ? 12000 : 2000)
    )
      throw fail(422, 'Invalid text field in proposal');
    ids.add(field.id);
  }
  for (const old of context.layout.nodes) {
    const next = layout.nodes.find((n) => n.id === old.id);
    if (
      (nodeLocked(context.layout, old.id) ||
        (context.target && context.target.layerId !== old.id)) &&
      !isDeepStrictEqual(old, next)
    )
      throw fail(422, 'Proposal changed a locked or unselected layer');
    if (old.kind === 'template' && (!next || next.kind !== 'template'))
      throw fail(422, 'Template sections must be preserved; hide them instead');
    if (
      old.layoutMode !== 'free' &&
      next?.layoutMode === 'free' &&
      layout.nodes.some(
        (child) =>
          child.parentId === old.id &&
          (child.x === undefined ||
            child.y === undefined ||
            child.freeWidth === undefined),
      )
    )
      throw fail(
        422,
        'The proposal would switch a section to free positioning without placing its children. Keep the existing flow layout when inserting content. Nothing has been applied.',
      );
  }
  if (
    context.target &&
    (JSON.stringify(layout.order) !== JSON.stringify(context.layout.order) ||
      layout.nodes.length !== context.layout.nodes.length ||
      ['gap', 'width', 'sidebar'].some((k) => layout[k] !== context.layout[k]))
  )
    throw fail(422, 'Select the entire page to change its structure');
  const sources = new Set(context.layout.nodes.map((n) => n.src));
  sources.add('');
  for (const n of layout.nodes) {
    if (
      n.kind === 'template' &&
      !context.layout.nodes.some(
        (old) => old.id === n.id && old.kind === 'template',
      )
    )
      throw fail(422, 'New layers must use a supported content type');
    if (
      !sources.has(n.src) ||
      (n.linkTo && !linkAllowed(n.linkTo, context.pages)) ||
      Object.values(n.links || {}).some(
        (href) => !linkAllowed(href, context.pages),
      )
    )
      throw fail(422, 'Use an existing media asset and page destination');
  }
  return { layout, fields: proposal.fields, explanation: proposal.explanation };
}
export function createPageAssistant({ environment, db, runner, loadImages }) {
  const invoke =
    runner ||
    ((route, body, signal, onProgress) =>
      callCodex(environment.CODEX_SOCKET, route, body, signal, onProgress));
  let running = false;
  return {
    status: () =>
      invoke('/status').catch(() => ({
        enabled: false,
        provider: 'codex',
        model: 'gpt-6-luna',
      })),
    async propose(body, user, signal, onProgress) {
      if (running) throw fail(429, 'One Codex job is running. Retry shortly.');
      const now = Date.now(),
        day = Math.floor(now / 86400000) * 86400000;
      const limit = Math.max(
        1,
        Math.min(1000, Number(environment.AI_DAILY_REQUEST_LIMIT) || 100),
      );
      if (
        db
          .prepare('SELECT COUNT(*) AS n FROM ai_requests WHERE created>=?')
          .get(day).n >= limit ||
        db
          .prepare(
            'SELECT COUNT(*) AS n FROM ai_requests WHERE user=? AND created>=?',
          )
          .get(user, now - 60000).n >= 5
      )
        throw fail(429, 'AI request quota reached. Please try later.');
      db.prepare('INSERT INTO ai_requests(user,created) VALUES(?,?)').run(
        user,
        now,
      );
      running = true;
      try {
        const images = loadImages ? await loadImages(body.images) : [];
        const answer = await invoke(
          '/propose',
          { ...body, images },
          signal,
          onProgress,
        );
        if (answer.kind === 'chat') {
          if (
            typeof answer.reply !== 'string' ||
            !answer.reply.trim() ||
            answer.reply.length > 12000
          )
            throw fail(422, 'Codex returned an invalid chat reply');
          // Discard any accidental edit fields in a conversational answer.
          return { kind: 'chat', reply: answer.reply };
        }
        if (answer.kind && answer.kind !== 'proposal')
          throw fail(422, 'Invalid assistant response kind');
        onProgress?.({
          type: 'progress',
          phase: 'validating',
          state: 'running',
        });
        if (
          answer.reply !== undefined &&
          (typeof answer.reply !== 'string' || answer.reply.length > 12000)
        )
          throw fail(422, 'Invalid assistant reply');
        const proposal = validatePageProposal(answer, body);
        return {
          ...proposal,
          kind: 'proposal',
          reply: answer.reply || proposal.explanation,
        };
      } finally {
        running = false;
      }
    },
  };
}
