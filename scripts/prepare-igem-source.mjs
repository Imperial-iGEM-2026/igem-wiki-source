import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
const args = process.argv.slice(2);
const option = (key, fallback) => {
  const i = args.indexOf('--' + key);
  return i < 0 ? fallback : args[i + 1];
};
const input = option('snapshot');
if (!input)
  throw Error(
    'Use --snapshot path/to/private-snapshot.json [--out work/publication-source-candidate.json]',
  );
const snapshot = JSON.parse(await readFile(input, 'utf8'));
if (
  snapshot.format !== 'prion-wiki-snapshot' ||
  snapshot.version !== 1 ||
  !snapshot.values ||
  Array.isArray(snapshot.values) ||
  typeof snapshot.values !== 'object' ||
  Object.values(snapshot.values).some((value) => typeof value !== 'string')
)
  throw Error(
    'Expected a version 1 editor snapshot with string content values.',
  );
const output = path.resolve(
  option('out', 'work/publication-source-candidate.json'),
);
await mkdir(path.dirname(output), { recursive: true });
await writeFile(
  output,
  JSON.stringify(
    { format: 'prion-wiki-source', version: 1, values: snapshot.values },
    null,
    2,
  ) + '\n',
  { flag: 'wx' },
);
console.log(
  'Created a PRIVATE REVIEW CANDIDATE at ' +
    output +
    '.\nEmbedded media and snapshot metadata were omitted. This is NOT a privacy scrub: values may still include hidden, deleted-page or unpublished text. Review every value and layout before copying to publication/content.json or committing. Existing files are never overwritten.',
);
