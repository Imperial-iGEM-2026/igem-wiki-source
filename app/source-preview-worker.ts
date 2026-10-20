import * as esbuild from 'esbuild-wasm';
let initialized: Promise<void> | undefined;
const normalize = (name: string) => {
  const result: string[] = [];
  for (const part of name.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (!result.length) throw Error('Import leaves the project source tree');
      result.pop();
    } else result.push(part);
  }
  return result.join('/');
};
self.onmessage = async (event) => {
  const { files, dependencies, css: vendorCSS, wasmURL } = event.data;
  try {
    initialized ||= esbuild.initialize({ wasmURL, worker: false });
    await initialized;
    const resolve = (name: string, importer = '') => {
      const candidate = normalize(
        name.startsWith('@/')
          ? name.slice(2)
          : name.startsWith('.')
            ? importer.split('/').slice(0, -1).join('/') + '/' + name
            : name,
      );
      for (const p of [
        candidate,
        ...[
          '.ts',
          '.tsx',
          '.js',
          '.mjs',
          '.json',
          '/index.ts',
          '/index.tsx',
          '/index.js',
        ].map((ext) => candidate + ext),
      ])
        if (Object.hasOwn(files, p)) return p;
      throw Error(
        'Source import not found: ' +
          name +
          (importer ? ' (from ' + importer + ')' : ''),
      );
    };
    const styles = (name: string, chain: string[] = []): string => {
      if (chain.includes(name)) throw Error('Circular CSS import: ' + name);
      const source = files[name] ?? vendorCSS[name];
      if (typeof source !== 'string')
        throw Error('Stylesheet not found: ' + name);
      return source.replace(
        /@import\s+['"]([^'"]+)['"]\s*;/g,
        (rule: string, target: string) => {
          if (target === 'tailwindcss') return rule;
          const key = Object.hasOwn(vendorCSS, target)
            ? target
            : resolve(target, name);
          return styles(key, [...chain, name]);
        },
      );
    };
    const result = await esbuild.build({
      entryPoints: ['server/source-preview-entry.tsx'],
      bundle: true,
      write: false,
      format: 'iife',
      target: 'es2022',
      jsx: 'automatic',
      minify: false,
      treeShaking: true,
      define: { 'process.env.NODE_ENV': '"production"' },
      logLevel: 'silent',
      plugins: [
        {
          name: 'project-only',
          setup(b) {
            b.onResolve({ filter: /.*/ }, (a) => {
              if (dependencies.includes(a.path))
                return { path: a.path, namespace: 'vendor' };
              if (a.path.endsWith('?inline') || a.path.endsWith('?raw'))
                return {
                  path: resolve(
                    a.path.replace(/\?(inline|raw)$/, ''),
                    a.importer,
                  ),
                  namespace: 'raw',
                };
              return { path: resolve(a.path, a.importer), namespace: 'source' };
            });
            b.onLoad({ filter: /.*/, namespace: 'raw' }, (a) => ({
              contents: 'export default ' + JSON.stringify(files[a.path]) + ';',
              loader: 'js',
            }));
            b.onLoad({ filter: /.*/, namespace: 'vendor' }, (a) => ({
              contents:
                'module.exports=globalThis.__studioSourceVendors[' +
                JSON.stringify(a.path) +
                '];',
              loader: 'js',
            }));
            b.onLoad({ filter: /.*/, namespace: 'source' }, (a) => {
              if (a.path === 'app/ai-link-dialog.tsx')
                return {
                  contents: `import {useEffect} from 'react';export function AiLinkDialog({open,onOpenChange,page}){useEffect(()=>{if(open){window.__studioOpenAI(page);onOpenChange(false)}},[open]);return null}`,
                  loader: 'js',
                };
              if (a.path === 'app/studio-projects.tsx')
                return {
                  contents: `import React from 'react';export function StudioProjects(){return React.createElement('button',{onClick:()=>window.__studioOpenProjects()},'Projects')}`,
                  loader: 'js',
                };
              if (a.path === 'app/export-panel.tsx')
                return {
                  contents: `import React from 'react';export function ExportPanel({disabled}){return React.createElement('button',{disabled,onClick:()=>window.__studioOpenExport()},'Export website')}`,
                  loader: 'js',
                };
              if (a.path === 'app/upload-media.ts')
                return {
                  contents:
                    'export const uploadMedia=(file,progress)=>window.__studioUpload(file,progress);',
                  loader: 'js',
                };
              if (a.path.endsWith('.css'))
                return {
                  contents:
                    'globalThis.__studioSourceCss.push(' +
                    JSON.stringify(styles(a.path)) +
                    ');',
                  loader: 'js',
                };
              const ext = a.path.split('.').pop();
              return {
                contents: /\.[cm]?[jt]sx?$/.test(a.path)
                  ? files[a.path].replaceAll(
                      'window.location.assign(',
                      'window.__studioNavigate(',
                    )
                  : files[a.path],
                loader: ext === 'mjs' ? 'js' : (ext as esbuild.Loader),
              };
            });
          },
        },
      ],
    });
    self.postMessage({ ok: true, javascript: result.outputFiles[0].text });
  } catch (cause: unknown) {
    const error = cause as { errors?: esbuild.Message[]; message?: string };
    self.postMessage({
      ok: false,
      error:
        error.errors
          ?.map(
            (e: esbuild.Message) =>
              (e.location
                ? e.location.file +
                  ':' +
                  e.location.line +
                  ':' +
                  e.location.column +
                  ': '
                : '') + e.text,
          )
          .join('\n') ||
        error.message ||
        String(error),
    });
  }
};
