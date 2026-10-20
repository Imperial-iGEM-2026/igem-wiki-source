import { mkdir, readFile, writeFile, cp, mkdtemp } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import * as esbuild from 'esbuild-wasm';
import { build } from 'vite';
const require = createRequire(import.meta.url);
export async function packageSourcePreview(root, clientDir) {
  const out = path.join(clientDir, 'assets/source-preview');
  await mkdir(out, { recursive: true });
  await mkdir(path.join(root, 'work'), { recursive: true });
  const dir = await mkdtemp(path.join(root, 'work/source-preview-vendor-'));
  const deps = new Set();
  await esbuild.build({
    entryPoints: [path.join(root, 'server/source-preview-entry.tsx')],
    bundle: true,
    write: false,
    outfile: 'probe.js',
    jsx: 'automatic',
    platform: 'browser',
    alias: { '@': root },
    logLevel: 'silent',
    plugins: [
      {
        name: 'dependencies',
        setup(b) {
          b.onResolve({ filter: /^[^./]/ }, (a) => {
            if (a.path.startsWith('@/') || path.isAbsolute(a.path)) return;
            deps.add(a.path);
            return { path: a.path, external: true };
          });
          b.onLoad({ filter: /source-preview-ui\.tsx$/ }, () => ({
            contents: 'export const SourcePreview=()=>null;',
            loader: 'js',
          }));
          b.onLoad({ filter: /\.css$/ }, () => ({
            contents: '',
            loader: 'css',
          }));
        },
      },
    ],
  });
  const names = [...deps].sort((a, b) => a.localeCompare(b));
  await writeFile(
    path.join(dir, 'vendor.js'),
    names
      .map((name, i) =>
        name.endsWith('?url')
          ? `const v${i}={default:'/assets/source-preview/pdf.worker.mjs'};`
          : `import * as v${i} from ${JSON.stringify(name)};`,
      )
      .join('\n') +
      '\nglobalThis.__studioSourceVendors={' +
      names
        .map(
          (name, i) =>
            JSON.stringify(name) + ':{...v' + i + ',__esModule:true}',
        )
        .join(',') +
      '};',
  );
  await build({
    root,
    configFile: false,
    publicDir: false,
    logLevel: 'warn',
    base: '/assets/source-preview/',
    define: {
      'process.env.NODE_ENV': JSON.stringify('production'),
      'process.env': '{}',
    },
    build: {
      outDir: out,
      emptyOutDir: false,
      minify: true,
      lib: {
        entry: path.join(dir, 'vendor.js'),
        formats: ['iife'],
        name: 'SourceVendors',
        fileName: () => 'vendor.js',
      },
      rolldownOptions: { output: { codeSplitting: false } },
    },
  });
  await build({
    root,
    configFile: false,
    publicDir: false,
    logLevel: 'warn',
    build: {
      outDir: out,
      emptyOutDir: false,
      minify: true,
      lib: {
        entry: path.join(root, 'app/source-preview-worker.ts'),
        formats: ['es'],
        fileName: () => 'compiler.js',
      },
      rolldownOptions: { output: { codeSplitting: false } },
    },
  });
  await cp(
    path.join(root, 'node_modules/pdfjs-dist/build/pdf.worker.min.mjs'),
    path.join(out, 'pdf.worker.mjs'),
  );
  await cp(
    path.join(root, 'node_modules/esbuild-wasm/esbuild.wasm'),
    path.join(out, 'esbuild.wasm'),
  );
  await cp(
    require.resolve('@tailwindcss/browser'),
    path.join(out, 'tailwind.js'),
  );
  const css = {};
  for (const name of ['tw-animate-css', 'shadcn/tailwind.css'])
    css[name] = await readFile(
      name === 'tw-animate-css'
        ? path.join(root, 'node_modules/tw-animate-css/dist/tw-animate.css')
        : require.resolve(name),
      'utf8',
    );
  await writeFile(
    path.join(out, 'manifest.json'),
    JSON.stringify({ dependencies: names, css }),
  );
  await writeFile(
    path.join(out, 'LICENSES.txt'),
    (
      await Promise.all(
        ['esbuild-wasm/LICENSE.md', '@tailwindcss/browser/LICENSE'].map(
          async (p) => {
            try {
              return (
                p +
                '\n' +
                (await readFile(path.join(root, 'node_modules', p), 'utf8'))
              );
            } catch {
              return p + ': MIT licence; see package repository.';
            }
          },
        ),
      )
    ).join('\n\n'),
  );
}
