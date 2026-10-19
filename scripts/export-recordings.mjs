// Recordings are a manual Video Universe embed step, never upload-map assets.
export const isRecording = (kind) => ['video', 'audio', 'embed'].includes(kind);
export function isVideoUniverseEmbed(value) {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      url.hostname === 'video.igem.org' &&
      !url.port &&
      !url.username &&
      !url.password &&
      /^\/videos\/embed\/[a-zA-Z0-9-]+$/.test(url.pathname)
    );
  } catch {
    return false;
  }
}
const escape = (value) =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
const decode = (value) =>
  value.replace(
    /&#(x[0-9a-f]+|[0-9]+);|&(amp|quot|apos|lt|gt);/gi,
    (match, number, name) => {
      if (!number)
        return { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>' }[
          name.toLowerCase()
        ];
      const code =
        number[0].toLowerCase() === 'x'
          ? parseInt(number.slice(1), 16)
          : Number(number);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    },
  );
const attrs = (tag) =>
  Object.fromEntries(
    [...tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)].map(
      ([, key, a, b, c]) => [key.toLowerCase(), decode(a ?? b ?? c)],
    ),
  );
export function recordingTodo({ kind, source = '', title = '' }) {
  if (source.startsWith('/')) source = source.split('/').pop();
  // Inline presentation also works inside isolated custom HTML documents.
  return `<div data-recording-todo="${escape(kind)}" role="note" style="box-sizing:border-box;width:100%;min-height:150px;height:100%;display:flex;flex-direction:column;justify-content:center;gap:10px;padding:24px;border:2px dashed #b7791f;border-radius:8px;background:#fff9eb;color:#553a12;font:14px/1.5 system-ui,sans-serif;overflow-wrap:anywhere"><strong style="font-size:18px">TODO: add a Video Universe ${escape(kind === 'audio' ? 'audio' : 'video')} embed</strong><span>Upload this recording to iGEM Video Universe. Copy its HTML iframe embed into an HTML block, or its embed URL into a Video embed block, then export again.</span>${title ? `<span>${escape(title)}</span>` : ''}${source ? `<small>Original: ${escape(source.length > 200 ? source.slice(0, 197) + '…' : source)}</small>` : ''}</div>`;
}
// Tokenize complete tags (including quoted >), skip raw script/style text and comments.
// Do not run a media regex across arbitrary JS or encoded HTML attributes.
export function replaceRecordingFrames(html, todos = [], context = {}) {
  const tokens =
    /<!--[\s\S]*?-->|<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>|<\/?[a-zA-Z][^>"']*(?:(?:"[^"]*"|'[^']*')[^>"']*)*>/gi;
  let result = '',
    cursor = 0,
    skip;
  const removed = new Set();
  for (const match of html.matchAll(tokens)) {
    const tag = match[0],
      start = match.index,
      end = start + tag.length;
    if (skip) {
      if (new RegExp(`^</${skip}\\s*>`, 'i').test(tag)) {
        skip = '';
        cursor = end;
      }
      continue;
    }
    result += html.slice(cursor, start);
    cursor = end;
    if (/^<!--|^<(script|style)\b/i.test(tag)) {
      result += tag;
      continue;
    }
    const kind = /^<(video|audio|iframe)\b/i.exec(tag)?.[1]?.toLowerCase();
    if (!kind) {
      result += tag;
      continue;
    }
    const a = attrs(tag);
    if (kind === 'iframe' && a['data-html-document']) {
      const document = replaceRecordingFrames(
        a['data-html-document'],
        todos,
        context,
      );
      result += tag.replace(
        /(data-html-document\s*=\s*)("[^"]*"|'[^']*')/i,
        (_, prefix) => prefix + '"' + escape(document) + '"',
      );
      continue;
    }
    if (kind === 'iframe' && isVideoUniverseEmbed(a.src)) {
      result += tag;
      continue;
    }
    if (
      kind === 'iframe' &&
      !/(?:video-embed|video\.igem\.org|youtu\.?be|youtube|vimeo|\.(?:mp4|webm|mp3|wav)(?:[?#]|$))/i.test(
        (a.class || '') + ' ' + (a.src || ''),
      )
    ) {
      result += tag;
      continue;
    }
    let source = a.src || '';
    if (!source && kind !== 'iframe') {
      const rest = html.slice(end).split(new RegExp(`</${kind}\\s*>`, 'i'))[0];
      source = attrs(rest.match(/<source\b[^>]*>/i)?.[0] || '').src || '';
    }
    if (source === 'https://video.igem.org/RECORDING-NOT-SET') source = '';
    const todo = {
      ...context,
      kind: kind === 'iframe' ? 'video' : kind,
      source,
      title: a.title || a['aria-label'] || '',
    };
    todos.push(todo);
    if (source) removed.add(source);
    result += recordingTodo(todo);
    if (!/\/\s*>$/.test(tag)) skip = kind;
  }
  if (!skip) result += html.slice(cursor);
  // Native media blocks also render a separate original-file link. It is no
  // longer usable after excluding the recording, so remove only those links.
  return result.replace(
    /<!--[\s\S]*?-->|<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>|<a\b[^>]*>[\s\S]*?<\/a>/gi,
    (link) =>
      /^<a\b/i.test(link) &&
      removed.has(attrs(link.slice(0, link.indexOf('>') + 1)).href)
        ? ''
        : link,
  );
}
export function recordingTasks(refs, locations = new Map(), values = {}) {
  const tasks = [...refs]
    .filter(
      ([source, kind]) =>
        isRecording(kind) &&
        !(kind === 'embed' && isVideoUniverseEmbed(source)),
    )
    .map(([source, kind]) => ({
      source,
      kind,
      locations: locations.get(source) || [],
    }));
  const removed = new Set(JSON.parse(values['pages:removed'] || '[]'));
  for (const [key, value] of Object.entries(values)) {
    if (!key.startsWith('layout:') || removed.has(key.slice(7))) continue;
    const nodes = JSON.parse(value).nodes || [];
    for (const node of nodes) {
      let parent = node;
      const seen = new Set();
      let hidden = false;
      while (parent && !seen.has(parent.id)) {
        if (parent.hidden) hidden = true;
        seen.add(parent.id);
        parent = nodes.find((n) => n.id === parent.parentId);
      }
      if (hidden) continue;
      if (
        isRecording(node.kind) &&
        !(node.kind === 'embed' && isVideoUniverseEmbed(node.src))
      ) {
        const location = {
          page: key.slice(7),
          pageTitle: key.slice(7) === 'home' ? 'Home' : key.slice(7),
          layerId: node.id,
          layerName: node.name || node.title || node.kind,
          field: 'Media source',
        };
        const existing = tasks.find(
          (t) => t.kind === node.kind && t.source === (node.src || ''),
        );
        if (!existing)
          tasks.push({
            kind: node.kind,
            source: node.src || '',
            locations: [location],
          });
        else if (
          !existing.locations.some(
            (l) => l.layerId === node.id && l.page === location.page,
          )
        )
          existing.locations.push(location);
      }
      if (node.kind !== 'html') continue;
      const found = [];
      replaceRecordingFrames(node.html || '', found);
      for (const item of found) {
        const location = {
          page: key.slice(7),
          pageTitle: key.slice(7) === 'home' ? 'Home' : key.slice(7),
          layerId: node.id,
          layerName: node.name || node.title || 'HTML block',
          field: 'HTML',
        };
        const existing = tasks.find(
          (t) => t.source === item.source && t.kind === item.kind,
        );
        if (!existing) tasks.push({ ...item, locations: [location] });
        else if (
          !existing.locations.some(
            (l) => l.layerId === node.id && l.page === location.page,
          )
        )
          existing.locations.push(location);
      }
    }
  }
  return tasks;
}
