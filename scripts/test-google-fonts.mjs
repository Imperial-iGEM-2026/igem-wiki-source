import { mediaFolder } from './export-media.mjs';
import assert from 'node:assert/strict';
import {
  googleFontReferences,
  prepareGoogleFonts,
  rewriteGoogleFonts,
} from './google-fonts.mjs';
const url =
  'https://fonts.googleapis.com/css2?family=Roboto:wght@400;700&display=swap';
const font = 'https://fonts.gstatic.com/s/roboto/v1/regular.woff2';
const css = `/* latin */ @font-face {font-family: 'Roboto';font-style:normal;font-weight:400 700;src:url(${font}) format('woff2');unicode-range:U+0000-00FF;}`;
const values = {
  'layout:home': JSON.stringify({
    nodes: [
      {
        id: 'intro',
        kind: 'html',
        name: 'Introduction',
        html: `<link rel="stylesheet" href="${url.replaceAll('&', '&amp;')}">`,
      },
      {
        id: 'hidden',
        hidden: true,
        css: '@import "https://fonts.googleapis.com/css2?family=Unused";',
      },
      {
        id: 'child',
        parentId: 'hidden',
        html: '<link href="https://fonts.googleapis.com/css2?family=UnusedChild">',
      },
    ],
  }),
};
const refs = googleFontReferences(values, {
  pages: [{ slug: 'home', title: 'Home' }],
});
assert.deepEqual([...refs.keys()], [url]);
assert.equal(refs.get(url)[0].layerId, 'intro');
const calls = [];
const fetcher = async (source, options) => {
  calls.push(source);
  assert.equal(options.redirect, 'error');
  if (source === url) return new Response(css);
  if (source === font) return new Response(Buffer.from('wOF2test-font'));
  if (source.endsWith('/ofl/roboto/OFL.txt'))
    return new Response('Copyright Roboto Authors\nSIL OPEN FONT LICENSE');
  throw Error('Unexpected request: ' + source);
};
const result = await prepareGoogleFonts(refs, { fetcher });
assert.equal(result.fonts.size, 1);
assert.equal(result.licenses.length, 1);
assert.equal(calls.filter((x) => x === font).length, 1);
const hosted = 'https://static.igem.wiki/teams/6377/wiki/fonts/roboto.woff2';
const map = { [font]: hosted };
const markup = `<link rel="preconnect" href="https://fonts.gstatic.com"><link rel="stylesheet" href="${url.replaceAll('&', '&amp;')}" media="screen"><p>Keep this content.</p>`;
const rewritten = rewriteGoogleFonts(markup, result.manifest, map);
assert.ok(
  !rewritten.includes('fonts.googleapis.com') &&
    !rewritten.includes('fonts.gstatic.com'),
);
assert.match(rewritten, /<style media="screen">/);
assert.ok(
  rewritten.includes(hosted) && rewritten.includes('font-weight:400 700'),
);
assert.ok(rewritten.includes('unicode-range:U+0000-00FF'));
assert.ok(rewritten.includes('<p>Keep this content.</p>'));
for (const statement of [
  `@import url('${url}');`,
  `@import "${url}";`,
  `@import url(${url}) screen;`,
]) {
  assert.ok(
    rewriteGoogleFonts(statement, result.manifest, map).includes(hosted),
  );
}
const encoded = markup
  .replaceAll('&', '&amp;')
  .replaceAll('"', '&quot;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;');
for (const attr of ['data-html-document', 'srcdoc']) {
  const doc = rewriteGoogleFonts(
    `<iframe ${attr}="${encoded}"></iframe>`,
    result.manifest,
    map,
  );
  assert.ok(doc.includes(hosted));
  assert.ok(!doc.includes('fonts.googleapis.com'));
}
await assert.rejects(
  prepareGoogleFonts(refs, {
    fetcher: async () => new Response('offline', { status: 503 }),
  }),
  (e) => e.status === 422 && e.mediaIssues[0].locations[0].layerId === 'intro',
);
await assert.rejects(
  prepareGoogleFonts(refs, {
    fetcher: async (source) =>
      source === url ? new Response(css) : new Response('', { status: 404 }),
  }),
  /original licence/,
);
await assert.rejects(
  prepareGoogleFonts(refs, {
    fetcher: async (source) =>
      source === url
        ? new Response(css.replace(font, 'http://127.0.0.1/font'))
        : new Response('OFL'),
  }),
  /unexpected host/,
);
await assert.rejects(
  prepareGoogleFonts(refs, {
    fetcher: async (source, opts) =>
      source === font ? new Response('not a font') : fetcher(source, opts),
  }),
  /invalid font/,
);
assert.equal(
  rewriteGoogleFonts('@import "' + url + '";', {}, {}),
  '@import "' + url + '";',
  'Unprepared imports remain visible to preflight',
);
console.log(
  'PASS: Google Fonts download, licences, variants, deduplication, hidden content, CSS/link/iframe rewrites, provenance and download failures.',
);

assert.equal(
  mediaFolder('https://fonts.gstatic.com/l/font?kit=test', 'font'),
  'fonts',
);
