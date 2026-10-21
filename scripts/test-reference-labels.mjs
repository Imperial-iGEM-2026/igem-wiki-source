import assert from 'node:assert/strict';
import { build } from 'vite';
import { common, root } from './build-options.mjs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
await build({
  ...common,
  build: {
    ssr: path.join(root, 'scripts/studio-test-entry.tsx'),
    outDir: path.join(root, 'work/reference-unit'),
    emptyOutDir: true,
    rollupOptions: { output: { entryFileNames: 'test.mjs' } },
  },
});
const E = await import(
  pathToFileURL(path.join(root, 'work/reference-unit/test.mjs'))
);
const refNode = {
  ...E.newNode('refs', 'references', 'References'),
  references: [
    { id: 'alpha', text: 'First paper', url: 'https://example.org/a' },
    { id: 'beta', text: 'Second paper', url: '' },
  ],
};
const citeNode = {
  ...E.newNode('paragraph', 'text'),
  body: 'Evidence ' + E.citationToken('refs', 'beta') + ' and $x^2$.',
};
const refsLayout = {
  ...E.emptyLayout,
  nodes: [citeNode, refNode],
  order: ['paragraph', 'refs'],
};
assert.ok(E.validateLayout(refsLayout));
const refsHtml = E.renderCanvas(refsLayout);
assert.match(refsHtml, /data-citation-link/);
assert.match(refsHtml, /class="reference-number">\[1\]<\/span>/);
assert.match(refsHtml, /class="reference-number">\[2\]<\/span>/);
assert.match(refsHtml, /\[2\]/);
const targetHref = refsHtml.match(
  /data-citation-link="[^"]*" href="([^"]+)"/,
)[1];
assert.ok(
  refsHtml.includes('id="' + decodeURIComponent(targetHref.slice(1)) + '"'),
);

for (const href of ['#citation-refs%252Fbeta','/results#citation-refs%252Fbeta','#label%20with%20spaces']) assert.equal(E.safeLink(href),true,href);
for (const href of ['/results#bad%','/results#bad%GG','/results#bad%00','/results#bad%0a','//evil.example/#x','javascript:alert(1)','/results%2fother#x']) assert.equal(E.safeLink(href),false,href);
const labelled = E.citationToken('refs', 'beta', '(Archer et al., 2010)');
assert.equal(labelled, '[@refs/beta|(Archer et al., 2010)]');
const labelledHtml = E.renderCanvas({...refsLayout,nodes:[{...citeNode,body:labelled},refNode]});
assert.match(labelledHtml, /inline-citation-label/);
assert.match(labelledHtml, />\(Archer et al\., 2010\)<\/a>/);
assert.ok(labelledHtml.includes(targetHref), 'custom labels retain the same reference target');
const specialLabel = E.citationToken('refs','beta','[Archer] <img src=x onerror=alert(1)>');
const specialHtml = E.renderCanvas({...refsLayout,nodes:[{...citeNode,body:specialLabel},refNode]});
assert.ok(!specialHtml.includes('<img src=x'));
assert.ok(specialHtml.includes('[Archer] &lt;img'));
const literalHtml = E.renderCanvas({...refsLayout,nodes:[{...citeNode,body:'`'+labelled+'` and \\'+labelled},refNode]});
assert.ok(!literalHtml.includes('data-citation-link'));
const linkedHtml = E.renderCanvas({...refsLayout,nodes:[{...citeNode,body:'[(Archer et al., 2010)](/results'+targetHref+')'},refNode]});
assert.ok(linkedHtml.includes('href="/results'+targetHref+'"'));

const oldAnchor = E.referenceIndex(refsLayout)['refs/beta'].anchor;
const reorderedRefs = {
  ...refsLayout,
  nodes: [
    citeNode,
    { ...refNode, references: [...refNode.references].reverse() },
  ],
};
assert.equal(E.referenceIndex(reorderedRefs)['refs/beta'].anchor, oldAnchor);
assert.equal(E.referenceIndex(reorderedRefs)['refs/beta'].number, 1);
assert.match(
  E.renderCanvas({
    ...refsLayout,
    nodes: [citeNode, { ...refNode, hidden: true }],
  }),
  /reference unavailable/,
);
assert.ok(
  !E.validateLayout({
    ...refsLayout,
    nodes: [
      {
        ...refNode,
        references: [{ id: 'a', text: 'Bad URL', url: 'javascript:alert(1)' }],
      },
    ],
  }),
);
assert.ok(
  !E.validateLayout({
    ...refsLayout,
    nodes: [
      {
        ...refNode,
        references: [refNode.references[0], refNode.references[0]],
      },
    ],
  }),
);
let clickHandler;
const scrollCalls = [],
  focusCalls = [],
  animations = [];
const refTarget = {
  scrollIntoView: (args) => scrollCalls.push(args),
  focus: (args) => focusCalls.push(args),
  getAnimations: () => [],
  animate: (...args) => animations.push(args),
};
const mockRoot = {
  addEventListener: (_, fn) => (clickHandler = fn),
  removeEventListener: () => {},
  getElementById: (id) => (id === oldAnchor ? refTarget : null),
};
const previousWindow = globalThis.window,
  previousHistory = globalThis.history;
globalThis.window = { matchMedia: () => ({ matches: false }) };
globalThis.history = { state: null, replaceState: () => {} };
try {
  const cleanup = E.startReferenceNavigation(mockRoot);
  const event = {
    button: 0,
    target: {
      closest: () => ({
        getAttribute: () => '#' + encodeURIComponent(oldAnchor),
      }),
    },
    preventDefault: () => {},
  };
  clickHandler(event);
  assert.equal(scrollCalls[0].behavior, 'smooth');
  assert.equal(animations.length, 1);
  assert.equal(focusCalls.length, 1);
  globalThis.window.matchMedia = () => ({ matches: true });
  clickHandler(event);
  assert.equal(scrollCalls[1].behavior, 'instant');
  assert.equal(animations.length, 1);
  cleanup();
} finally {
  globalThis.window = previousWindow;
  globalThis.history = previousHistory;
}
console.log(
  'PASS: citations resolve stable anchors and numbering, survive reorder, report missing entries, reject unsafe URLs and highlight with reduced-motion support.',
);

