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
const customMarkup = E.renderCanvas(customLayout);
assert.match(customMarkup, /sandbox="allow-scripts"/);
assert.doesNotMatch(customMarkup, /allow-same-origin/);
assert.match(customMarkup, /srcDoc=/i);
assert.ok(
  !customMarkup.includes('<button id="play">'),
  'User markup must stay escaped inside srcdoc',
);
assert.match(customMarkup, /height:360px/);
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
