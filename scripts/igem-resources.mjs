import postcss from 'postcss';

export function igemURL(value) {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      ['igem.org', 'igem.wiki'].some(
        (host) => url.hostname === host || url.hostname.endsWith('.' + host),
      )
    );
  } catch {
    return false;
  }
}

export function cssResources(css) {
  const urls = [];
  const tree = postcss.parse(css);
  const collect = (value) => {
    for (const match of value.matchAll(/url\(\s*['"]?([^'"\s)]+)['"]?\s*\)/gi))
      urls.push(match[1]);
  };
  tree.walkDecls((declaration) => collect(declaration.value));
  tree.walkAtRules('import', (rule) => {
    collect(rule.params);
    const quoted = rule.params.match(/^['"]([^'"]+)['"]/);
    if (quoted) urls.push(quoted[1]);
  });
  return urls;
}

export function withoutGoogleFontImports(css) {
  const tree = postcss.parse(css);
  tree.walkAtRules('import', (rule) => {
    if (/https:\/\/fonts\.googleapis\.com\//i.test(rule.params)) rule.remove();
  });
  return tree.toString();
}

// This checks literal markup/CSS dependencies, not arbitrary JavaScript.
// The official HAR check is still required on the deployed website.
export function externalResources(html) {
  const refs = [];
  for (const match of html.matchAll(
    /<(?:script|link|img|image|source|video|audio|iframe|object|embed|model-viewer)\b[^>]*>/gi,
  )) {
    for (const attr of match[0].matchAll(
      /\b(?:src|href|xlink:href|poster|data)="([^"]+)"/gi,
    ))
      refs.push(attr[1]);
    for (const attr of match[0].matchAll(/\bsrcset="([^"]+)"/gi))
      refs.push(
        ...attr[1].split(',').map((part) => part.trim().split(/\s+/)[0]),
      );
  }
  for (const style of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi))
    refs.push(...cssResources(style[1]));
  for (const style of html.matchAll(/\bstyle="([^"]*)"/gi))
    refs.push(...cssResources(`x{${style[1].replaceAll('&quot;', '"')}}`));
  return [
    ...new Set(
      refs.filter((url) => /^(?:https?:)?\/\//i.test(url) && !igemURL(url)),
    ),
  ];
}
