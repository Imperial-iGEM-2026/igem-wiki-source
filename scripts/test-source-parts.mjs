import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createWriteStream } from 'node:fs';
import { partitionSource, resolveSource, readSource, SOURCE_PART_BYTES, GIT_FILE_BYTES } from './source-parts.mjs';
import { publicationSources, repositoryFile, ensureTemplateFonts, extractZip } from '../upload-helper/files.mjs';
import { createBundleExports } from '../selfhost-dist/server/export-bundles.mjs';

const values = Object.fromEntries([
  ['site:template', 'notebook-purple'],
  ['layout:education', 'Example "text" \\ newline\n😀漢字'.repeat(290000)],
  ['empty', ''],
  ['__proto__', 'preserved'],
]);
const source = { format: 'prion-wiki-source', version: 1, values };
assert.ok(Buffer.byteLength(JSON.stringify(source)) > GIT_FILE_BYTES);
const files = partitionSource(source);
assert.ok(files.length > 2);
assert.ok(files.every((f) => Buffer.byteLength(f.content) < GIT_FILE_BYTES));
assert.ok(files.slice(1).every((f) => Buffer.byteLength(f.content) <= SOURCE_PART_BYTES));
assert.deepEqual(files, partitionSource(source), 'unchanged exports reuse identical part names and bytes');
const manifest = JSON.parse(files[0].content);
assert.equal(manifest.version, 2);
const byPath = new Map(files.map((file) => [file.path, file.content]));
const get = async (name) => byPath.get('publication/' + name);
assert.deepEqual(await resolveSource(manifest, get), source);
await assert.rejects(resolveSource(manifest, async (name) => (await get(name)) + ' '), /incomplete or changed/);
await assert.rejects(resolveSource({ ...manifest, parts: [{ ...manifest.parts[0], file: '../secret.json' }] }, get), /Invalid.*reference/);
const small = { format: 'prion-wiki-source', version: 1, values: { title: 'hello' } };
assert.equal(JSON.parse(partitionSource(small)[0].content).version, 1);

const root = await mkdtemp(path.resolve('work/source-parts-'));
await mkdir(path.join(root, 'publication'), { recursive: true });
for (const file of files) {
  assert.ok(repositoryFile(file.path), file.path);
  const target = path.join(root, file.path);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, file.content);
}
assert.deepEqual(await readSource(path.join(root, 'publication/content.json')), source);
const rows = [];
await ensureTemplateFonts(root, rows);
assert.equal(rows.length, 4, 'font discovery reads version 2 source');

// A resumed legacy job still contains the oversized monolithic file.
// Checking source upgrades only the outgoing plan, keeping the local job intact.
const exported = JSON.parse(await readFile('selfhost-dist/server/export-source.json', 'utf8'));
for (const [name, content] of Object.entries(exported)) {
  const target = path.join(root, name);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content);
}
await writeFile(path.join(root, 'publication/content.json'), JSON.stringify(source));
const upgraded = await publicationSources(root);
assert.ok(upgraded.every((file) => Buffer.byteLength(file.content) < GIT_FILE_BYTES));
assert.ok(upgraded.some((file) => file.path === 'scripts/source-parts.mjs'));
assert.equal(JSON.parse(await readFile(path.join(root, 'publication/content.json'), 'utf8')).version, 1);
const upgradeMap = new Map(upgraded.map((file) => [file.path, file.content]));
assert.deepEqual(await resolveSource(JSON.parse(upgradeMap.get('publication/content.json')),
  async (name) => upgradeMap.get('publication/' + name)), source);
await mkdir(path.join(root, 'app'), { recursive: true });
await writeFile(path.join(root, 'app/too-large.json'), ' '.repeat(GIT_FILE_BYTES));
await assert.rejects(publicationSources(root), /10 MB limit: app\/too-large.json/);
const bundles = createBundleExports({ dataDir: root, clientDir: path.resolve('selfhost-dist/client') });
try {
  const plan = await bundles.prepare({
    userId: 'source-test', project: { id: 'source-test', name: 'Large source test' },
    values: { brand: values['layout:education'] },
    template: { pages: ['attributions', 'contribution', 'engineering', 'human-practices'].map((slug) => ({ slug, layers: [] })) },
    team: 'imperial-college',
  });
  const zip = path.join(root, 'server-source.zip');
  const res = createWriteStream(zip);
  res.writeHead = (status) => assert.equal(status, 200);
  await bundles.download({ id: plan.id, key: 'source', userId: 'source-test', projectId: 'source-test', res });
  const extracted = path.join(root, 'server-source');
  await extractZip(zip, extracted);
  const index = JSON.parse(await readFile(path.join(extracted, 'publication/content.json'), 'utf8'));
  assert.equal(index.version, 2, 'server export must split before its GitLab file-size preflight');
  assert.equal((await readSource(path.join(extracted, 'publication/content.json'))).values.brand, values['layout:education']);
} finally {
  bundles.close();
}
console.log(`PASS: >10 MB source round-trips exactly through ${files.length - 1} size-limited parts; stable names, Unicode, integrity checks, fonts, legacy helper upgrade and other-file preflight.`);
