import './build-studio-responsive.mjs';
import { exportSource } from './export-source.mjs';
import { publicationRuntime } from './publication-runtime.mjs';
import { packageUploadHelper } from './package-upload-helper.mjs';
import { packageSourcePreview } from './package-source-preview.mjs';
import { packageImageRuntime } from './package-image-runtime.mjs';
import { build } from 'vite';
import { mkdir, cp, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { common, root } from './build-options.mjs';
import './build-purple-template.mjs';
await import('./build-white-template.mjs');
await import('./build-luca-template.mjs');
const out = path.join(root, 'selfhost-dist');
await build({
  ...common,
  build: {
    outDir: path.join(out, 'client'),
    emptyOutDir: true,
    rolldownOptions: {
      input: {
        main: path.join(root, 'server/index.html'),
        preview: path.join(root, 'server/preview.html'),
      },
    },
  },
});
await rename(
  path.join(out, 'client/server/index.html'),
  path.join(out, 'client/index.html'),
);
await rename(
  path.join(out, 'client/server/preview.html'),
  path.join(out, 'client/preview.html'),
);
await cp(
  path.join(root, 'publication/katex-LICENSE.txt'),
  path.join(out, 'client/katex-LICENSE.txt'),
);
await packageUploadHelper(root, path.join(out, 'client/upload-helper.zip'));
await cp(
  path.join(root, 'public/prion-hero.png'),
  path.join(out, 'client/prion-hero.png'),
);
await cp(
  path.join(root, 'public/templates'),
  path.join(out, 'client/templates'),
  { recursive: true },
);
await mkdir(path.join(out, 'client/templates/runtime'), { recursive: true });
for (const asset of publicationRuntime)
  await cp(path.join(root, 'node_modules', asset.file), path.join(out, 'client', asset.source));
await build({
  ...common,
  ssr: { noExternal: true },
  build: {
    ssr: path.join(root, 'server/shared.ts'),
    outDir: path.join(out, 'server'),
    emptyOutDir: true,
    rolldownOptions: { output: { entryFileNames: 'shared.mjs' } },
  },
});
await build({
  ...common,
  ssr: { noExternal: true },
  build: {
    ssr: path.join(root, 'server/media-processing.ts'),
    outDir: path.join(out, 'server'),
    emptyOutDir: false,
    rolldownOptions: { output: { entryFileNames: 'media-processing.mjs' } },
  },
});
for (const name of [
  'app.mjs',
  'export-bundles.mjs',
  'export-remote-assets.mjs',
  'export-jobs.mjs',
  'export-processing.mjs',
  'export-validation-cache.mjs',
  'export-media-worker.mjs',
  'image-native.mjs',
  'image-native-child.mjs',
  'image-native-process.mjs',
  'image-previews.mjs',
  'export-zip.mjs',
  'projects.mjs',
  'template-changes.mjs',
  'chat-history.mjs',
  'start.mjs',
  'import-snapshot.mjs',
  'media-gateway.mjs',
  'ai-css.mjs',
  'ai-page.mjs',
  'ai-images.mjs',
  'codex-worker.mjs',
  'live.mjs',
  'mcp.mjs',
  'mcp-media.mjs',
  'upload-space.mjs',
  'mcp-section-code.mjs',
  'project-source.mjs',
])
  await cp(path.join(root, 'server', name), path.join(out, 'server', name));
await packageImageRuntime(root, path.join(out, 'server/image-runtime'));
await cp(path.join(root, 'scripts/publication-runtime.mjs'), path.join(out, 'server/publication-runtime.mjs'));
await cp(path.join(root, 'scripts/source-parts.mjs'), path.join(out, 'server/source-parts.mjs'));
await cp(
  path.join(root, 'scripts/export-media.mjs'),
  path.join(out, 'server/export-media.mjs'),
);
await cp(
  path.join(root, 'scripts/export-recordings.mjs'),
  path.join(out, 'server/export-recordings.mjs'),
);
await cp(
  path.join(root, 'scripts/google-fonts.mjs'),
  path.join(out, 'server/google-fonts.mjs'),
);
await writeFile(
  path.join(out, 'server/export-source.json'),
  JSON.stringify(await exportSource(root)),
);
await mkdir(path.join(out, 'ops'), { recursive: true });
await cp(path.join(root, 'ops'), path.join(out, 'ops'), { recursive: true });
console.log(
  'Self-host release built at selfhost-dist/. Copy it to your Ubuntu server. Node 24 is the only runtime dependency; no npm install or build is needed on the server.',
);

await cp(
  path.join(root, 'publication/pdf-processing-LICENSES.txt'),
  path.join(out, 'client/pdf-processing-LICENSES.txt'),
);

for (const dir of ['cmaps', 'standard_fonts', 'wasm', 'iccs'])
  await cp(
    path.join(root, 'node_modules/pdfjs-dist', dir),
    path.join(out, 'client/assets/pdfjs', dir),
    { recursive: true },
  );

await cp(path.join(root, 'server/source-preview-entry.tsx'), path.join(out, 'server/source-preview-entry.tsx'));
await packageSourcePreview(root, path.join(out, 'client'));
