import { exportSource } from './export-source.mjs';
import { packageUploadHelper } from './package-upload-helper.mjs';
import { build } from 'vite';
import { mkdir, cp, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { common, root } from './build-options.mjs';
import './build-purple-template.mjs';
await import('./build-white-template.mjs');
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
for (const name of [
  'app.mjs',
  'export-bundles.mjs',
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
])
  await cp(path.join(root, 'server', name), path.join(out, 'server', name));
await cp(
  path.join(root, 'scripts/export-media.mjs'),
  path.join(out, 'server/export-media.mjs'),
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
