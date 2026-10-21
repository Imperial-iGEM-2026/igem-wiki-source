import { readFile, access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readSource } from './source-parts.mjs';
import { logArtifactSize } from './artifact-size.mjs';

// All build inputs are committed source. Nothing is fetched from the editor,
// its API, private media store, environment files or live database.
const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
const arg = (key, fallback) => {
  const i = args.indexOf('--' + key);
  return i < 0 ? fallback : args[i + 1];
};
const local = (value) => {
  if (typeof value !== 'string' || !value || path.isAbsolute(value))
    throw Error('Publication input paths must be relative to the source root.');
  const resolved = path.resolve(root, value);
  const relative = path.relative(root, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative))
    throw Error('Publication input must stay inside the source root.');
  return resolved;
};
const config = JSON.parse(
  await readFile(local(arg('config', 'publication/config.json')), 'utf8'),
);
if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(config.teamSlug || ''))
  throw Error('Set the exact registered teamSlug in publication/config.json.');
if (config.repository !== `https://gitlab.igem.org/2026/${config.teamSlug}`)
  throw Error('Repository must match the registered 2026 team slug.');
if (
  !Array.isArray(config.requiredPages) ||
  config.requiredPages.some(
    (slug) =>
      typeof slug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug),
  )
)
  throw Error('requiredPages must list the selected awards’ exact page slugs.');
await access(path.join(root, 'LICENSE')).catch(() => {
  throw Error(
    'The source export must include its CC BY 4.0 LICENSE at the repository root. Re-export or use the current upload helper to add it.',
  );
});
await access(path.join(root, 'package-lock.json'));
const sourcePath = local(config.source);
await readSource(sourcePath);
const mediaMap = local(config.mediaMap);
await access(mediaMap);
const command = [
  path.join(root, 'scripts/export-static.mjs'),
  '--snapshot',
  sourcePath,
  '--base',
  `/${config.teamSlug}/`,
  '--out',
  local(arg('out', 'igem-build')),
  '--media-map',
  mediaMap,
  '--repository',
  config.repository,
  '--license-confirmed',
  '--required-pages',
  config.requiredPages.join(','),
  '--igem',
];
if (config.attributionUrl)
  command.push('--attribution-url', config.attributionUrl);
if (config.fontCss) command.push('--font-css', local(config.fontCss));
const result = spawnSync(process.execPath, command, {
  cwd: root,
  stdio: 'inherit',
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
if (result.status === 0) {
  const budget = Number(process.env.IGEM_ARTIFACT_BUDGET_BYTES || 0);
  if (!Number.isSafeInteger(budget) || budget < 0) throw Error('IGEM_ARTIFACT_BUDGET_BYTES must be a non-negative integer.');
  try {
    const size = await logArtifactSize(local(arg('out', 'igem-build')));
    if (budget && size.compressedEstimate > budget) {
      console.error(`Pages archive estimate exceeds the configured ${budget}-byte budget. Prepare a fresh export, upload its JavaScript files from assets/runtime just like images and include the helper's media mapping. Backup/test/scratch pages are excluded automatically. If the complete mapping is already included, inspect the largest remaining files above. This budget is configurable and is not a verified iGEM server limit.`);
      process.exitCode = 2;
    }
  } catch (error) {
    console.error('Artifact size check unavailable:', error.message);
    if (budget) process.exitCode = 2;
  }
}
