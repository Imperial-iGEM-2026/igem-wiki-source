import assert from 'node:assert/strict';
import { build } from 'vite';
import { common, root } from './build-options.mjs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
await build({ ...common, build: {
  ssr: path.join(root, 'app/custom-css.ts'),
  outDir: path.join(root, 'work/css-serialization-unit'), emptyOutDir: true,
  rollupOptions: { output: { entryFileNames: 'test.mjs' } },
}});
const E = await import(pathToFileURL(path.join(root, 'work/css-serialization-unit/test.mjs')));
// Client CSSOM adds spaces after colons; SSR inline styles do not. Frame
// selectors must behave identically, especially exclusions that select grids.
for (const editor of [false, true]) {
  const legacy = E.compileCustomCss(
    '[data-layer-kind="section"]:not([style*="padding-inline: 4px"]) > .canvas-children {display:grid!important}' +
      '[style*="padding-inline:5px"]{display:block}' +
      '[style*="--node-color"]{color:red}' +
      '[style*="padding: 4px; color: red"]{color:blue}',
    '[data-page-css="results"]', editor,
  );
  assert.ok(legacy.includes(':not(:is([style*="padding-inline: 4px"],[style*="padding-inline:4px"]))'));
  assert.ok(legacy.includes(':is([style*="padding-inline:5px"],[style*="padding-inline: 5px"])'));
  assert.ok(legacy.includes('[style*="--node-color"]'));
  assert.ok(legacy.includes('[style*="padding: 4px; color: red"]'));
}
for (const editor of [false, true]) {
  const image = '[data-layer-id="figure"] > div:nth-of-type(1) > div:nth-of-type(1) > img:nth-of-type(1)';
  const declarations = '{width:558px!important;translate:209px 0px!important}';
  const generated = E.compileCustomCss('/* prion-selection-controls */' + image + declarations, '[data-page-css]', editor);
  assert.match(generated, /width:min\(558px, 100%\)/);
  assert.match(generated, /translate:clamp\(0px, calc\(100cqw - 558px\), 209px\) 0px/);
  assert.match(generated, /container-type:\s*inline-size !important/);
  assert.ok(!E.compileCustomCss(image + declarations).includes('container-type'), 'authored image CSS is not rewritten');
  assert.ok(!E.compileCustomCss('/* prion-selection-controls */' + image + '{width:558px;translate:-20px}').includes('container-type'), 'intentional negative crops are preserved');
}
console.log('PASS: editor/export inline-style selectors agree, including :not(); generated image placements fit their frames without rewriting authored CSS.');
