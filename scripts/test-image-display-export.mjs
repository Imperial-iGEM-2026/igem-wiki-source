import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { createBundleExports } from '../selfhost-dist/server/export-bundles.mjs';
import {
  templates,
  templateDefaults,
  newNode,
  emptyLayout,
} from '../selfhost-dist/server/shared.mjs';
import { manifest } from '../upload-helper/files.mjs';

const dir = await mkdtemp(path.resolve('work/image-display-export-'));
await mkdir(path.join(dir, 'media'));
const sharp = createRequire(
  new URL(
    '../selfhost-dist/server/image-runtime/' +
      process.platform +
      '-' +
      process.arch +
      '/package.json',
    import.meta.url,
  ),
)('sharp');
const original = await sharp({
  create: { width: 2400, height: 3600, channels: 3, background: '#d4618a' },
})
  .jpeg()
  .toBuffer();
const source = '/api/media/aaaa-bbbb.jpg';
await writeFile(path.join(dir, 'media/aaaa-bbbb.jpg'), original);
const values = templateDefaults('notebook-white');
const node = {
  ...newNode('portrait', 'image'),
  src: source,
  alt: 'Quality portrait',
  span: 4,
  minHeight: 360,
};
values['layout:home'] = JSON.stringify({
  ...emptyLayout,
  nodes: [node],
  order: [node.id],
});
const exporter = createBundleExports({
  dataDir: dir,
  clientDir: path.resolve('selfhost-dist/client'),
});
const input = {
  userId: 'quality',
  project: { id: 'quality', name: 'Quality test' },
  team: 'imperial-college',
  values,
  template: templates['notebook-white'],
};
const unpack = async (plan, key, output) => {
  const file = path.join(dir, key + '-' + path.basename(output) + '.zip');
  const stream = createWriteStream(file);
  stream.writeHead = () => {};
  await exporter.download({
    id: plan.id,
    key,
    userId: input.userId,
    projectId: input.project.id,
    res: stream,
  });
  const result = spawnSync('python', ['-m', 'zipfile', '-e', file, output], {
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
};
try {
  const plan = await exporter.prepare(input);
  const sourceDir = path.join(dir, 'source'),
    assetsDir = path.join(dir, 'assets');
  // Expiring the disposable cache cannot damage an already prepared export.
  await rm(path.join(dir, 'image-previews'), { recursive: true, force: true });
  await unpack(plan, 'source', sourceDir);
  await unpack(plan, 'assets', assetsDir);
  const rows = await manifest(sourceDir, { assets: assetsDir });
  const display = rows.filter((r) => r.source.startsWith(source + '?preview='));
  assert.equal(display.length, 2);
  for (const row of display) {
    const size = Number(/preview=(\d+)/.exec(row.source)[1]);
    const meta = await sharp(row.localFile).metadata();
    assert.equal(meta.height, size);
    assert.ok((await readFile(row.localFile)).length < 9_900_000);
  }
  const copiedOriginal = rows.find((r) => r.source === source);
  assert.deepEqual(await readFile(copiedOriginal.localFile), original);
  const repeated = await exporter.prepare(input);
  const repeatedDir = path.join(dir, 'again');
  await unpack(repeated, 'assets', repeatedDir);
  for (const row of display)
    assert.deepEqual(
      await readFile(row.localFile),
      await readFile(path.join(repeatedDir, row.file)),
    );
  const map = Object.fromEntries(
    rows.map((r) => [
      r.source,
      'https://static.igem.wiki/teams/6377/wiki/images/' +
        path.basename(r.file || 'external.svg'),
    ]),
  );
  const mapFile = path.join(dir, 'map.json');
  await writeFile(mapFile, JSON.stringify(map));
  const output = path.join(dir, 'published');
  const compiled = spawnSync(
    process.execPath,
    [
      'scripts/export-static.mjs',
      '--snapshot',
      path.join(sourceDir, 'publication/content.json'),
      '--media-map',
      mapFile,
      '--base',
      '/imperial-college/',
      '--out',
      output,
      '--igem',
    ],
    { encoding: 'utf8' },
  );
  assert.ok(
    [0, 2].includes(compiled.status),
    compiled.stdout + compiled.stderr,
  );
  const html = await readFile(path.join(output, 'public/index.html'), 'utf8');
  const tag = /<img\b[^>]*alt="Quality portrait"[^>]*>/.exec(html)?.[0];
  assert.ok(tag, 'portrait is exported');
  assert.ok(tag.includes('data-image-small="' + map[display[0].source] + '"'));
  assert.ok(tag.includes('data-image-large="' + map[display[1].source] + '"'));
  assert.ok(
    tag.includes('srcSet="' + map[display[1].source] + ' 1x"') ||
      tag.includes('srcset="' + map[display[1].source] + ' 1x"'),
  );
  assert.ok(
    html.includes('href="' + map[source] + '"'),
    'original link remains original',
  );
  assert.ok(!tag.includes('/api/media/'), 'published display URLs are hosted');
  console.log(
    'PASS: upload helper accepts both display copies; cache eviction cannot break prepared exports; repeat exports reproduce bytes; original download retained; published image selects hosted display copies.',
  );
} finally {
  exporter.close();
}
