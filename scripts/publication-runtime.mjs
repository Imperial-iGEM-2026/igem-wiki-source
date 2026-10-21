// Pinned standalone ES modules, uploaded through the same manifest as images.
// Never upload Vite chunks independently: their relative imports and hashes form
// a graph. These upstream distributions are self-contained module entry points.
export const publicationRuntime = [
  {
    name: 'PDF worker',
    source: '/templates/runtime/pdfjs-6.4.299-worker.js',
    file: 'pdfjs-dist/build/pdf.worker.min.mjs',
  },
  {
    name: 'PDF reader',
    source: '/templates/runtime/pdfjs-6.4.299.js',
    file: 'pdfjs-dist/build/pdf.min.mjs',
    module: 'pdfjs-dist',
  },
  {
    name: 'Complete PDF download',
    source: '/templates/runtime/pdf-lib-1.17.1.js',
    file: 'pdf-lib/dist/pdf-lib.esm.min.js',
    module: 'pdf-lib',
  },
  {
    name: '3D model viewer',
    source: '/templates/runtime/model-viewer-4.3.1.js',
    file: '@google/model-viewer/dist/model-viewer.min.js',
    module: '@google/model-viewer',
  },
  {
    name: 'PDF JPEG 2000 decoder',
    source: '/templates/runtime/pdfjs-6.4.299-openjpeg.js',
    file: 'pdfjs-dist/wasm/openjpeg_nowasm_fallback.js',
    forward: 'assets/pdfjs/wasm/openjpeg_nowasm_fallback.js',
  },
  {
    name: 'PDF JBIG2 decoder',
    source: '/templates/runtime/pdfjs-6.4.299-jbig2.js',
    file: 'pdfjs-dist/wasm/jbig2_nowasm_fallback.js',
    forward: 'assets/pdfjs/wasm/jbig2_nowasm_fallback.js',
  },
];

// iGEM static uploads reject native WebAssembly. PDF decoders stay in Pages.
export function mappedRuntime(map) {
  return publicationRuntime.flatMap((asset) => {
    const url = map[asset.source];
    if (!url) return [];
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      /* Report a useful error below. */
    }
    if (
      typeof url !== 'string' ||
      !parsed ||
      parsed.protocol !== 'https:' ||
      parsed.hostname !== 'static.igem.wiki' ||
      parsed.port ||
      parsed.username ||
      parsed.password ||
      /[\s"'`<>\\]/.test(url) ||
      /YOUR-TEAM/.test(url)
    )
      throw Error(
        `Upload ${asset.name} from assets/runtime and use its actual static.igem.wiki URL.`,
      );
    return [{ ...asset, url }];
  });
}

export function runtimeImports(assets) {
  const modules = new Map(
    assets
      .filter((asset) => asset.module)
      .map((asset) => [asset.module, asset.url]),
  );
  return {
    name: 'uploaded-publication-runtime',
    enforce: 'pre',
    resolveId(id) {
      const url = modules.get(id);
      return url ? { id: url, external: true } : null;
    },
  };
}
