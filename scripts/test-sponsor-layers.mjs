import assert from 'node:assert/strict';
import { build } from 'vite';
import { common, root } from './build-options.mjs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { exportMedia } from './export-media.mjs';
await build({
  ...common,
  build: {
    ssr: path.join(root, 'scripts/studio-test-entry.tsx'),
    outDir: path.join(root, 'work/sponsor-test'),
    emptyOutDir: true,
    rolldownOptions: { output: { entryFileNames: 'test.mjs' } },
  },
});
const E = await import(
  pathToFileURL(path.join(root, 'work/sponsor-test/test.mjs'))
);
const blocks = (values) =>
  Object.fromEntries(
    Object.entries(values).map(([id, value]) => [
      id,
      { value, version: 1, author: '' },
    ]),
  );
for (const template of [
  'regelerate',
  'notebook-purple',
  'notebook-white',
  'swiss',
]) {
  if (!E.templates[template]) continue;
  for (const page of ['home', 'sponsors']) {
    const values = E.templateDefaults(template);
    const layers = E.pageLayers(blocks(values), page).layers;
    const logos = layers.filter((l) => l.sponsorSlot);
    if (!logos.length) continue;
    assert.equal(
      logos.length,
      20,
      `${template}/${page}: expose all supporter and sponsor logos`,
    );
    const section = layers.find((l) => l.sponsorGrid);
    const added = {
      ...E.newNode('added-logo', 'image'),
      parentId: section.id,
      src: '/api/media/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.png',
      alt: 'Added sponsor regression',
      x: 76,
      y: 380,
      freeWidth: 32,
      freeHeight: 160,
    };
    const original = {
      ...E.emptyLayout,
      nodes: [
        { ...E.newNode(section.id, 'template'), layoutMode: 'free' },
        added,
      ],
      order: [section.id, added.id],
    };
    const layout = E.materialize(original, layers);
    assert.ok(E.validateLayout(layout));
    assert.equal(
      layout.nodes.find((n) => n.id === logos[5].id).src,
      logos[5].defaults.src,
    );
    assert.equal(
      layout.nodes.find((n) => n.id === logos[5].id).linkTo,
      logos[5].defaults.linkTo,
    );
    assert.ok(
      layout.order.indexOf(added.id) > layout.order.indexOf(logos.at(-1).id),
    );
    values['layout:' + page] = JSON.stringify(layout);
    let html = E.renderCompletePreview(blocks(values), page);
    assert.equal(
      (html.match(/<img[^>]*alt="Added sponsor regression"/g) || []).length,
      1,
    );
    assert.ok(
      html.indexOf('data-sponsor-grid=') <
        html.indexOf('alt="Added sponsor regression"'),
    );
    const wrapper = html.match(
      /<(?:div|a)[^>]*data-layer-id="added-logo"[^>]*>/,
    )?.[0];
    assert.ok(wrapper);
    assert.doesNotMatch(
      wrapper,
      /position:absolute|left:76%|width:32%|data-free-child/,
    );
    assert.doesNotMatch(html, /data-builtin-info/);
    // Hide/remove, replacement, duplication and ordering must survive materialization.
    const deleted = E.removeNodes(layout, [logos[5].id]);
    assert.equal(
      E.materialize(deleted, layers).nodes.find((n) => n.id === logos[5].id)
        .hidden,
      true,
    );
    const replaced = E.patchNodes(deleted, [logos[6].id], {
      src: added.src,
      alt: 'Replacement regression',
      linkTo: 'https://example.org/sponsor',
    });
    values['layout:' + page] = JSON.stringify(replaced);
    html = E.renderCompletePreview(blocks(values), page);
    assert.doesNotMatch(html, /<img[^>]*alt="Benchling"/);
    assert.match(html, /<img[^>]*alt="Replacement regression"/);
    assert.match(html, /href="https:\/\/example.org\/sponsor"/);
    const isolatedTemplate = {
      ...E.templates[template],
      pages: E.templates[template].pages.filter((p) => p.slug === page),
    };
    const refs = exportMedia(values, isolatedTemplate, E.sponsorLayers);
    assert.ok(!refs.has(logos[5].defaults.src));
    assert.ok(!refs.has(logos[6].defaults.src));
    assert.ok(refs.has(added.src));
    const linkEdited = E.patchNodes(layout, [logos[5].id], {
      links: { [logos[5].linkPath]: 'https://example.org/edited-link' },
    });
    values['layout:' + page] = JSON.stringify(linkEdited);
    assert.match(
      E.renderCompletePreview(blocks(values), page),
      /href="https:\/\/example.org\/edited-link"/,
    );
    const unlinked = E.patchNodes(layout, [logos[5].id], { linkTo: '' });
    values['layout:' + page] = JSON.stringify(unlinked);
    assert.doesNotMatch(
      E.renderCompletePreview(blocks(values), page),
      /href="https:\/\/www.benchling.com"/,
    );
    const copied = E.duplicateNodes(layout, [logos[7].id], () => 'copied-logo');
    assert.equal(
      copied.layout.nodes.find((n) => n.id === 'copied-logo').src,
      logos[7].defaults.src,
    );
    assert.ok(
      !E.removeNodes(copied.layout, ['copied-logo']).nodes.some(
        (n) => n.id === 'copied-logo',
      ),
    );
    const moved = E.moveBefore(layout, [logos[19].id], logos[5].id);
    values['layout:' + page] = JSON.stringify(moved);
    html = E.renderCompletePreview(blocks(values), page);
    assert.ok(
      html.indexOf('data-layer-id="' + logos[19].id) <
        html.indexOf('data-layer-id="' + logos[5].id),
    );
    const removedSection = E.removeNodes(layout, [section.id]);
    const reopened = E.materialize(
      JSON.parse(JSON.stringify(removedSection)),
      layers,
    );
    assert.ok(E.validateLayout(reopened));
    assert.ok(!E.hierarchyOrder(reopened).includes(section.id));
    assert.ok(!E.hierarchyOrder(reopened).includes(added.id));
    values['layout:' + page] = JSON.stringify(reopened);
    assert.doesNotMatch(
      E.renderCompletePreview(blocks(values), page),
      /data-sponsor-grid=/,
    );
    const deletedRefs = exportMedia(values, isolatedTemplate, E.sponsorLayers);
    assert.ok(!deletedRefs.has(added.src));
    const lockedChild = E.patchNodes(layout, [logos[5].id], { locked: true });
    assert.deepEqual(E.removeNodes(lockedChild, [section.id]), lockedChild);
    console.log(
      `PASS ${template}/${page}: 20 individual logo layers, old overlay joins grid, image/link edits, hide/delete, duplicate/reorder, publication and export media.`,
    );
  }
}
