import { createWriteStream } from 'node:fs';
import { mkdir, stat, readdir } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { zipStream } from '../server/export-zip.mjs';

export async function packageUploadHelper(root, destination) {
  const names = [
    'package.json',
    'package-lock.json',
    'server.mjs',
    'files.mjs',
    'sites.mjs',
    'gitlab.mjs',
    'cleanup.mjs',
    'index.html',
    'client.js',
    'style.css',
    'Start-helper.cmd',
    'start-helper.sh',
    'START-HERE.txt',
    'wiki-LICENSE.txt',
    'compiler/igem.gitlab-ci.yml',
    'compiler/build-igem.mjs',
    'compiler/source-parts.mjs',
    'compiler/publication-runtime.mjs',
    'compiler/artifact-size.mjs',
    'compiler/share-publication-assets.mjs',
    'compiler/static-runtime.ts',
    'compiler/export-static.mjs',
    'compiler/export-media.mjs',
    'compiler/export-recordings.mjs',
    'compiler/google-fonts.mjs',
    'compiler/pdf-parts.mjs',
    'compiler/image-export.mjs',
  ];
  names.push(
    ...(await readdir(path.join(root, 'public/templates/fonts')))
      .filter((name) => /\.(ttf|txt)$/.test(name))
      .map((name) => 'fonts/' + name),
  );
  const entries = await Promise.all(
    names.map(async (name) => {
      const file =
        name === 'wiki-LICENSE.txt'
          ? path.join(root, 'publication/wiki-LICENSE.txt')
          : name === 'compiler/igem.gitlab-ci.yml'
            ? path.join(root, 'ops/igem.gitlab-ci.yml')
            : name.startsWith('compiler/')
              ? path.join(root, 'scripts', path.basename(name))
              : name.startsWith('fonts/')
                ? path.join(root, 'public/templates', name)
                : path.join(root, 'upload-helper', name);
      return {
        name: 'regelerate-upload-helper/' + name,
        file,
        size: (await stat(file)).size,
      };
    }),
  );
  await mkdir(path.dirname(destination), { recursive: true });
  await pipeline(
    Readable.from(zipStream(entries)),
    createWriteStream(destination),
  );
}
