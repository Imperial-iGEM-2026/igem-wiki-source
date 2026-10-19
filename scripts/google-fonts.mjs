// Prepared on the server; publication builds only consume this frozen manifest.
const decode = (text) =>
  String(text).replace(
    /&(amp|quot|apos|lt|gt|#\d+|#x[\da-f]+);/gi,
    (all, code) => {
      const named = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>' };
      if (named[code.toLowerCase()]) return named[code.toLowerCase()];
      const n =
        code[1]?.toLowerCase() === 'x'
          ? parseInt(code.slice(2), 16)
          : Number(code.slice(1));
      return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : all;
    },
  );
const escape = (text) =>
  text.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ],
  );
const canonical = (url) =>
  new URL(
    decode(url)
      .replace(/^http:/, 'https:')
      .replace(/^\/\//, 'https://'),
  ).href;
const urlPattern =
  /(?:https?:)?\/\/fonts\.(?:googleapis|gstatic)\.com(?:\/[^\s"'<>\\)]*)?/gi;

export function googleFontReferences(values, template, sourceStyles = {}) {
  const refs = new Map();
  const scan = (value, location) => {
    if (typeof value === 'string') {
      for (const [raw] of decode(value).matchAll(urlPattern)) {
        const url = canonical(raw);
        const parsed = new URL(url);
        if (parsed.pathname === '/') continue; // preconnect, not a font request
        const locations = refs.get(url) || [];
        if (
          !locations.some((x) => JSON.stringify(x) === JSON.stringify(location))
        )
          locations.push(location);
        refs.set(url, locations);
      }
    } else if (value && typeof value === 'object') {
      for (const child of Object.values(value)) scan(child, location);
    }
  };
  const removed = new Set(JSON.parse(values['pages:removed'] || '[]'));
  const pages = [
    ...(template?.pages || []),
    ...JSON.parse(values['pages:custom'] || '[]'),
  ];
  const title = (page) =>
    pages.find((p) => p.slug === page)?.title ||
    (page === 'home' ? 'Home' : page);
  const visible = (node, nodes) => {
    const seen = new Set();
    while (node && !seen.has(node.id)) {
      if (node.hidden) return false;
      seen.add(node.id);
      node = nodes.find((n) => n.id === node.parentId);
    }
    return true;
  };
  for (const [key, raw] of Object.entries(values)) {
    if (key.startsWith('ai:')) continue;
    if (key.startsWith('layout:')) {
      const page = key.slice(7);
      if (removed.has(page)) continue;
      const { nodes = [], ...settings } = JSON.parse(raw);
      scan(settings, {
        page,
        pageTitle: title(page),
        layerName: 'Page styles',
        field: 'CSS',
      });
      for (const node of nodes)
        if (visible(node, nodes))
          scan(node, {
            page,
            pageTitle: title(page),
            layerId: node.id,
            layerName: node.name || node.title || node.kind,
            field: 'HTML / CSS',
          });
    } else {
      let value = raw;
      try {
        value = JSON.parse(raw);
      } catch {}
      scan(value, { pageTitle: 'Site settings', layerName: key, field: key });
    }
  }
  if (template) {
    const { pages: templatePages = [], ...styles } = template;
    scan(styles, {
      pageTitle: 'Template styles',
      layerName: template.name || template.id,
      field: 'CSS',
    });
    for (const page of templatePages) {
      if (removed.has(page.slug)) continue;
      const nodes =
        JSON.parse(values['layout:' + page.slug] || '{"nodes":[]}').nodes || [];
      const { layers = [], ...settings } = page;
      scan(settings, {
        page: page.slug,
        pageTitle: title(page.slug),
        layerName: 'Template page',
        field: 'CSS',
      });
      for (const layer of layers)
        if (
          visible(
            nodes.find((n) => n.id === layer.id) || layer.defaults || layer,
            nodes,
          )
        )
          scan(layer, {
            page: page.slug,
            pageTitle: title(page.slug),
            layerId: layer.id,
            layerName: layer.name || layer.id,
            field: 'Template HTML / CSS',
          });
    }
  }
  for (const [file, css] of Object.entries(sourceStyles))
    scan(css, { pageTitle: 'Source styles', layerName: file, field: 'CSS' });
  return refs;
}

// Rewrites literal CSS imports, stylesheet links, and isolated HTML documents.
// Dynamic JavaScript-built URLs are deliberately left for the final preflight.
export function rewriteGoogleFonts(text, manifest = {}, map = {}, depth = 0) {
  if (depth > 8)
    throw Error('Font rewrite exceeded nested HTML document depth.');
  const mapped = (value) =>
    value.replace(urlPattern, (raw) => {
      const url = canonical(raw);
      return map[url] || raw;
    });
  const sheet = (raw) => {
    const css = manifest.stylesheets?.[canonical(raw)];
    return typeof css === 'string' ? mapped(css) : null;
  };
  text = text.replace(
    /\b(data-html-document|srcdoc)\s*=\s*("[^"]*"|'[^']*')/gi,
    (_, attr, value) =>
      attr +
      '="' +
      escape(
        rewriteGoogleFonts(
          decode(value.slice(1, -1)),
          manifest,
          map,
          depth + 1,
        ),
      ) +
      '"',
  );
  text = text.replace(/<link\b[^>]*>/gi, (tag) => {
    const attrs = Object.fromEntries(
      [...tag.matchAll(/([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map(
        ([, k, a, b]) => [k.toLowerCase(), decode(a ?? b)],
      ),
    );
    if (
      !/^(?:https?:)?\/\/fonts\.(googleapis|gstatic)\.com(?:\/|$)/i.test(
        attrs.href || '',
      )
    )
      return tag;
    if (/^(preconnect|dns-prefetch)$/i.test(attrs.rel || '')) return '';
    if (attrs.rel !== 'stylesheet') return tag;
    const css = sheet(attrs.href);
    return css === null
      ? tag
      : '<style' +
          (attrs.media ? ' media="' + escape(attrs.media) + '"' : '') +
          '>' +
          css +
          '</style>';
  });
  text = text.replace(
    /@import\s+(?:url\(\s*(['"]?)([^\s)'"<>]+)\1\s*\)|(['"])([^'"]+)\3)\s*([^;]*);/gi,
    (all, _a, a, _b, b, condition) => {
      const raw = a || b;
      if (!/^(?:https?:)?\/\/fonts\.googleapis\.com\//i.test(raw)) return all;
      const css = sheet(raw);
      if (css === null) return all;
      if (/\b(layer|supports)\b/i.test(condition))
        throw Error(
          'Google Fonts import uses layer/supports conditions; use a plain font import before exporting.',
        );
      return condition.trim() ? `@media ${condition.trim()}{${css}}` : css;
    },
  );
  return mapped(text);
}

export async function prepareGoogleFonts(
  references,
  { fetcher = fetch, onProgress = () => {} } = {},
) {
  const stylesheets = {},
    fonts = new Map(),
    licenses = new Map();
  const deadline = AbortSignal.timeout(180_000);
  let total = 0;
  const request = async (url, limit, optional = false) => {
    const parsed = new URL(url);
    const allowed =
      parsed.protocol === 'https:' &&
      !parsed.username &&
      !parsed.password &&
      !parsed.port &&
      ((parsed.hostname === 'fonts.googleapis.com' &&
        /^\/css2?$/.test(parsed.pathname)) ||
        (parsed.hostname === 'fonts.gstatic.com' &&
          /^\/(?:s\/|l\/font)/.test(parsed.pathname)) ||
        (parsed.hostname === 'raw.githubusercontent.com' &&
          /^\/google\/fonts\/main\/(ofl|apache|ufl)\/[a-z0-9]+\/(OFL\.txt|LICENSE\.txt|UFL\.txt)$/.test(
            parsed.pathname,
          )));
    if (!allowed) throw Error('Unsupported Google Fonts URL: ' + url);
    const response = await fetcher(url, {
      redirect: 'error',
      signal: AbortSignal.any([deadline, AbortSignal.timeout(20_000)]),
      headers: { 'User-Agent': 'Mozilla/5.0 Chrome/120.0.0.0 Safari/537.36' },
    });
    if (optional && response.status === 404) return null;
    if (!response.ok)
      throw Error(`Font download returned HTTP ${response.status}.`);
    if (Number(response.headers.get('content-length')) > limit)
      throw Error('Font response exceeds the download size limit.');
    const chunks = [];
    let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      total += chunk.length;
      if (size > limit || total > 64 * 1024 * 1024)
        throw Error('Font download exceeds the export size limit.');
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  };
  const license = async (family) => {
    const key = family.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!key) throw Error('Cannot identify the font family for its licence.');
    if (licenses.has(key)) return;
    for (const [dir, file] of [
      ['ofl', 'OFL.txt'],
      ['apache', 'LICENSE.txt'],
      ['ufl', 'UFL.txt'],
    ]) {
      const source = `https://raw.githubusercontent.com/google/fonts/main/${dir}/${key}/${file}`;
      const data = await request(source, 256 * 1024, true);
      if (data) {
        licenses.set(key, { source, data, filename: key + '-' + file });
        return;
      }
    }
    throw Error(
      `Could not retrieve the original licence for ${family}. Use a bundled font or supply a licensed self-hosted font.`,
    );
  };
  const font = async (url) => {
    if (fonts.has(url)) return;
    if (fonts.size >= 256)
      throw Error(
        'Too many Google Font files in one export; reduce unused families or variants.',
      );
    const data = await request(url, 9_900_000);
    const sig = data.subarray(0, 4).toString('latin1');
    const extension = {
      wOF2: '.woff2',
      wOFF: '.woff',
      OTTO: '.otf',
      '\x00\x01\x00\x00': '.ttf',
    }[sig];
    if (!extension) throw Error('Google Fonts returned an invalid font file.');
    fonts.set(url, { data, extension });
  };
  if (references.size > 64)
    throw Error(
      'Too many Google Fonts requests; remove duplicate or unused font imports.',
    );
  for (const [url, locations] of references) {
    try {
      onProgress({
        message: 'Downloading Google Fonts…',
        completed: Object.keys(stylesheets).length,
        total: references.size,
      });
      if (new URL(url).hostname === 'fonts.gstatic.com') {
        const family = /^\/s\/([^/]+)\//.exec(new URL(url).pathname)?.[1];
        if (!family)
          throw Error(
            'Use the Google Fonts stylesheet URL so its family and licence can be identified.',
          );
        await license(family);
        await font(url);
        continue;
      }
      const css = (await request(url, 1024 * 1024)).toString('utf8');
      const faces = [...css.matchAll(/@font-face\s*\{([^{}]*)\}/gi)];
      if (
        !faces.length ||
        css
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/@font-face\s*\{[^{}]*\}/gi, '')
          .trim()
      )
        throw Error('Google Fonts returned an unsupported stylesheet.');
      for (const [, face] of faces) {
        const family = /font-family\s*:\s*(['"])(.*?)\1\s*;/i.exec(face)?.[2];
        if (!family) throw Error('Google Fonts response has no family name.');
        await license(family);
        const urls = [...face.matchAll(/url\(\s*['"]?([^'"\s)]+)['"]?\s*\)/gi)];
        if (!urls.length)
          throw Error('Google Fonts response has no font file.');
        for (const [, source] of urls) {
          if (new URL(source).hostname !== 'fonts.gstatic.com')
            throw Error('Google Fonts response referenced an unexpected host.');
          await font(source);
        }
      }
      stylesheets[url] = css;
    } catch (error) {
      const reason = 'Could not prepare Google Fonts: ' + error.message;
      throw Object.assign(Error(reason), {
        status: 422,
        mediaIssues: [{ source: url, kind: 'font', reason, locations }],
      });
    }
  }
  return {
    manifest: { stylesheets, fonts: [...fonts.keys()] },
    fonts,
    licenses: [...licenses.values()],
  };
}
