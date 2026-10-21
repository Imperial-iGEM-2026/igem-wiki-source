// Build-time allowlist. No server configuration, credentials, database or binaries.
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
export async function exportSource(root) {
  const files = {};
  files.LICENSE = await readFile(
    path.join(root, 'publication/wiki-LICENSE.txt'),
    'utf8',
  );
  async function walk(dir) {
    for (const entry of await readdir(path.join(root, dir), {
      withFileTypes: true,
    })) {
      const name = dir + '/' + entry.name;
      if (name === 'app/api' || entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) await walk(name);
      else if (/\.(ts|tsx|js|css|json)$/.test(name))
        files[name] = await readFile(path.join(root, name), 'utf8');
    }
  }
  for (const dir of ['app', 'components', 'hooks', 'lib']) await walk(dir);
  for (const name of [
    'publication/katex-LICENSE.txt',
    'publication/pdf-processing-LICENSES.txt',
    'package-lock.json',
    'tsconfig.json',
    'ops/igem.gitlab-ci.yml',
    'scripts/build-igem.mjs',
    'scripts/source-parts.mjs',
    'scripts/publication-runtime.mjs',
    'scripts/publication-cache.mjs',
    'scripts/publication-pages.mjs',
    'scripts/artifact-size.mjs',
    'scripts/share-publication-assets.mjs',
    'scripts/export-static.mjs',
    'scripts/export-media.mjs',
    'scripts/google-fonts.mjs',
    'scripts/export-recordings.mjs',
    'scripts/pdf-parts.mjs',
    'scripts/image-export.mjs',
    'scripts/igem-resources.mjs',
    'scripts/build-options.mjs',
    'scripts/static-renderer.tsx',
    'scripts/static-runtime.ts',
    'scripts/preview-static.mjs',
  ])
    files[name] = await readFile(path.join(root, name), 'utf8');
  const pkg = JSON.parse(
    await readFile(path.join(root, 'package.json'), 'utf8'),
  );
  pkg.scripts = {
    build: 'node scripts/build-igem.mjs',
    'export:static': 'node scripts/export-static.mjs',
    'preview:static': 'node scripts/preview-static.mjs',
  };
  files['package.json'] = JSON.stringify(pkg, null, 2);
  files['.gitlab-ci.yml'] = files['ops/igem.gitlab-ci.yml'];
  files['.gitignore'] =
    '/node_modules/\n/.static-build/\n/igem-build/\n/work/\n/.env*\n/prion-snapshot*.json\n';
  return files;
}
