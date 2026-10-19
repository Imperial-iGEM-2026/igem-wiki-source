import assert from 'node:assert/strict';
import { build } from 'vite';
import { common, root } from './build-options.mjs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
await build({
  ...common,
  build: {
    ssr: path.join(root, 'scripts/studio-test-entry.tsx'),
    outDir: path.join(root, 'work/studio-unit'),
    emptyOutDir: true,
    rollupOptions: { output: { entryFileNames: 'test.mjs' } },
  },
});
const E = await import(
  pathToFileURL(path.join(root, 'work/studio-unit/test.mjs'))
);
// Inserting must not silently reposition or reparent any existing content.
for (const mode of [undefined, 'flow', 'free']) {
  const frame = { ...E.newNode(E.CUSTOM_CONTENT, 'section'), layoutMode: mode };
  const first = { ...E.newNode('first', 'image'), parentId: frame.id, y: 40, freeHeight: 350 };
  const last = { ...E.newNode('last', 'text'), parentId: frame.id, y: 500, freeHeight: 120 };
  const source = { ...E.emptyLayout, customCss: '.test { color: red; }', nodes: [frame, first, last], order: [frame.id, first.id, last.id] };
  const snapshot = structuredClone(source);
  const result = E.insertNode(source, E.newNode('inserted', 'image'), { after: first.id, renderedHeights: { last: 300 } });
  assert.deepEqual(source, snapshot);
  assert.deepEqual(result.nodes.slice(0, 3), source.nodes);
  assert.deepEqual(result.order.filter(id => id !== 'inserted'), source.order);
  assert.deepEqual(result.order, [frame.id, first.id, 'inserted', last.id]);
  assert.equal(result.customCss, source.customCss);
  assert.equal(result.nodes.at(-1).parentId, frame.id);
  if (mode === 'free') assert.equal(result.nodes.at(-1).y, 824);
  else assert.equal(result.nodes.at(-1).y, undefined);
  assert.equal(E.validateLayout(result), true);
}
const rootFrame = E.newNode('root-frame', 'section');
const nestedFrame = { ...E.newNode('nested-frame', 'section'), parentId: rootFrame.id };
const nestedText = { ...E.newNode('nested-text', 'text'), parentId: nestedFrame.id };
const sibling = { ...E.newNode('sibling', 'text'), parentId: rootFrame.id };
const tree = { ...E.emptyLayout, nodes: [rootFrame, nestedFrame, nestedText, sibling], order: [rootFrame.id, nestedFrame.id, nestedText.id, sibling.id] };
const nestedInsertion = E.insertNode(tree, E.newNode('new-child', 'text'), { inside: rootFrame.id, after: nestedText.id });
assert.equal(nestedInsertion.nodes.at(-1).parentId, rootFrame.id);
assert.equal(nestedInsertion.order.indexOf('new-child'), nestedInsertion.order.indexOf(nestedFrame.id) + 1);
const topInsertion = E.insertNode(tree, E.newNode('new-root', 'text'), { after: nestedText.id });
assert.equal(topInsertion.nodes.at(-1).parentId, undefined);
assert.equal(topInsertion.order[1], 'new-root');
assert.equal(E.validateLayout(E.insertNode(tree, E.newNode('inside-text', 'image'), { inside: nestedText.id })), true);
assert.throws(() => E.insertNode({ ...tree, nodes: [{ ...rootFrame, locked: true }, nestedFrame, nestedText, sibling] }, E.newNode('locked-child', 'text'), { inside: nestedFrame.id }), /Unlock/);
let tallFrame = { ...E.emptyLayout, nodes: [{ ...rootFrame, layoutMode: 'free' }], order: [rootFrame.id] };
for (let i = 0; i < 12; i++) {
  const before = tallFrame;
  tallFrame = E.insertNode(tallFrame, E.newNode('pdf-' + i, 'pdf'), { inside: rootFrame.id });
  assert.deepEqual(tallFrame.nodes.slice(0, -1), before.nodes);
  if (i) assert.ok(tallFrame.nodes.at(-1).y >= before.nodes.at(-1).y + before.nodes.at(-1).freeHeight + 24);
  assert.equal(E.validateLayout(tallFrame), true);
}
assert.ok(tallFrame.nodes.at(-1).y > 2000, 'free inserts must not stop working when a frame grows');
for (const editing of [true, false]) {
  const missing = E.renderSavedPage(undefined, editing);
  assert.match(missing, /Page layout was not received/);
  assert.ok(
    !missing.includes('original-template'),
    'missing server data must never produce editable defaults',
  );
  assert.ok(
    !missing.includes('results-saved-layout.json'),
    'do not manufacture a recovery file for missing data',
  );
  for (const saved of [
    '{broken',
    JSON.stringify({ ...E.emptyLayout, nodes: [{ id: 'invalid' }] }),
  ]) {
    const output = E.renderSavedPage(saved, editing);
    assert.match(output, /Saved page layout could not be loaded/);
    assert.match(output, /results-saved-layout.json/);
    assert.ok(
      !output.includes('original-template'),
      'invalid saved data must not become editable template content',
    );
  }
}
assert.match(
  E.renderSavedPage(JSON.stringify(E.emptyLayout), false),
  /original-template/,
  'explicit server defaults still render new pages',
);
// A page's section count is not capped, including when duplicating layers.
// Deletion must route before PageCanvas tries to render the removed layout.
const deletionData = Object.fromEntries(
  Object.entries(E.templateDefaults('regelerate')).map(([id, value]) => [
    id,
    { value, version: 1, author: 'Server' },
  ]),
);
const homeMarker = E.newNode(
  'deletion-home-marker',
  'text',
  'Returned to the existing home page',
);
deletionData['layout:home'].value = JSON.stringify({
  ...E.emptyLayout,
  nodes: [homeMarker],
  order: [homeMarker.id],
});
const removedTemplate = {
  ...deletionData,
  'pages:removed': { value: '["results"]', version: 2, author: 'Server' },
};
delete removedTemplate['layout:results'];
const customRegistry = JSON.stringify([
  { slug: 'temporary-page', title: 'Temporary page' },
]);
const customBeforeDelete = {
  ...deletionData,
  ...Object.fromEntries(
    Object.entries(E.customDefaults(customRegistry)).map(([id, value]) => [
      id,
      { value, version: 1, author: 'Server' },
    ]),
  ),
  'pages:custom': { value: customRegistry, version: 2, author: 'Server' },
};
for (const editing of [false, true]) {
  for (const [next, slug, previous] of [
    [removedTemplate, 'results', deletionData],
    [deletionData, 'temporary-page', customBeforeDelete],
  ]) {
    const output = E.renderCompletePreview(next, slug, previous, editing);
    assert.ok(
      !output.includes('Page layout was not received'),
      'deleted page must route to Home before mounting its missing canvas',
    );
    assert.ok(!output.includes('Saved page layout could not be loaded'));
    if (!editing) assert.match(output, /Returned to the existing home page/);
  }
}
const stillListedButMissing = { ...deletionData };
delete stillListedButMissing['layout:results'];
assert.match(
  E.renderCompletePreview(stillListedButMissing, 'results'),
  /Page layout was not received/,
  'an existing page with missing content must still be protected',
);
assert.ok(
  !E.renderCompletePreview(removedTemplate, 'members').includes(
    'Returned to the existing home page',
  ),
  'deleting a different page must not move the current page',
);
const manyNodes = Array.from({ length: 1001 }, (_, i) =>
  E.newNode(`many-${i}`, 'text', `Section ${i}`),
);
const largeLayout = {
  ...E.emptyLayout,
  nodes: manyNodes,
  order: manyNodes.map((n) => n.id),
};
assert.ok(E.validateLayout(largeLayout));
const duplicatedLarge = E.duplicateNodes(
  largeLayout,
  ['many-1000'],
  () => 'many-copy',
).layout;
assert.equal(duplicatedLarge.nodes.length, 1002);
assert.ok(E.validateLayout(duplicatedLarge));
assert.equal(E.materialize(duplicatedLarge, []).nodes.length, 1002);
assert.equal(
  E.validateLayout({ ...largeLayout, nodes: [...manyNodes, manyNodes[0]] }),
  false,
);
const base = E.materialize(
  {
    ...E.emptyLayout,
    nodes: [E.newNode('a', 'text', 'A'), E.newNode('b', 'image', 'B')],
    order: ['a', 'b'],
  },
  [{ id: 'intro', label: 'Intro' }],
);
assert.deepEqual(base.order, ['a', 'b', 'intro']);
assert.equal(base.nodes.length, 3);
assert.ok(E.validateLayout(base));
const local = E.patchNodes(base, ['a'], {
  span: 5,
  paddingX: 32,
  mobileSpan: 12,
  tabletSpan: 6,
});
const remote = E.patchNodes(base, ['a', 'b'], { background: '#112233' });
let merge = E.mergeLayouts(base, local, remote);
assert.deepEqual(merge.conflicts, []);
assert.equal(merge.layout.nodes[0].span, 5);
assert.equal(merge.layout.nodes[0].background, '#112233');
assert.equal(merge.layout.nodes[1].background, '#112233');
assert.ok(E.validateLayout(merge.layout));
merge = E.mergeLayouts(base, local, E.patchNodes(base, ['a'], { span: 9 }));
assert.equal(merge.conflicts.length, 1);
assert.equal(merge.layout.nodes[0].span, 5);
merge = E.mergeLayouts(
  base,
  E.removeNodes(base, ['a']),
  E.patchNodes(base, ['a'], { title: 'Remote' }),
);
assert.equal(merge.conflicts.length, 1);
assert.ok(!merge.layout.nodes.some((n) => n.id === 'a'));
const added1 = {
    ...base,
    nodes: [...base.nodes, E.newNode('x', 'text')],
    order: ['x', ...base.order],
  },
  added2 = {
    ...base,
    nodes: [...base.nodes, E.newNode('y', 'text')],
    order: ['y', ...base.order],
  };
merge = E.mergeLayouts(base, added1, added2);
assert.equal(merge.conflicts.length, 0);
assert.equal(new Set(merge.layout.order).size, 5);
assert.ok(merge.layout.order.includes('x') && merge.layout.order.includes('y'));
const locked = E.patchNodes(base, ['a'], { locked: true });
assert.equal(E.patchNodes(locked, ['a'], { span: 1 }).nodes[0].span, 12);
assert.ok(E.removeNodes(locked, ['a']).nodes.some((n) => n.id === 'a'));
assert.deepEqual(E.moveBefore(locked, ['a'], 'intro').order, locked.order);
assert.deepEqual(E.moveBefore(base, ['a', 'b'], null).order, [
  'intro',
  'a',
  'b',
]);
assert.equal(
  E.removeNodes(base, ['intro']).nodes.find((n) => n.id === 'intro').hidden,
  true,
);
const copy = E.duplicateNodes(base, ['a', 'intro'], () => 'copy');
assert.equal(copy.ids.length, 1);
assert.deepEqual(copy.layout.order, ['a', 'copy', 'b', 'intro']);
assert.equal(copy.layout.nodes.at(-1).name, 'A copy');
assert.equal(E.snapSpan(6, 100, 1200, 0), 7);
assert.equal(E.snapSpan(6, -10000, 1200, 0), 1);
assert.equal(E.snapSpan(6, 10000, 1200, 0), 12);
let history = { current: base, past: [], future: [] };
history = E.historyReducer(history, {
  type: 'edit',
  value: local,
  group: 'resize',
});
history = E.historyReducer(history, {
  type: 'edit',
  value: E.patchNodes(local, ['a'], { span: 4 }),
  group: 'resize',
});
assert.equal(history.past.length, 1);
history = E.historyReducer(history, { type: 'undo' });
assert.deepEqual(history.current, base);
history = E.historyReducer(history, { type: 'redo' });
assert.equal(history.current.nodes[0].span, 4);
history = E.historyReducer(history, {
  type: 'reset',
  value: E.mergeLayouts(base, local, remote).layout,
  previous: remote,
});
history = E.historyReducer(history, { type: 'undo' });
assert.deepEqual(history.current, remote);
for (const invalid of [
  { span: 1.5 },
  { tabletSpan: 0 },
  { mobileSpan: 13 },
  { opacity: 101 },
  { fontSize: 500 },
  { borderColor: 'red' },
  { paddingX: Infinity },
  { locked: 'yes' },
  { src: 'javascript:alert(1)' },
])
  assert.equal(
    E.validateLayout(E.patchNodes(base, ['a'], invalid)),
    false,
    JSON.stringify(invalid),
  );
const styled = E.patchNodes(local, ['a'], {
  fontSize: 24,
  headingSize: 48,
  textColor: '#123456',
  radius: 16,
  borderWidth: 2,
  borderColor: '#334455',
  lineHeight: 1.5,
  shadow: 'soft',
});
assert.ok(E.validateLayout(styled));
const html = E.renderCanvas(styled);
const themed = E.renderTemplateAppearance(
  styled,
  'regelerate',
  'notebook-white',
);
assert.match(themed, /Prion research/);
assert.match(themed, /data-template-theme="regelerate"/);
assert.match(themed, /--paper: #ffffff/);
assert.ok(
  !themed.includes('data-template-theme="notebook-white"'),
  'appearance CSS is scoped to preserved content template',
);
const pdfNode = {
  ...E.newNode('pdf-preview', 'pdf'),
  minHeight: 340,
  span: 9,
  src: '/api/media/12345678-1234-1234-1234-123456789012.pdf',
};
const pdfHtml = E.renderCanvas({
  ...E.emptyLayout,
  nodes: [pdfNode],
  order: [pdfNode.id],
});
const pdfFrame = pdfHtml.match(/<iframe\b[^>]*class="pdf-viewer"[^>]*>/)?.[0];
assert.ok(pdfFrame, 'PDF has an inline viewer');
assert.ok(
  !pdfFrame.includes('sandbox'),
  'native PDF viewer must not be sandboxed',
);
assert.match(pdfFrame, /referrerPolicy="no-referrer"/i);
assert.doesNotMatch(pdfHtml, /class="media-download"/);
const oldPdfMove = E.applySelectionStyle(
  '',
  '[data-layer-id="pdf-preview"] > div:nth-of-type(1)',
  'translate',
  '170px -180px',
);
const repairedPdfMove = E.normalizePdfPlacementCss(oldPdfMove, ['pdf-preview']);
assert.match(repairedPdfMove, /\[data-layer-id="pdf-preview"\]\s*\{/);
assert.ok(!repairedPdfMove.includes('nth-of-type'));
assert.match(repairedPdfMove, /170px -180px/);
assert.equal(
  E.normalizePdfPlacementCss(repairedPdfMove, ['pdf-preview']),
  repairedPdfMove,
);
const authoredMove =
  '[data-layer-id="pdf-preview"] > div:nth-of-type(1) { translate: 10px 20px; }';
assert.equal(
  E.normalizePdfPlacementCss(authoredMove, ['pdf-preview']),
  authoredMove,
);
assert.match(pdfHtml, /grid-column:span 9/);
assert.match(pdfHtml, /(?:;|\")height:340px/);
const freePdfHtml = E.renderCanvas({
  ...E.emptyLayout,
  nodes: [
    { ...E.newNode('pdf-frame', 'section'), layoutMode: 'free' },
    { ...pdfNode, parentId: 'pdf-frame', freeWidth: 55, freeHeight: 275 },
  ],
  order: ['pdf-frame', pdfNode.id],
});
assert.match(freePdfHtml, /(?:;|\")height:275px/);
assert.match(freePdfHtml, /width:55%/);
for (const token of [
  'grid-column:span 5',
  'padding-inline:32px',
  '--node-mobile-span:12',
  '--node-tablet-span:6',
  '--node-font-size:24px',
  'border-radius:16px',
  '--node-color:#123456',
])
  assert.ok(html.includes(token), token);
assert.ok(!html.includes('studio-resize'));
assert.ok(
  !E.renderCanvas(E.removeNodes(styled, ['intro'])).includes('Prion research'),
);
const studio = E.renderStudio();
for (const label of [
  'Website Studio',
  'Saved layout',
  'Layers',
  'Page settings',
  'Page canvas',
  'Desktop',
  'Mobile',
])
  assert.ok(studio.includes(label), label);
console.log(
  'PASS: studio renders, responsive styles serialize, validation bounds, locked layers, multi-reorder, duplication, resize snapping, grouped undo/redo, disjoint collaboration merge and explicit conflict detection.',
);

// Real pointer phases: no reorder on click, commit exactly once on release,
// insert after targets when moving down, cancellation and non-primary pointers.
const rects = ['a', 'b', 'intro'].map((id, i) => ({
  id,
  left: 10,
  top: 20 + i * 40,
  width: 200,
  height: 40,
}));
let dragged = base,
  commits = 0,
  finished = [],
  markers = [];
const callbacks = {
  hit: (p) => E.findDropMark(rects, ['a'], p),
  update: (p, m) => markers.push(m),
  commit: (m) => {
    commits++;
    dragged = E.moveBefore(
      dragged,
      ['a'],
      E.targetBefore(dragged.order, ['a'], m),
    );
  },
  finish: (moved) => finished.push(moved),
};
let session = E.createDragSession({ x: 40, y: 35 }, 1, callbacks);
session.move({ x: 42, y: 37 });
session.release({ x: 42, y: 37 });
assert.equal(commits, 0);
assert.equal(finished.at(-1), false);
session = E.createDragSession({ x: 40, y: 35 }, 1, callbacks);
session.move({ x: 40, y: 95 }, 2);
assert.equal(markers.length, 0);
session.move({ x: 40, y: 95 });
assert.equal(markers.at(-1).edge, 'after');
assert.equal(commits, 0);
session.release({ x: 40, y: 95 });
session.release({ x: 40, y: 95 });
assert.equal(commits, 1);
assert.deepEqual(dragged.order, ['b', 'a', 'intro']);
session = E.createDragSession({ x: 40, y: 35 }, 1, callbacks);
session.move({ x: 40, y: 500 });
session.cancel();
session.release({ x: 40, y: 500 });
assert.equal(commits, 1);
session = E.createDragSession({ x: 40, y: 35 }, 1, callbacks);
session.move({ x: 40, y: 500 });
session.release({ x: 40, y: 500 });
assert.deepEqual(dragged.order, ['b', 'intro', 'a']);
assert.equal(
  E.findDropMark(rects, ['a', 'b', 'intro'], { x: 10, y: 20 }),
  null,
);
const css =
  '.feature h2, .custom-text { color: #bbdd99; } @media (max-width: 760px) { .topic-grid { gap: 12px; } }';
assert.equal(E.cssError(css), '');
const largeCss = '.feature { color: #123456; }\n'.repeat(9000);
assert.equal(E.cssError(largeCss), '');
assert.ok(E.validateLayout({ ...base, customCss: largeCss }));
const scoped = E.compileCustomCss(css, '[data-page-css="home"]');
  const viewportCss = '.header{width:100vw;margin-left:calc(50% - 50vw)} h2{font-size:clamp(56px,8.2vw,112px)}';
  assert.match(E.compileCustomCss(viewportCss, '[data-page-css="home"]', true), /100cqw/);
  assert.match(E.compileCustomCss(viewportCss, '[data-page-css="home"]', true), /8\.2cqw/);
  assert.match(E.compileCustomCss(viewportCss, '[data-page-css="home"]'), /100vw/);
assert.ok(scoped.includes('[data-page-css="home"] .feature h2'));
assert.ok(scoped.includes('[data-page-css="home"] .custom-text'));
assert.ok(scoped.includes('@media'));
assert.ok(
  E.compileCustomCss(css, '[data-page-css="home"]', true).includes(
    '@container studioPage (max-width: 760px)',
  ),
);
for (const invalid of [
  '@import "x";',
  'h2{background:url(https://bad.test)}',
  'h2{background:image-set("x" 1x)}',
  '</style><script>bad()</script>',
  'h2{color:red',
  'h2{--x:u\\72l(x)}',
  '@font-face{font-family:x;src:local(x)}',
  ':scope + aside { display:none }',
  'h2{color:red; h3{color:blue}}',
  'x'.repeat(20001),
])
  assert.ok(E.cssError(invalid), invalid);
assert.equal(E.validateLayout({ ...base, customCss: '@import "x";' }), false);
assert.ok(E.validateLayout({ ...base, customCss: css }));
assert.ok(E.renderCanvas({ ...base, customCss: css }).includes('<style>'));
assert.equal(
  E.mergeLayouts(base, { ...base, customCss: css }, remote).layout.customCss,
  css,
);
assert.ok(
  E.mergeLayouts(
    { ...base, customCss: '' },
    { ...base, customCss: 'h2{color:red}' },
    { ...base, customCss: 'h2{color:blue}' },
  ).conflicts.includes('Custom CSS'),
);
for (const label of [
  'Resize layers panel',
  'Resize properties panel',
  'Canvas width in pixels',
  'Assistant',
])
  assert.ok(studio.includes(label), label);
console.log(
  'PASS: pointer down/move/up and cancel, before/after insertion, end drop, CSS parser and scoping, responsive CSS conversion, unsafe CSS rejection and collaborative CSS conflicts.',
);

assert.ok(studio.includes('aria-label="Hide Introduction"'));
assert.ok(studio.includes('aria-label="Lock Introduction"'));
assert.ok(studio.includes('aria-label="Open pages"'));
assert.ok(!studio.includes('Windowed editor'));
assert.ok(!studio.includes('Reset workspace'));
const assistant = E.renderAssistant();
assert.ok(
  assistant.indexOf('Design conversation') <
    assistant.indexOf('Page stylesheet'),
);
assert.ok(assistant.includes('class="studio-css-page" hidden=""'));
assert.ok(!assistant.includes('About AI proposals'));
assert.ok(!studio.includes('Discard layout draft'));
assert.ok(!assistant.includes('<details class="studio-advanced" open'));
const pages = E.renderPages();
assert.equal((pages.match(/aria-current="page"/g) || []).length, 1);
assert.equal((pages.match(/<button/g) || []).length, 30);
assert.ok(E.renderPages('human').includes('Human'));
console.log(
  'PASS: accessible layer actions, page navigation, removed window/reset controls, AI-first inspector and CSS collapsed by default.',
);

// Exercise nested element selection against content and editor-only wrappers.
class ElementFixture {
  constructor(tag, classes = '', attrs = {}, children = [], text = '') {
    Object.assign(this, {
      localName: tag,
      classes,
      attrs,
      children,
      textContent: text,
      parentElement: null,
    });
    children.forEach((child) => {
      child.parentElement = this;
    });
  }
  getAttribute(key) {
    return this.attrs[key] ?? null;
  }
  contains(child) {
    return child === this || this.children.some((item) => item.contains(child));
  }
  querySelectorAll(selector) {
    return this.children.flatMap((child) => [
      ...(selector.startsWith('[') &&
      Object.hasOwn(child.attrs, selector.slice(1, -1))
        ? [child]
        : []),
      ...child.querySelectorAll(selector),
    ]);
  }
  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }
  closest(selectors) {
    const matches = selectors
      .split(',')
      .some((selector) =>
        selector.startsWith('.')
          ? this.classes.split(' ').includes(selector.slice(1))
          : selector.startsWith('[')
            ? Object.hasOwn(this.attrs, selector.slice(1, -1))
            : this.localName === selector,
      );
    return matches ? this : this.parentElement?.closest(selectors) || null;
  }
}
const inline = new ElementFixture(
  'span',
  'editable',
  { 'data-field-id': 'heading-text' },
  [],
  'Second heading',
);
const heading = new ElementFixture('h2', '', {}, [inline], 'Second heading');
const handle = new ElementFixture('button', 'studio-section-handle');
const section = new ElementFixture('section', '', {}, [
  new ElementFixture('h2'),
  heading,
]);
const layer = new ElementFixture('div', '', { 'data-layer-id': 'intro' }, [
  handle,
  section,
]);
const target = E.pickDesignTarget(inline);
assert.equal(
  target.selector,
  '[data-layer-id="intro"] > section:nth-of-type(1) > h2:nth-of-type(2) > span:nth-of-type(1)',
);
assert.equal(target.label, 'SPAN · Second heading');
assert.equal(target.fieldId, 'heading-text');
assert.equal(E.pickDesignTarget(handle).selector, '[data-layer-id="intro"]');
// Editor controls disappear in publication; the content selector must stay stable.
layer.children.shift();
inline.classes = '';
assert.equal(E.pickDesignTarget(inline).selector, target.selector);
assert.equal(E.pickDesignTarget(heading).fieldId, 'heading-text');
assert.equal(E.pickDesignTarget(new ElementFixture('p')), null);
const htmlFrameTarget = new ElementFixture('iframe');
const htmlInteract = new ElementFixture('button', '', { 'data-html-interaction-control': '' });
const htmlWrapper = new ElementFixture('div', 'custom-html-block', {}, [htmlFrameTarget, htmlInteract]);
new ElementFixture('div', '', { 'data-layer-id': 'html-position', 'data-layer-kind': 'html' }, [htmlWrapper]);
assert.equal(E.pickDesignTarget(htmlFrameTarget).selector, '[data-layer-id="html-position"]');
assert.equal(E.pickDesignTarget(htmlWrapper).selector, '[data-layer-id="html-position"]');
assert.equal(E.pickDesignTarget(htmlInteract), null);

assert.equal(E.cssError(`${target.selector} { color: #123456; }`), '');
const footerText = new ElementFixture(
  'span',
  'editable',
  { 'data-field-id': 'footer-label' },
  [],
  'Back to the homepage',
);
const footerTitle = new ElementFixture(
  'span',
  'editable',
  { 'data-field-id': 'footer-title' },
  [],
  'Sponsors',
);
const footerLink = new ElementFixture(
  'a',
  '',
  { 'data-template-link': 'link-footer', href: '/' },
  [footerText, footerTitle],
);
const footerLayer = new ElementFixture(
  'div',
  '',
  { 'data-layer-id': 'footer' },
  [footerLink],
);
const footerTarget = E.pickDesignTarget(footerTitle);
assert.equal(footerTarget.fieldId, 'footer-title');
assert.match(footerTarget.selector, /span:nth-of-type\(2\)$/);
assert.equal(E.pickDesignTarget(footerLink).fieldId, undefined);
const bodyText = new ElementFixture(
  'div',
  '',
  { 'data-node-text': 'body' },
  [],
  'Custom paragraph',
);
new ElementFixture('div', '', { 'data-layer-id': 'custom-text' }, [bodyText]);
assert.equal(E.pickDesignTarget(bodyText).textProperty, 'body');
assert.equal(footerLayer.contains(footerTitle), true);
console.log(
  'PASS: precise nested text fields, mixed footer labels, custom text properties and publication-stable selectors.',
);

// Selection dock: preserve authored rules, bound generated CSS and keep mobile overrides last.
const dockSelector =
  '[data-layer-id="intro"] > section:nth-of-type(1) > h1:nth-of-type(1)';
let dockCss = '.other { color: red; }';
dockCss = E.applySelectionStyle(
  dockCss,
  dockSelector,
  'font-size',
  '24px',
  'mobile',
);
dockCss = E.applySelectionStyle(
  dockCss,
  dockSelector,
  'font-size',
  '42px',
  'all',
);
dockCss = E.applySelectionStyle(
  dockCss,
  dockSelector,
  'font-weight',
  '700',
  'all',
);
dockCss = E.applySelectionStyle(
  dockCss,
  dockSelector,
  'font-size',
  '52px',
  'all',
);
assert.ok(dockCss.includes('.other { color: red; }'));
assert.ok(!dockCss.includes('42px'));
assert.equal((dockCss.match(/prion-selection-controls/g) || []).length, 2);
assert.ok(dockCss.indexOf('52px') < dockCss.indexOf('24px'));
dockCss = E.applySelectionStyle(
  dockCss,
  dockSelector,
  'font-size',
  '36px',
  'tablet',
);
assert.ok(dockCss.indexOf('52px') < dockCss.indexOf('36px'));
assert.ok(dockCss.indexOf('36px') < dockCss.indexOf('24px'));
assert.equal(E.cssError(dockCss), '');
const compiledDock = E.compileCustomCss(
  dockCss,
  '[data-page-css="home"]',
  true,
);
assert.ok(compiledDock.includes('@container studioPage (max-width: 760px)'));
assert.ok(compiledDock.includes('!important'));
assert.ok(!compiledDock.includes('prion-selection-controls'));
assert.match(compiledDock, /@layer studio-selection/);
assert.ok(compiledDock.indexOf('52px') < compiledDock.indexOf('36px'));
assert.ok(compiledDock.indexOf('36px') < compiledDock.indexOf('24px'));
assert.ok(
  E.renderCanvas({ ...base, customCss: dockCss }).includes(dockSelector),
);
for (const args of [
  ['font-size', '20px; color: red'],
  ['color', 'url(https://bad.test)'],
  ['position', 'fixed'],
])
  assert.throws(() => E.applySelectionStyle('', dockSelector, ...args));
assert.throws(() => E.applySelectionStyle('', 'body', 'color', 'red'));
assert.throws(() => E.applySelectionStyle('h2{', dockSelector, 'color', 'red'));
const dockHistory = E.historyReducer(
  { current: base, past: [], future: [] },
  { type: 'edit', value: { ...base, customCss: dockCss } },
);
assert.deepEqual(E.historyReducer(dockHistory, { type: 'undo' }).current, base);
const area = { left: 220, top: 130, width: 800, height: 650 },
  screen = { width: 1440, height: 900 };
const below = E.placeSelectionDock(
  { left: 300, top: 200, width: 400, height: 100 },
  area,
  80,
  screen,
);
assert.equal(below.top, 312);
assert.equal(below.left, 230);
const above = E.placeSelectionDock(
  { left: 500, top: 650, width: 400, height: 80 },
  area,
  80,
  screen,
);
assert.equal(above.top, 558);
const giant = E.placeSelectionDock(
  { left: 220, top: 90, width: 800, height: 1500 },
  area,
  80,
  screen,
);
assert.ok(giant.top >= area.top && giant.top + 80 <= 780);
assert.equal(
  E.placeSelectionDock(
    { left: 300, top: -200, width: 400, height: 100 },
    area,
    80,
    screen,
  ),
  null,
);
const narrow = E.placeSelectionDock(
  { left: 240, top: 200, width: 200, height: 80 },
  { ...area, width: 280 },
  110,
  screen,
);
assert.equal(narrow.width, 260);
assert.ok(narrow.left + narrow.width <= 500);
console.log(
  'PASS: exact-element font styling, CSS preservation and validation, mobile cascade after desktop edits, undo, static serialization and dock placement below/above/clamped/offscreen/narrow.',
);

assert.ok(assistant.includes('Design conversation'));
assert.ok(assistant.includes('studio-composer-model'));
assert.ok(!assistant.includes('studio-reasoning-slider'));
assert.ok(E.renderReasoning().includes('studio-reasoning-slider'));
assert.ok(!assistant.includes('studio-css-effort'));
assert.deepEqual(
  E.parseCustomPages('[{"slug":"extra-page","title":"Extra page"}]'),
  [{ slug: 'extra-page', title: 'Extra page' }],
);
for (const registry of [
  '[{"slug":"api","title":"Bad"}]',
  '[{"slug":"workspace","title":"Bad"}]',
  '[{"slug":"../escape","title":"Bad"}]',
  '[{"slug":"x","title":""}]',
])
  assert.throws(() => E.parseCustomPages(registry));
const defaults = E.customDefaults(
  '[{"slug":"extra-page","title":"Extra page"}]',
);
assert.ok(E.validateLayout(JSON.parse(defaults['layout:extra-page'])));
const linked = {
  ...base,
  nodes: base.nodes.map((n) => ({
    ...n,
    linkTo: '/extra-page',
    linkLabel: 'Read the next page',
  })),
};
assert.ok(E.validateLayout(linked));
assert.ok(E.renderCanvas(linked).includes('href="/extra-page"'));
assert.ok(
  !E.validateLayout({
    ...base,
    nodes: base.nodes.map((n) => ({ ...n, linkTo: 'javascript:alert(1)' })),
  }),
);
const steps = [];
await E.preparePageSwitch(true, {
  inlineText: async (keep) => {
    steps.push('inline:' + keep);
    return true;
  },
  textDraft: async () => {
    steps.push('text');
    return true;
  },
  layout: async () => {
    steps.push('layout');
    return true;
  },
});
assert.deepEqual(steps, ['inline:true', 'text', 'layout']);
steps.length = 0;
await E.preparePageSwitch(false, {
  inlineText: async (keep) => {
    steps.push('inline:' + keep);
    return true;
  },
  textDraft: async () => {
    throw Error('Must not save discarded text');
  },
  layout: async () => {
    throw Error('Must not save discarded layout');
  },
});
assert.deepEqual(steps, ['inline:false']);
await assert.rejects(
  E.preparePageSwitch(true, {
    inlineText: async () => false,
    textDraft: async () => {
      throw Error('Must stop after failed inline save');
    },
    layout: async () => true,
  }),
  /text could not be saved/,
);
await assert.rejects(
  E.preparePageSwitch(true, {
    inlineText: async () => true,
    textDraft: async () => true,
    layout: async () => false,
  }),
  /layout could not be saved/,
);
console.log(
  'PASS: chat/slider rendering, custom page metadata, page link serialization and save/discard failure gating.',
);

assert.equal(E.normalizeHex('#1a3'), '#11AA33');
assert.equal(E.normalizeHex(' 347cf6 '), '#347CF6');
assert.equal(E.normalizeHex('#FFFFFF'), '#FFFFFF');
for (const invalid of [
  '',
  '#12',
  '#12345',
  '#12345678',
  'rgb(0,0,0)',
  'red',
  '#GGGGGG',
  '#fff;display:none',
]) {
  assert.equal(E.normalizeHex(invalid), null, 'Reject invalid hex: ' + invalid);
}
const colour = E.renderColour();
assert.ok(colour.includes('#11AA33'));
assert.ok(!colour.includes('type="color"'));
const assistantMarkup = E.renderAssistant();
assert.ok(E.renderReasoning().includes('studio-reasoning-dots'));
assert.equal((E.renderReasoning().match(/data-filled=/g) || []).length, 4);
assert.ok(
  assistantMarkup.indexOf('Design conversation') <
    assistantMarkup.indexOf('Page stylesheet'),
);
console.log(
  'PASS: hex normalization, invalid CSS rejection, hex control rendering and four reasoning markers.',
);

const compactDock = E.placeSelectionDock(
  { left: 400, top: 200, width: 400, height: 100 },
  area,
  110,
  screen,
  430,
);
assert.equal(compactDock.width, 430);
assert.equal(compactDock.left, 385);
const fittedDock = E.placeSelectionDock(
  { left: 240, top: 200, width: 180, height: 100 },
  { left: 220, top: 130, width: 260, height: 650 },
  150,
  screen,
  430,
);
assert.equal(fittedDock.width, 240);
assert.equal(fittedDock.left, 230);
assert.equal(
  E.selectedFont('"Times New Roman", serif').label,
  'Times New Roman',
);
assert.equal(E.selectedFont('Arial, Helvetica, sans-serif').label, 'Arial');
assert.equal(E.selectedFont('Unknown custom font'), undefined);
assert.equal(E.filterFonts('  TIMES new ').length, 1);
assert.equal(E.filterFonts('not-a-font').length, 0);
assert.ok(
  E.filterFonts('monospace').every((font) => font.category === 'Monospace'),
);
for (const font of E.studioFonts) {
  const css = E.applySelectionStyle(
    '',
    dockSelector,
    'font-family',
    font.value,
  );
  assert.equal(E.cssError(css), '');
  assert.ok(
    E.compileCustomCss(css, '[data-page-css="home"]').includes(font.value),
  );
}
console.log(
  'PASS: content-sized dock positioning, narrow-stage clamping, font search and all font stacks through CSS export.',
);

const composer = E.renderComposer();
assert.ok(composer.includes('studio-assistant-composer'));
assert.ok(composer.includes('aria-label="Send request"'));
assert.ok(!composer.includes('disabled=""'));
assert.ok(
  !composer.includes('studio-reasoning-slider'),
  'Reasoning stays in its closed popover',
);
assert.ok(E.renderComposer(false, false).includes('disabled=""'));
assert.ok(E.renderComposer(false, true, '  ').includes('disabled=""'));
assert.ok(E.renderComposer(true).includes('aria-label="Stop generating"'));
assert.ok(!E.renderComposer(true).includes('aria-label="Send request"'));
console.log(
  'PASS: compact composer, popover-only reasoning and send/unavailable/empty/stop states.',
);

const pagePreviewHtml = E.renderPageProposalPreview();
assert.ok(
  pagePreviewHtml.includes('&lt;script&gt;new headline&lt;/script&gt;'),
);
assert.ok(pagePreviewHtml.includes('New nested text'));
assert.ok(
  !pagePreviewHtml.includes('role="button"') &&
    !pagePreviewHtml.includes('tabindex'),
);
console.log(
  'PASS: page text preview includes nested fields, escapes text and disables editing.',
);

const originalFetch = globalThis.fetch;
try {
  let response,
    callCount = 0;
  globalThis.fetch = async (_url, options) => {
    callCount++;
    assert.equal(options.redirect, 'manual');
    assert.equal(
      new Headers(options.headers).get('Accept'),
      'application/json',
    );
    return response;
  };
  for (const [status, message] of [
    [200, /web page instead of JSON/],
    [403, /Access denied/],
    [404, /missing or routed/],
    [502, /working AI backend/],
    [504, /timed out/],
  ]) {
    response = new Response(
      '<!DOCTYPE html><body>private proxy details</body>',
      { status, headers: { 'Content-Type': 'text/html' } },
    );
    await assert.rejects(
      E.aiRequest('/api/ai/page'),
      (error) =>
        message.test(error.message) &&
        error.message.includes('HTTP ' + status) &&
        !error.message.includes('private proxy details'),
    );
  }
  response = new Response(null, {
    status: 302,
    headers: { Location: 'https://example.cloudflareaccess.com/login' },
  });
  await assert.rejects(
    E.aiRequest('/api/ai/css'),
    /sign in through Cloudflare Access/,
  );
  response = Response.json({ error: 'Worker is unavailable' }, { status: 503 });
  await assert.rejects(
    E.aiRequest('/api/ai/page'),
    /Worker is unavailable.*HTTP 503/,
  );
  response = new Response('<!DOCTYPE html>', {
    headers: { 'Content-Type': 'application/json' },
  });
  await assert.rejects(E.aiRequest('/api/ai/status'), /invalid JSON/);
  response = Response.json({ css: 'h1 { color: red; }' });
  assert.deepEqual(await E.aiRequest('/api/ai/css'), {
    css: 'h1 { color: red; }',
  });
  assert.equal(callCount, 9, 'Failures are not automatically retried');
  globalThis.fetch = async () => {
    throw new TypeError('Failed to fetch');
  };
  await assert.rejects(
    E.aiRequest('/api/ai/status'),
    /Could not reach the AI endpoint/,
  );
} finally {
  globalThis.fetch = originalFetch;
}
console.log(
  'PASS: AI HTML/login/proxy failures have safe actionable errors; valid JSON preserved and no automatic retries.',
);

assert.ok(E.renderAssistantActivity().includes('Thinking'));
assert.ok(E.renderAssistantActivity().includes('studio-ai-spinner'));
assert.ok(!E.renderAssistantActivity().includes('tool activities'));
const fetchBeforeStream = globalThis.fetch;
try {
  const encoder = new TextEncoder(),
    progressEvents = [];
  const wire =
    JSON.stringify({ type: 'progress', phase: 'thinking', state: 'running' }) +
    '\n' +
    JSON.stringify({ type: 'result', data: { kind: 'chat', reply: '你好' } }) +
    '\n';
  const bytes = encoder.encode(wire);
  globalThis.fetch = async () =>
    new Response(
      new ReadableStream({
        start(controller) {
          for (let i = 0; i < bytes.length; i += 7)
            controller.enqueue(bytes.slice(i, i + 7));
          controller.close();
        },
      }),
      { headers: { 'Content-Type': 'application/x-ndjson' } },
    );
  const chat = await E.aiRequest('/api/ai/page', {}, (event) =>
    progressEvents.push(event),
  );
  assert.equal(chat.reply, '你好');
  assert.equal(progressEvents[0].phase, 'thinking');
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        type: 'progress',
        phase: 'thinking',
        state: 'running',
      }) + '\n',
      { headers: { 'Content-Type': 'application/x-ndjson' } },
    );
  await assert.rejects(
    E.aiRequest('/api/ai/page', {}, () => {}),
    /before a complete response/,
  );
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({ type: 'error', error: 'Worker stopped' }) + '\n',
      { headers: { 'Content-Type': 'application/x-ndjson' } },
    );
  await assert.rejects(
    E.aiRequest('/api/ai/page', {}, () => {}),
    /Worker stopped/,
  );
} finally {
  globalThis.fetch = fetchBeforeStream;
}
console.log(
  'PASS: streaming Unicode replies, real progress events, interrupted/error streams, animated activity markup and no invented tool calls.',
);

const change = E.unifiedDiff(
  { 'styles.css': 'h1 {\n  color: red;\n}' },
  { 'styles.css': 'h1 {\n  color: blue;\n}' },
);
assert.equal(change.added, 1);
assert.equal(change.removed, 1);
assert.ok(change.lines.includes('-  color: red;'));
assert.ok(change.lines.includes('+  color: blue;'));
assert.ok(change.lines.includes('@@ -1,3 +1,3 @@'));
assert.deepEqual(E.unifiedDiff({ a: 'same' }, { a: 'same' }).lines, []);
assert.ok(E.unifiedDiff({}, { a: 'new' }).lines.includes('--- /dev/null'));
assert.ok(E.unifiedDiff({ a: 'old' }, {}).lines.includes('+++ /dev/null'));
assert.deepEqual(
  E.pageDiffFiles('home', E.emptyLayout, {
    headline: { value: 'Hello' },
    'wiki:engineering:title': { value: 'Other page' },
  })['text/wiki-engineering-title.txt'],
  undefined,
);
console.log(
  'PASS: unified changes show additions/removals, skip identical content and filter other pages.',
);

const imageComposer = E.renderComposer(false, true, '', true);
assert.ok(imageComposer.includes('alt="Screenshot.png"'));
assert.ok(imageComposer.includes('aria-label="Remove Screenshot.png"'));
assert.ok(
  !imageComposer.includes('disabled=""'),
  'An image-only message can be sent',
);
assert.ok(
  E.renderComposer(false, true, '', true, true).includes('disabled=""'),
  'Wait for uploads before sending',
);
const { mkdtemp, writeFile, readFile } = await import('node:fs/promises');
const { spawnSync } = await import('node:child_process');
const patchDir = await mkdtemp(path.join(root, 'work/diff-check-'));
await writeFile(path.join(patchDir, 'styles.css'), 'h1 {\n  color: red;\n}\n');
const patch =
  E.unifiedDiff(
    { 'styles.css': 'h1 {\n  color: red;\n}' },
    { 'styles.css': 'h1 {\n  color: blue;\n}', 'new.txt': 'New text' },
  ).lines.join('\n') + '\n';
await writeFile(path.join(patchDir, 'changes.diff'), patch);
assert.equal(
  spawnSync('git', ['init', '--quiet'], { cwd: patchDir }).status,
  0,
);
const applied = spawnSync(
  'git',
  ['-c', 'core.autocrlf=false', 'apply', 'changes.diff'],
  { cwd: patchDir, encoding: 'utf8' },
);
assert.equal(applied.status, 0, applied.stderr);
assert.equal(
  await readFile(path.join(patchDir, 'styles.css'), 'utf8'),
  'h1 {\n  color: blue;\n}\n',
);
assert.equal(
  await readFile(path.join(patchDir, 'new.txt'), 'utf8'),
  'New text\n',
);
console.log(
  'PASS: image-only send/upload gating and downloaded unified patch applies with Git.',
);

const savedUploadFetch = globalThis.fetch;
const savedXHR = globalThis.XMLHttpRequest;
let uploadDestination;
let uploadCount = 0;
class UploadXHR {
  upload = {};
  status = 200;
  responseText = JSON.stringify({
    url: '/api/media/test.png',
    type: 'image/png',
  });
  open(_method, destination) {
    uploadDestination = destination;
  }
  setRequestHeader() {}
  send() {
    uploadCount++;
    this.onload();
  }
}
try {
  globalThis.XMLHttpRequest = UploadXHR;
  globalThis.fetch = async (_url, options) => {
    assert.equal(
      options.redirect,
      'manual',
      'Never follow an expired Access session into cross-origin login',
    );
    return new Response(
      JSON.stringify({
        url: 'https://media.example.com/upload/test.png?ticket=test',
      }),
      { headers: { 'content-type': 'application/json' } },
    );
  };
  const imageFile = new File([new Uint8Array(20)], 'test.png', {
    type: 'image/png',
  });
  await E.uploadMedia(imageFile, () => {});
  assert.ok(uploadDestination.startsWith('https://media.example.com/upload/'));
  for (const status of [302, 401]) {
    globalThis.fetch = async () => new Response(null, { status });
    await assert.rejects(
      E.uploadMedia(imageFile, () => {}),
      /session expired/,
    );
  }
  globalThis.fetch = async () => ({ type: 'opaqueredirect', status: 0 });
  await assert.rejects(
    E.uploadMedia(imageFile, () => {}),
    /session expired/,
  );
  globalThis.fetch = async () =>
    new Response('<html>Login</html>', {
      headers: { 'content-type': 'text/html' },
    });
  await assert.rejects(
    E.uploadMedia(imageFile, () => {}),
    /proxy or login page/,
  );
  globalThis.fetch = async () => {
    throw new TypeError('Failed to fetch');
  };
  await assert.rejects(
    E.uploadMedia(imageFile, () => {}),
    /sign in through Cloudflare Access/,
  );
  assert.equal(
    uploadCount,
    1,
    'Authorization errors never start or retry the upload',
  );
} finally {
  globalThis.fetch = savedUploadFetch;
  globalThis.XMLHttpRequest = savedXHR;
}
console.log(
  'PASS: media upload preserves direct routing, intercepts expired-session redirects, and explains network/login failures without retrying.',
);

const frame = {
  ...E.newNode('frame', 'section'),
  layoutMode: 'free',
  minHeight: 400,
};
const childText = {
  ...E.newNode('child-text', 'text'),
  parentId: 'frame',
  body: 'Nested text',
  x: 10,
  y: 25,
  freeWidth: 40,
  freeHeight: 100,
};
const childButton = {
  ...E.newNode('child-button', 'button'),
  parentId: 'frame',
  linkTo: '/engineering',
  linkLabel: 'View research',
  x: 55,
  y: 30,
};
const nested = {
  ...E.emptyLayout,
  nodes: [frame, childText, childButton],
  order: ['frame', 'child-text', 'child-button'],
};
assert.ok(E.validateLayout(nested));
assert.deepEqual(E.hierarchyOrder(nested), nested.order);
assert.ok(
  !E.validateLayout({
    ...nested,
    nodes: [{ ...frame, parentId: 'frame' }, childText, childButton],
  }),
);
assert.ok(
  !E.validateLayout({
    ...nested,
    nodes: [frame, { ...childText, parentId: 'missing' }, childButton],
  }),
);
const nestedHtml = E.renderCanvas(nested);
assert.equal((nestedHtml.match(/data-layer-id="child-text"/g) || []).length, 1);
assert.ok(nestedHtml.includes('canvas-children-free'));
assert.ok(nestedHtml.includes('left:10%'));
assert.ok(nestedHtml.includes('href="/engineering"'));
assert.ok(nestedHtml.includes('View research'));
const hiddenFrame = E.patchNodes(nested, ['frame'], { hidden: true });
assert.ok(!E.renderCanvas(hiddenFrame).includes('Nested text'));
const lockedFrame = E.patchNodes(nested, ['frame'], { locked: true });
assert.ok(E.nodeLocked(lockedFrame, 'child-text'));
assert.deepEqual(
  E.patchNodes(lockedFrame, ['child-text'], { body: 'Blocked' }),
  lockedFrame,
);
let copyId = 0;
const nestedCopy = E.duplicateNodes(
  nested,
  ['frame'],
  () => `copy-${++copyId}`,
);
assert.ok(E.validateLayout(nestedCopy.layout));
assert.equal(
  nestedCopy.layout.nodes.filter((n) => n.parentId === 'copy-1').length,
  2,
);
assert.equal(E.removeNodes(nested, ['frame']).nodes.length, 0);
assert.deepEqual(E.freePlacement(childText, -100, -100), { x: 0, y: 0 });
assert.deepEqual(E.freePlacement(childText, 100, 0), { x: 60, y: 25 });
assert.deepEqual(E.freePlacement(childText, 100, 3000, true), {
  freeWidth: 90,
  freeHeight: 2000,
});
assert.ok(
  E.validHeader({
    ...E.defaultHeader,
    name: 'Imperial iGEM',
    logo: '/api/media/1234.png',
  }),
);
assert.ok(!E.validHeader({ ...E.defaultHeader, logo: 'javascript:alert(1)' }));
assert.ok(!E.validHeader({ ...E.defaultHeader, height: 9999 }));
const headerMarkup = E.renderHeader({
  ...E.defaultHeader,
  name: 'Imperial iGEM',
  logo: '/api/media/1234.png',
});
assert.ok(
  headerMarkup.includes('Imperial iGEM') &&
    headerMarkup.includes('/api/media/1234.png'),
);
console.log(
  'PASS: nested frames render once, buttons link, invalid/cyclic parents rejected, parent hiding/locking inherited, deep duplication/removal, free move/resize bounds, editable safe header.',
);

const previewData = Object.fromEntries(
  Object.entries({
    headline: 'Preview unsaved headline',
    'engineering:title': 'Preview engineering title',
    'engineering:summary': 'Generated page summary is visible',
    'site:header': JSON.stringify({ name: 'Preview project brand' }),
    'pages:custom': JSON.stringify([
      { slug: 'research-notes', title: 'Research notes' },
    ]),
  }).map(([id, value]) => [id, { value, version: 1, author: 'Editor' }]),
);
// The renderer needs the complete default field set, as supplied by Studio.
const { initial: previewDefaults } =
  await import('../selfhost-dist/server/shared.mjs');
const fullPreview = E.renderCompletePreview(
  {
    ...Object.fromEntries(
      Object.entries(previewDefaults).map(([id, value]) => [
        id,
        { value, version: 0, author: '' },
      ]),
    ),
    ...previewData,
  },
  'engineering',
);
for (const marker of [
  'wiki-hero',
  'Preview engineering title',
  'Generated page summary is visible',
  'article-toc',
  'engineering-cycle',
  'Preview project brand',
  'href="/research-notes"',
  'Sources &amp; related pages',
  '<footer',
])
  assert.ok(fullPreview.includes(marker), marker);
assert.ok(!fullPreview.includes('studio-workspace'));
assert.ok(!fullPreview.includes('Edit this page'));
assert.ok(E.renderPageHeaderEntry().includes('Header &amp; logo'));
assert.ok(!studio.includes('Shared across this project'));
const projectFetchOriginal = globalThis.fetch;
try {
  E.setApiProject('original-open-project');
  globalThis.fetch = async (url, options) => {
    assert.equal(
      new Headers(options.headers).get('X-Prion-Project'),
      'original-open-project',
    );
    assert.equal(
      new Headers(options.headers).get('Content-Type'),
      'application/json',
    );
    assert.equal(options.method, 'POST');
    return new Response('{}', {
      headers: { 'Content-Type': 'application/json' },
    });
  };
  await E.projectFetch('/api/content', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  await E.aiRequest('/api/ai/page', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
} finally {
  globalThis.fetch = projectFetchOriginal;
}
console.log(
  'PASS: complete preview includes generated hero/sidebar/footer and project navigation; header control is in Pages; saves and AI retain explicit project context.',
);

assert.equal(
  E.projectURL('/#wiki', false),
  '/?project=original-open-project#wiki',
);

assert.ok(!studio.includes('Edit page &amp; site text'));
assert.ok(!studio.includes('Page &amp; site text'));
const configurableHeader = {
  ...E.defaultHeader,
  name: 'Custom team',
  showLogo: false,
  layout: 'centered',
  navSize: 18,
  links: [
    {
      label: 'Our project',
      href: '/engineering',
      group: 'Research',
      hidden: false,
    },
    {
      label: 'Hidden link',
      href: '/description',
      group: 'Research',
      hidden: true,
    },
    { label: 'Welcome', href: '/', group: '', hidden: false },
  ],
};
assert.ok(E.validHeader(configurableHeader));
assert.ok(
  !E.validHeader({
    ...configurableHeader,
    links: [
      { label: 'Bad', href: 'javascript:alert(1)', group: '', hidden: false },
    ],
  }),
);
assert.ok(
  !E.validHeader({ ...configurableHeader, fontFamily: 'url(https://bad)' }),
);
assert.ok(!E.validHeader({ ...configurableHeader, navSize: 300 }));
const headerPreview = E.renderCompletePreview({
  ...Object.fromEntries(
    Object.entries(previewDefaults).map(([id, value]) => [
      id,
      { value, version: 0, author: '' },
    ]),
  ),
  'site:header': {
    value: JSON.stringify(configurableHeader),
    version: 1,
    author: '',
  },
});
assert.ok(headerPreview.includes('header-layout-centered'));
assert.ok(headerPreview.includes('Our project'));
assert.ok(headerPreview.includes('href="/engineering"'));
assert.ok(!headerPreview.includes('Hidden link'));
assert.ok(headerPreview.includes('--header-nav-size:18px'));
console.log(
  'PASS: removed text-field browser; custom header links, hidden items, layout and typography render; unsafe header settings are rejected.',
);

for (const href of [
  'https://example.org/research?q=1#details',
  'http://example.org',
  'mailto:team@example.org',
  'tel:+442012345678',
  '#details',
  '/engineering#details',
])
  assert.ok(E.safeLink(href), href);
for (const href of [
  'javascript:alert(1)',
  'data:text/html,test',
  '//example.org',
  'https://user:pass@example.org',
  'https://example.org/\\escape',
  'https://example.org/%0aBad',
  'file:///tmp/x',
])
  assert.ok(!E.safeLink(href), href);
assert.ok(E.linkAllowed('https://example.org', ['/']));
assert.ok(!E.linkAllowed('/missing', ['/']));
const external = E.newNode('external', 'button', 'Research');
external.linkTo = 'https://example.org/research';
const externalLayout = {
  ...E.emptyLayout,
  nodes: [external],
  order: ['external'],
};
assert.ok(E.validateLayout(externalLayout));
assert.match(
  E.renderCanvas(externalLayout),
  /href="https:\/\/example.org\/research"/,
);
const templateData = Object.fromEntries(
  Object.entries(E.templateDefaults('swiss')).map(([id, value]) => [
    id,
    { value, version: 1, author: '' },
  ]),
);
const original = E.renderCompletePreview(templateData);
const linkKey = original.match(/data-template-link="([^"]+)"/)[1];
const header = E.newNode('import-header-0', 'template', 'Header');
header.links = { [linkKey]: 'https://example.org/team' };
const headerLayout = { ...E.emptyLayout, nodes: [header], order: [header.id] };
assert.ok(E.validateLayout(headerLayout));
templateData['layout:home'].value = JSON.stringify(headerLayout);
assert.match(
  E.renderCompletePreview(templateData),
  /href="https:\/\/example.org\/team"/,
);
assert.ok(
  !E.validateLayout({
    ...headerLayout,
    nodes: [{ ...header, links: { [linkKey]: 'javascript:alert(1)' } }],
  }),
);
const remoteLinks = {
  ...headerLayout,
  nodes: [{ ...header, links: { [linkKey]: 'https://example.org/other' } }],
};
const localLinks = {
  ...headerLayout,
  nodes: [{ ...header, links: { [linkKey]: 'https://example.org/local' } }],
};
assert.ok(
  E.mergeLayouts(headerLayout, localLinks, remoteLinks).conflicts.length,
);
console.log(
  'PASS: external link schemes, unsafe destinations rejected, template anchor editing, publication rendering, and concurrent link conflict detection.',
);

const pollData = { headline: { value: 'Team', version: 2, author: 'A' } };
assert.equal(
  E.mergeContentRows(pollData, [{ id: 'headline', ...pollData.headline }]),
  pollData,
);
assert.equal(
  E.mergeContentRows(pollData, [
    { id: 'headline', value: 'Old', version: 1, author: 'B' },
  ]),
  pollData,
);
const nextPoll = E.mergeContentRows(pollData, [
  { id: 'headline', value: 'New', version: 3, author: 'B' },
]);
assert.notEqual(nextPoll, pollData);
assert.equal(nextPoll.headline.value, 'New');
assert.equal(pollData.headline.value, 'Team');
console.log(
  'PASS: unchanged polling retains canvas identity; fresh revisions merge without mutating existing state or accepting stale updates.',
);

// Element deletion stays within the selected fragment, preserves authored CSS and participates in undo.
const deletedCss = E.applySelectionStyle(
  '.keep { color: red; }',
  target.selector,
  'display',
  'none',
);
assert.match(deletedCss, /display: none !important/);
assert.match(deletedCss, /\.keep/);
assert.equal(E.cssError(deletedCss), '');
const deletionHistory = E.historyReducer(
  { past: [], current: base, future: [] },
  { type: 'edit', value: { ...base, customCss: deletedCss } },
);
assert.equal(
  E.historyReducer(deletionHistory, { type: 'undo' }).current.customCss,
  base.customCss,
);
console.log(
  'PASS: exact-element deletion CSS preserves unrelated rules and is undoable.',
);

const rotationCss = E.applySelectionStyle(
  'img { transform: scale(0.8); }',
  target.selector,
  'rotate',
  '30deg',
);
assert.match(rotationCss, /rotate: 30deg !important/);
assert.match(rotationCss, /transform: scale\(0.8\)/);
assert.equal(E.cssError(rotationCss), '');
const translatedCss = E.applySelectionStyle(
  rotationCss,
  target.selector,
  'translate',
  '40px -20px',
);
const mobileTranslation = E.applySelectionStyle(
  translatedCss,
  target.selector,
  'translate',
  '0px 8px',
  'mobile',
);
assert.match(mobileTranslation, /rotate: 30deg !important/);
assert.match(mobileTranslation, /transform: scale\(0.8\)/);
assert.match(mobileTranslation, /translate: 40px -20px !important/);
assert.match(mobileTranslation, /translate: 0px 8px !important/);
assert.equal(E.cssError(mobileTranslation), '');
assert.match(
  E.renderCanvas({ ...base, customCss: mobileTranslation }),
  /translate: 40px -20px/,
);
const selectionBefore = {
  'styles.css': '',
  'text/heading-text.txt': 'Before',
  'text/other.txt': 'Keep',
};
const selectionAfter = {
  ...selectionBefore,
  'styles.css': deletedCss,
  'text/heading-text.txt': 'After',
};
const unrelatedTarget = {
  ...target,
  fieldId: 'other',
  selector: '[data-layer-id="elsewhere"]',
};
assert.deepEqual(
  E.unifiedDiff(
    E.selectionDiffFiles(selectionBefore, unrelatedTarget),
    E.selectionDiffFiles(selectionAfter, unrelatedTarget),
  ).lines,
  [],
);
assert.ok(
  E.unifiedDiff(
    E.selectionDiffFiles(selectionBefore, target),
    E.selectionDiffFiles(selectionAfter, target),
  ).lines.length,
);
const identities = ['user-a/project-a', 'user-b/project-a', 'user-a/project-b'];
assert.equal(
  new Set(
    identities.map((id) =>
      E.assistantConversationKey(id, 'home', target.selector),
    ),
  ).size,
  3,
);
assert.notEqual(
  E.assistantConversationKey(identities[0], 'home', target.selector),
  E.assistantConversationKey(identities[0], 'home', unrelatedTarget.selector),
);
console.log(
  'PASS: rotation preserves transforms, changes are scoped to the selected element, and assistant histories are keyed by identity/project/page/selection.',
);
{
  // Live sync: a teammate's change is folded into undo history, not wiped out.
  const start = E.materialize(
    {
      ...E.emptyLayout,
      nodes: [E.newNode('a', 'text', 'A'), E.newNode('b', 'text', 'B')],
      order: ['a', 'b'],
    },
    [],
  );
  let h = { current: start, past: [], future: [] };
  h = E.historyReducer(h, {
    type: 'edit',
    value: E.patchNodes(start, ['a'], { span: 6 }),
  });
  const remote = E.patchNodes(start, ['b'], { background: '#abcdef' });
  h = E.historyReducer(h, { type: 'rebase', base: start, remote });
  assert.equal(h.current.nodes[0].span, 6);
  assert.equal(h.current.nodes[1].background, '#abcdef');
  h = E.historyReducer(h, { type: 'undo' });
  assert.equal(h.current.nodes[0].span, 12);
  assert.equal(h.current.nodes[1].background, '#abcdef');
  console.log(
    'PASS: live teammate updates rebase undo history without reverting their work.',
  );
}
{
  // Team pages created before the template layout move into its content
  // column once; an intro repeating the page title loses that duplicate.
  const old = {
    ...E.emptyLayout,
    nodes: [
      { ...E.newNode('custom-intro', 'text', 'Lab journal'), body: 'Kept.' },
      E.newNode('extra', 'image', 'Figure'),
    ],
    order: ['custom-intro', 'extra'],
  };
  const upgraded = E.materialize(old, [
    { id: 'custom-heading', label: 'Lab journal' },
    { id: 'custom-content', label: 'Page content' },
  ]);
  assert.ok(E.validateLayout(upgraded));
  const intro = upgraded.nodes.find((n) => n.id === 'custom-intro');
  assert.equal(intro.parentId, 'custom-content');
  assert.equal(intro.title, '');
  assert.equal(intro.body, 'Kept.');
  assert.equal(
    upgraded.nodes.find((n) => n.id === 'extra').parentId,
    'custom-content',
  );
  // Once upgraded, later layouts are left alone (sections may move out on purpose).
  const moved = E.patchNodes(upgraded, ['extra'], { parentId: undefined });
  assert.equal(
    E.materialize(moved, [
      { id: 'custom-heading', label: 'Lab journal' },
      { id: 'custom-content', label: 'Page content' },
    ]).nodes.find((n) => n.id === 'extra').parentId,
    undefined,
  );
  console.log(
    'PASS: team pages adopt the template content layout once, without duplicate titles.',
  );
}

// Sponsor pages use only their own saved content.
const sponsorData = Object.fromEntries(
  Object.entries(E.templateDefaults('regelerate')).map(([k, value]) => [
    k,
    { value, version: 0 },
  ]),
);
const sponsorSource = E.pageLayers(sponsorData, 'home').layers;
const sponsorLayout = E.materialize(E.emptyLayout, sponsorSource);
const sponsorParent = sponsorSource.find((l) => l.sponsorGrid).id;
const firstLogo = sponsorLayout.nodes.find(
  (n) =>
    n.parentId === sponsorParent &&
    sponsorSource.find((l) => l.id === n.id)?.sponsorSlot === 'grid',
);
firstLogo.hidden = true;
const addedLogo = {
  ...E.newNode('test-new-sponsor', 'image', 'New sponsor'),
  parentId: sponsorParent,
  src: 'https://example.org/new-sponsor.png',
  linkTo: 'https://example.org',
  alt: 'New sponsor',
};
sponsorLayout.nodes.push(addedLogo);
sponsorLayout.order.unshift(addedLogo.id);
sponsorData['layout:home'].value = JSON.stringify(sponsorLayout);
const beforeSync = JSON.stringify(sponsorData);
const independent = E.renderCompletePreview(sponsorData, 'sponsors');
assert.ok(!independent.includes('new-sponsor.png'));
const sponsorOwnLayers = E.pageLayers(sponsorData, 'sponsors').layers;
assert.ok(sponsorOwnLayers.every((layer) => !('syncedSponsors' in layer)));
assert.equal(
  JSON.stringify(sponsorData),
  beforeSync,
  'rendering must not rewrite saved content',
);
const deletedSponsors = E.removeNodes(sponsorLayout, [sponsorParent]);
assert.ok(E.validateLayout(deletedSponsors));
assert.ok(!E.hierarchyOrder(deletedSponsors).includes(sponsorParent));
const reopenedSponsors = E.materialize(
  JSON.parse(JSON.stringify(deletedSponsors)),
  sponsorSource,
);
assert.equal(
  reopenedSponsors.nodes.find((n) => n.id === sponsorParent).deleted,
  true,
);
sponsorData['layout:home'].value = JSON.stringify(reopenedSponsors);
assert.ok(
  !E.renderCompletePreview(sponsorData, 'home').includes('data-sponsor-grid='),
);
assert.equal(E.renderCompletePreview(sponsorData, 'sponsors'), independent);
const sponsorHistory = E.historyReducer(
  { current: sponsorLayout, past: [], future: [] },
  { type: 'edit', value: deletedSponsors },
);
assert.deepEqual(
  E.historyReducer(sponsorHistory, { type: 'undo' }).current,
  sponsorLayout,
);
const imageMarkup = E.renderCanvas({
  ...E.emptyLayout,
  nodes: [{ ...addedLogo, parentId: undefined }],
  order: ['test-new-sponsor'],
});
assert.match(imageMarkup, /media-image-original/);
assert.ok(!imageMarkup.includes('Open original file'));
console.log(
  'PASS: independent sponsor pages, persistent section deletion, Undo and compact image controls.',
);
const deletedTemplate = {
  ...E.emptyLayout,
  nodes: [{ ...E.newNode('intro', 'template'), hidden: true, deleted: true }],
  order: ['intro'],
};
assert.ok(
  !E.renderCanvas(deletedTemplate, true).includes('data-layer-id="intro"'),
);
assert.ok(
  E.renderCanvas(
    {
      ...deletedTemplate,
      nodes: [{ ...deletedTemplate.nodes[0], deleted: false }],
    },
    true,
  ).includes('data-layer-id="intro"'),
  'Hide remains available for editing',
);
assert.ok(
  !E.validateLayout({
    ...deletedTemplate,
    nodes: [{ ...deletedTemplate.nodes[0], deleted: 'yes' }],
  }),
);

const equationNode = {
  ...E.newNode('equation-test', 'equation'),
  body: String.raw`\frac{a}{b} + x^2`,
  caption: 'An equation',
};
const equationLayout = {
  ...E.emptyLayout,
  nodes: [equationNode],
  order: [equationNode.id],
};
assert.ok(E.validateLayout(equationLayout));
const equationMarkup = E.renderCanvas(equationLayout);
assert.match(equationMarkup, /<math/);
assert.match(equationMarkup, /<mfrac>/);
assert.match(equationMarkup, /<msup>/);
assert.ok(!equationMarkup.includes('Transcript / description'));
assert.ok(!equationMarkup.includes('Choose a file'));
for (const source of [
  String.raw`\[x^2\]`,
  '$$x^2$$',
  '$x^2$',
  String.raw`\begin{pmatrix} a & b \\ c & d \end{pmatrix}`,
])
  assert.equal(E.renderEquation(source).error, '');
assert.ok(E.renderEquation(String.raw`\frac{a}`).error);
assert.ok(
  !E.renderEquation(String.raw`\href{javascript:alert(1)}{x}`).html.includes(
    'href=',
  ),
);
assert.ok(E.renderEquation(String.raw`\def\a{\a}\a`).error);
assert.equal(E.renderEquation('').html, '');
console.log(
  'PASS: equations validate, render static MathML, handle delimiters and errors, and reject unsafe commands/macro loops.',
);

const inlineBody = String.raw`The value $x^2$ follows \(\frac{a}{b}\), with $$\sum_{i=1}^n x_i$$ below.`;
const inlineLayout = {
  ...E.emptyLayout,
  nodes: [{ ...E.newNode('inline-test', 'text'), body: inlineBody }],
  order: ['inline-test'],
};
const inlineHtml = E.renderCanvas(inlineLayout);
assert.equal((inlineHtml.match(/<math /g) || []).length, 3);
assert.match(inlineHtml, /text-math-inline/);
assert.match(inlineHtml, /text-math-display/);
assert.match(inlineHtml, /The value/);
assert.equal(inlineLayout.nodes[0].body, inlineBody);
for (const text of [
  'Prices $5 and $10',
  String.raw`Escaped \$x\$`,
  '`$x$`',
  '$unfinished',
]) {
  assert.ok(
    E.splitMathText(text).every((part) => part.source === undefined),
    text,
  );
  assert.equal(
    E.splitMathText(text)
      .map((part) => part.text)
      .join(''),
    text,
  );
}
assert.ok(
  E.renderCanvas({
    ...inlineLayout,
    nodes: [
      { ...inlineLayout.nodes[0], body: String.raw`Bad $\frac{a}$ formula` },
    ],
  }).includes('inline-math-error'),
);
console.log(
  'PASS: inline/display math renders in prose while preserving source, prices, escapes, code and incomplete expressions.',
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

const customHtml = {
  ...E.newNode('custom-code', 'html'),
  html: '<button id="play">Play</button>',
  css: 'button { color:blue; }',
  javascript: 'document.querySelector("button").onclick = () => {};',
  minHeight: 360,
};
const customLayout = {
  ...E.emptyLayout,
  nodes: [customHtml],
  order: [customHtml.id],
};
assert.ok(E.validateLayout(customLayout));
assert.equal(
  E.validateLayout({
    ...customLayout,
    nodes: [{ ...customHtml, javascript: { run: true } }],
  }),
  false,
);
assert.equal(
  E.validateLayout({
    ...customLayout,
    nodes: [{ ...customHtml, kind: 'text' }],
  }),
  false,
);
const configuredEmbed = 'https://video.igem.org/videos/embed/example-id?title=0&warningTitle=0&start=3s&loop=1#t=3';
assert.equal(E.embedURL(configuredEmbed), configuredEmbed);
assert.equal(E.embedURL('https://www.youtube.com/embed/abc?controls=0&start=4'), 'https://www.youtube-nocookie.com/embed/abc?controls=0&start=4');
assert.equal(E.embedURL('https://player.vimeo.com/video/123?h=abc&title=0'), 'https://player.vimeo.com/video/123?h=abc&title=0');
for (const invalid of ['https://video.igem.org.evil.test/videos/embed/id', 'https://user:password@video.igem.org/videos/embed/id', 'https://video.igem.org:444/videos/embed/id', 'javascript:alert(1)', 'https://video.igem.org/videos/watch/id']) assert.equal(E.embedURL(invalid), null);
for (const editing of [true, false]) {
 const markup = E.renderCanvas({ ...E.emptyLayout, nodes: [{...E.newNode('embed-options','embed'), src:configuredEmbed}], order:['embed-options'] }, editing);
 assert.ok(markup.includes(configuredEmbed.replaceAll('&', '&amp;')));
}
const htmlVideo = E.htmlDocument({ html: '<iframe src="'+configuredEmbed+'" allow="autoplay; fullscreen; picture-in-picture"></iframe><video src="https://static.igem.wiki/test/movie.webm" controls muted loop></video>' });
assert.ok(htmlVideo.includes('src="'+configuredEmbed+'"'));
assert.ok(htmlVideo.includes('frame-src https://video.igem.org/videos/embed/'));
assert.ok(htmlVideo.includes("connect-src 'none'"));
assert.ok(htmlVideo.includes("script-src 'unsafe-inline'"));
assert.ok(htmlVideo.includes('controls muted loop'));
const customMarkup = E.renderCanvas(customLayout);
assert.match(customMarkup, /sandbox="allow-scripts allow-same-origin allow-presentation"/);
assert.doesNotMatch(customMarkup, /srcDoc=/i);
assert.ok(E.htmlFrameURL(htmlVideo, 'https://wiki.example/team/').startsWith('data:text/html;charset=utf-8,'));
assert.ok(!decodeURIComponent(E.htmlFrameURL(htmlVideo, 'https://wiki.example/mcp/preview?key=PRIVATE_KEY#SECRET')).includes('PRIVATE_KEY'));
assert.ok(!decodeURIComponent(E.htmlFrameURL(htmlVideo, 'https://wiki.example/mcp/preview?key=PRIVATE_KEY#SECRET')).includes('SECRET'));
assert.ok(decodeURIComponent(E.htmlFrameURL(htmlVideo, 'https://wiki.example/team/').split(',').slice(1).join(',')).includes('<base href="https://wiki.example/team/">'));
assert.match(customMarkup, /data-html-document=/);
assert.ok(
  !customMarkup.includes('<button id="play">'),
  'User markup must stay escaped inside srcdoc',
);
assert.match(customMarkup, /height:360px/);
assert.doesNotMatch(customMarkup, /data-html-interaction-control|data-html-editing/);
const editingHtmlMarkup = E.renderCanvas(customLayout, true);
assert.doesNotMatch(editingHtmlMarkup, /studio-html-interact|Done interacting|data-html-interaction-control/);
const interactiveHtmlMarkup = E.renderCanvas(customLayout, true, customHtml.id, [customHtml.id]);
assert.doesNotMatch(interactiveHtmlMarkup, /data-html-editing|tabIndex="-1"|data-html-interaction-control/i);
assert.match(E.renderCanvas(customLayout, true, customHtml.id, []), /data-html-editing="true"/);
assert.match(editingHtmlMarkup, /data-html-editing="true"/);
assert.match(editingHtmlMarkup, /tabIndex="-1"/i);
console.log(
  'PASS: Custom HTML schema, opaque sandbox, escaped source and editor sizing.',
);

const { exportMedia: collectSnippetMedia } = await import('./export-media.mjs');
const snippetMedia = collectSnippetMedia({
  'layout:home': JSON.stringify({
    ...customLayout,
    nodes: [
      {
        ...customHtml,
        html: '<img src="/api/media/abcdef.png">',
        css: 'div{background:url(/api/media/123abc.jpg)}',
      },
    ],
  }),
});
assert.ok(snippetMedia.has('/api/media/abcdef.png'));
assert.ok(snippetMedia.has('/api/media/123abc.jpg'));

assert.ok(
  !collectSnippetMedia({
    'layout:home': JSON.stringify({
      ...customLayout,
      nodes: [
        { ...customHtml, html: '<img src="/templates/../../private.png">' },
      ],
    }),
  }).has('/templates/../../private.png'),
);

// Subsection elements remain ordinary canvas nodes scoped to a stable item id.
const collapsible = { ...E.newNode('faq-content','accordion'), items: [{id:'first-item',title:'First',body:'Legacy text'}, {id:'second-item',title:'Second',body:''}] };
const initialAccordion = { ...E.emptyLayout, nodes:[collapsible], order:[collapsible.id] };
let nestedAccordion = E.insertNode(initialAccordion,{...E.newNode('faq-image','image'),src:'https://example.org/photo.png'}, {inside:collapsible.id,insideItem:'first-item'});
nestedAccordion = E.insertNode(nestedAccordion,{...E.newNode('faq-equation','equation'),body:'x^2'}, {inside:collapsible.id,insideItem:'second-item'});
nestedAccordion = E.insertNode(nestedAccordion,{...E.newNode('faq-frame','section'),layoutMode:'flow'}, {inside:collapsible.id,insideItem:'first-item'});
nestedAccordion = E.insertNode(nestedAccordion,{...E.newNode('faq-text','text'),body:'Nested frame text'}, {inside:'faq-frame'});
assert.equal(E.validateLayout(nestedAccordion),true);
assert.deepEqual(initialAccordion.nodes,[collapsible]);
assert.throws(()=>E.insertNode(initialAccordion,E.newNode('bad','image'),{inside:collapsible.id}),/Choose a subsection/);
assert.throws(()=>E.insertNode(initialAccordion,E.newNode('bad','image'),{inside:collapsible.id,insideItem:'missing'}),/Choose a subsection/);
assert.equal(E.validateLayout({...nestedAccordion,nodes:nestedAccordion.nodes.map(n=>n.id==='faq-image'?{...n,parentItemId:'missing'}:n)}),false);
assert.equal(E.validateLayout({...nestedAccordion,nodes:nestedAccordion.nodes.map(n=>n.id==='faq-image'?{...n,parentItemId:undefined}:n)}),false);
assert.equal(E.validateLayout({...nestedAccordion,nodes:nestedAccordion.nodes.map(n=>n.id==='faq-text'?{...n,parentItemId:'first-item'}:n)}),false);
assert.equal(E.validateLayout({...E.emptyLayout,nodes:[null]}),false);
for(const editing of [false,true]) {
 const html = E.renderCanvas(nestedAccordion,editing);
 const first = html.slice(html.indexOf('data-item-id="first-item"'),html.indexOf('data-item-id="second-item"'));
 assert.match(first,/data-layer-id="faq-image"/);
 assert.match(first,/data-layer-id="faq-text"/);
 assert.match(first,/Legacy text/);
 assert.doesNotMatch(first,/data-layer-id="faq-equation"/);
 assert.equal(html.split('data-layer-id="faq-image"').length-1,1);
}
const switchedItems = E.patchNodes(nestedAccordion,[collapsible.id],{items:[...collapsible.items].reverse()});
assert.equal(E.validateLayout(switchedItems),true);
assert.equal(switchedItems.nodes.find(n=>n.id==='faq-image').parentItemId,'first-item');
assert.deepEqual(E.layerTreeRows(switchedItems,[]).filter(r=>r.type==='layer').map(r=>r.id),E.hierarchyOrder(switchedItems));
const rows=E.layerTreeRows(switchedItems,[]);
assert.equal(rows.findIndex(r=>r.id==='faq-equation'),rows.findIndex(r=>r.type==='item' && r.item.id==='second-item')+1);
assert.deepEqual(E.layerTreeRows(switchedItems,[collapsible.id]),[{id:collapsible.id,type:'layer',depth:0}]);
const removedItem = E.patchNodes(nestedAccordion,[collapsible.id],{items:[collapsible.items[1]]});
assert.equal(E.validateLayout(removedItem),true);
assert.deepEqual(removedItem.nodes.map(n=>n.id),[collapsible.id,'faq-equation']);
const lockedNested = E.patchNodes(nestedAccordion,['faq-text'],{locked:true});
assert.equal(E.patchNodes(lockedNested,[collapsible.id],{items:[]}),lockedNested);
assert.throws(()=>E.insertNode(E.patchNodes(initialAccordion,[collapsible.id],{locked:true}),E.newNode('blocked','image'),{inside:collapsible.id,insideItem:'first-item'}),/Unlock/);
let copyNumber=0;
const copiedAccordion=E.duplicateNodes(nestedAccordion,[collapsible.id],()=> 'copy-'+(++copyNumber));
assert.equal(E.validateLayout(copiedAccordion.layout),true);
assert.equal(copiedAccordion.layout.nodes.find(n=>n.id==='copy-2').parentItemId,'first-item');
assert.deepEqual(E.moveBefore(nestedAccordion,['faq-image'],'faq-equation'),nestedAccordion,'Cannot reorder across subsection boundaries');
console.log('PASS: subsection insertion, nested rendering in editor/publication, stable item ordering, layer hierarchy, invalid slots, deletion, locks and deep duplication.');

// Uploaded HTML images use permanent references, not encoded bytes or extra nodes.
const imageSnippet = E.insertHtmlImage('<div></div>', '/api/media/abcdef-1234.png', 'A "quoted" <diagram> & detail', 5, 5);
assert.ok(imageSnippet.html.startsWith('<div>\n<img'));
assert.ok(imageSnippet.html.endsWith('\n</div>'));
assert.ok(imageSnippet.html.includes('alt="A &quot;quoted&quot; &lt;diagram&gt; &amp; detail"'));
assert.ok(!imageSnippet.html.includes('base64'));
assert.ok(imageSnippet.html.length < 250);
assert.throws(() => E.insertHtmlImage('', 'javascript:alert(1)', ''), /permanent image URL/);
assert.throws(() => E.insertHtmlImage('', 'data:image/png;base64,AAAA', ''), /permanent image URL/);
const localImageDocument = decodeURIComponent(E.htmlFrameURL(E.htmlDocument({html:imageSnippet.html}), 'http://127.0.0.1:4198/studio?private=secret').split(',').slice(1).join(','));
assert.ok(localImageDocument.includes('img-src https: data: http://127.0.0.1:4198;'));
assert.ok(!localImageDocument.includes('private=secret'));
assert.ok(localImageDocument.includes("connect-src 'none'"));
console.log('PASS: custom HTML image insertion, attribute escaping, URL validation and same-origin local preview.');

const privateImages = E.localHtmlImages('<img src="/api/media/abcd.png"><img src="https://editor.example/api/media/abc1.jpg"><img src="https://other.example/api/media/abc2.jpg"><img src="https://static.igem.wiki/photo.jpg">', 'https://editor.example/page');
assert.equal(privateImages.size, 2);
assert.equal(privateImages.get('/api/media/abcd.png'), 'https://editor.example/api/media/abcd.png');
assert.ok(!privateImages.has('https://other.example/api/media/abc2.jpg'));
console.log('PASS: authenticated HTML image resolution is restricted to the current editor origin.');

// Header identity must survive inline-style serialization and template changes.
{
const siteHeader = {...E.newNode('site-header', 'section'), name:'Site header', padding:3};
assert.equal(E.isSiteHeader(siteHeader, [siteHeader]), true);
assert.equal(E.isSiteHeader({...siteHeader, name:'Renamed', padding:24, siteRole:'header'}, []), true);
assert.equal(E.isSiteHeader({...siteHeader, name:'Ordinary card'}, []), false);
assert.equal(E.isSiteHeader({...siteHeader, name:'Legacy', paddingX:3}, [{...E.newNode('home-link','button'),parentId:'site-header',linkTo:'/'}]), true);
const legacyHeaderCss = `[data-layer-kind="section"][style*="padding-inline: 3px"]{grid-column:1/-1!important}@media(max-width:700px){:is([style*='padding-inline:3px'],[style*="padding-inline: 3px"]){width:100%}}.other[style*="padding-inline:30px"]{content:'padding-inline: 3px'}`;
const normalizedHeaderCss = E.normalizeHeaderCss(legacyHeaderCss);
assert.ok(normalizedHeaderCss.includes('[data-site-header]'));
assert.ok(!normalizedHeaderCss.includes('[style*="padding-inline: 3px"]'));
assert.ok(normalizedHeaderCss.includes('[style*="padding-inline:30px"]'));
assert.ok(normalizedHeaderCss.includes("content:'padding-inline: 3px'"));
const headerLayout = {...E.emptyLayout,nodes:[siteHeader],order:[siteHeader.id],customCss:legacyHeaderCss};
assert.equal(E.validateLayout(headerLayout), true);
for(const editing of [false,true]) {
 const markup=E.renderCanvas(headerLayout,editing);
 assert.ok(markup.includes('data-site-header="true"'));
 assert.ok(!markup.includes('[style*="padding-inline: 3px"]'));
}
const restyledHeaderMarkup=E.renderTemplateAppearance(headerLayout,'regelerate','luca');
assert.ok(restyledHeaderMarkup.includes('data-site-header="true"'));
assert.ok(!restyledHeaderMarkup.includes('[style*="padding-inline: 3px"]'));
console.log('PASS: stable header markers and legacy CSS work in editor, export and restyled projects.');

}

{
 const routes={'/':'/imperial-college/','/results':'/imperial-college/results/'};
 assert.equal(E.htmlLinkDestination('/results#figure', 'https://2026.igem.wiki/imperial-college/',routes),'/imperial-college/results/#figure');
 assert.equal(E.htmlLinkDestination('#references','https://wiki.example/results'),'/results#references');
 assert.equal(E.htmlLinkDestination('https://example.com/paper','https://wiki.example/'),'https://example.com/paper');
 assert.equal(E.htmlLinkDestination('mailto:team@example.com','https://wiki.example/'),'mailto:team@example.com');
 for(const url of ['javascript:alert(1)','data:text/html,hello','file:///secret','https://user:password@example.com','blob:https://wiki.example/id',''])assert.equal(E.htmlLinkDestination(url,'https://wiki.example/'),null);
 const doc=E.htmlDocument({html:'<a href="/results">Results</a>'});
 assert.ok(doc.includes('custom-html-link'));
 assert.ok(doc.includes('e.isTrusted'));
 console.log('PASS: custom HTML links preserve page routes and reject executable/credential URLs without relaxing the iframe sandbox.');
}

{
 const {runInNewContext}=await import('node:vm');
 let click,scrolled=false;const messages=[];
 const document={addEventListener:(type,fn)=>{if(type==='click')click=fn},getElementById:id=>id==='inside'?{scrollIntoView:()=>{scrolled=true}}:null,getElementsByName:()=>[]};
 const source=E.htmlDocument({html:'<a href="/results">Results</a>'}).match(/<script>([\s\S]*?)<\/script>/)[1];
 runInNewContext(source,{document,parent:{postMessage:m=>messages.push(m)},addEventListener:()=>{}});
 const event=(href,extra={})=>({isTrusted:true,button:0,defaultPrevented:false,target:{closest:()=>({getAttribute:()=>href,target:''})},preventDefault(){this.defaultPrevented=true},...extra});
 click(event('/results',{isTrusted:false}));assert.equal(messages.length,0);
 click(event('/results',{defaultPrevented:true}));assert.equal(messages.length,0);
 click(event('#inside'));assert.equal(scrolled,true);assert.equal(messages.length,0);
 click(event('#outside'));assert.equal(messages.pop().href,'#outside');
 click(event('/results'));assert.equal(messages.pop().href,'/results');
 click(event('/results',{ctrlKey:true}));assert.equal(messages.pop().newTab,true);
 click(event('javascript:alert(1)'));assert.equal(messages.length,0);
 console.log('PASS: frame link clicks respect local anchors, parent anchors, modified clicks, cancelled events and trusted activation.');
}

// Exact text box widths survive publication and responsive CSS compilation.
const textSelector = '[data-layer-id="text-width"] > div:nth-of-type(1) > div:nth-of-type(1)';
let widthCss = '.unrelated { color: red; }';
for (const [property, value] of Object.entries({width:'717px','max-width':'100%','box-sizing':'border-box'}))
  widthCss = E.applySelectionStyle(widthCss, textSelector, property, value);
assert.match(widthCss, /width: 717px/);
assert.match(widthCss, /max-width: 100%/);
assert.match(widthCss, /box-sizing: border-box/);
assert.match(widthCss, /unrelated/);
assert.doesNotMatch(widthCss, /font-size|grid-column/);
const widthLayout={...E.emptyLayout,nodes:[{...E.newNode('text-width','text','Heading'),body:'Text wraps within its own box.'}],order:['text-width'],customCss:widthCss};
for(const editing of [true,false]) {
 const markup=E.renderCanvas(widthLayout,editing);
 assert.match(markup,/width: 717px/);
 assert.match(markup,/max-width: 100%/);
 assert.match(markup,/Text wraps within its own box/);
}
const mobileWidth=E.applySelectionStyle(widthCss,textSelector,'width','240px','mobile');
assert.match(mobileWidth,/@media \(max-width: 760px\)/);
assert.match(mobileWidth,/width: 717px/);
// Live Education regression: a more specific authored !important cap defeated
// the saved resize while inline drag styles appeared to work. Manual rules
// occupy a priority layer in both renderers, without changing authored CSS.
const cappedCss = '[data-layer-id="parent"].canvas-section.canvas-section .media-text .custom-text {max-width:78ch !important}' + mobileWidth;
for (const editing of [true, false]) {
  const compiled = E.compileCustomCss(cappedCss, '[data-page-css="home"]', editing);
  assert.match(compiled, /@layer studio-selection/);
  assert.match(compiled, /max-width:78ch !important/);
  assert.match(compiled, /max-width: 100% !important/);
  assert.match(compiled, editing ? /@container studioPage/ : /@media/);
}
assert.doesNotMatch(E.compileCustomCss('.ordinary {color:red!important}'), /@layer/);
console.log('PASS: exact text width preserves section geometry, other CSS and font settings in editor/publication, with responsive overrides.');

// Separate pictures inside text survive validation, rendering, stacking and undo.
const prose = {...E.newNode('prose','text','Research'), body:'Keep this writing.'};
let pictures = {...E.emptyLayout, nodes:[prose], order:[prose.id]};
for (const id of ['photo-one','photo-two']) pictures=E.insertNode(pictures,{...E.newNode(id,'image'),src:`https://example.org/${id}.png`,parentId:prose.id},{inside:prose.id});
assert.equal(E.validateLayout(pictures),true);
assert.deepEqual(pictures.nodes[0],prose);
assert.equal(pictures.nodes.filter(n=>n.kind==='image').length,2);
const front=E.stackNode(pictures,'photo-one','front');
assert.equal(front.nodes[1].zIndex,1);
assert.deepEqual(front.order,pictures.order);
assert.deepEqual(front.nodes[2],pictures.nodes[2]);
const back=E.stackNode(front,'photo-one','back');
assert.equal(back.nodes[1].zIndex,-1);
const lockedPictures=E.patchNodes(back,[prose.id],{locked:true});
assert.equal(E.stackNode(lockedPictures,'photo-one','front'),lockedPictures);
assert.throws(()=>E.insertNode(lockedPictures,E.newNode('extra','image'),{inside:prose.id}),/Unlock/);
assert.equal(E.validateLayout({...back,nodes:back.nodes.map(n=>n.id==='photo-one'?{...n,zIndex:0.5}:n)}),false);
for(const editing of [true,false]) {
 const html=E.renderCanvas(back,editing);
 assert.match(html,/Keep this writing/);
 assert.match(html,/photo-one.png/);
 assert.match(html,/photo-two.png/);
 assert.match(html,/z-index:-1/);
}
console.log('PASS: independent images inside text preserve content and reading order; stacking renders in editor/publication and respects ancestor locks.');

// Layer search retains ancestry, disambiguates titles and filters by kind.
const searchLayout={...E.emptyLayout,nodes:[{...E.newNode('parent','section'),name:'Research'}, {...E.newNode('child','text','Hampton workshop'),name:'Hampton School',parentId:'parent'}, {...E.newNode('pic','image'),name:'Hampton photo',parentId:'parent'}, {...E.newNode('other','text'),name:'Other'}],order:['parent','child','pic','other']};
assert.equal(E.filterLayerIds(searchLayout,'','all'),null);
assert.deepEqual([...E.filterLayerIds(searchLayout,'hampton','text')],['parent','child']);
assert.deepEqual([...E.filterLayerIds(searchLayout,'photo','all')],['parent','pic']);
assert.equal(E.filterLayerIds(searchLayout,'missing','all').size,0);
assert.deepEqual(E.layerBreadcrumb(searchLayout,'child').map(n=>n.id),['parent','child']);
console.log('PASS: layer search and type filters retain parent context without unrelated siblings.');
