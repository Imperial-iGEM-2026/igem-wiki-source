export type SourceBundle = {
  revision: string;
  modifiedFiles: { path: string; version: number }[];
  files: Record<string, string>;
  compiler: { dependencies: string[]; css: Record<string, string> };
};
export type SourceBuild = {
  key: string;
  revision: string;
  javascript: string;
  vendor: string;
  tailwind: string;
};

/** Compile off the UI thread. Aborting also releases the WASM worker and timer. */
export async function compileSource(
  bundle: SourceBundle,
  key: string,
  request: (url: string) => Promise<Response>,
  signal: AbortSignal,
): Promise<SourceBuild> {
  const worker = new Worker('/assets/source-preview/compiler.js', {
    type: 'module',
  });
  let timer: ReturnType<typeof setTimeout>;
  let cancel = () => {};
  try {
    const compiled = new Promise<string>((resolve, reject) => {
      cancel = () => reject(new DOMException('Build cancelled', 'AbortError'));
      signal.addEventListener('abort', cancel, { once: true });
      if (signal.aborted) return cancel();
      timer = setTimeout(
        () => reject(Error('Source build timed out. Retry the build.')),
        60000,
      );
      worker.onmessage = (event) =>
        event.data.ok
          ? resolve(event.data.javascript)
          : reject(Error(event.data.error));
      worker.onerror = (event) =>
        reject(Error(event.message || 'Source compiler could not load'));
      worker.postMessage({
        files: bundle.files,
        ...bundle.compiler,
        wasmURL: new URL(
          '/assets/source-preview/esbuild.wasm',
          document.baseURI,
        ).href,
      });
    });
    const [javascript, vendor, tailwind] = await Promise.all([
      compiled,
      request('/assets/source-preview/vendor.js').then((r) => r.text()),
      request('/assets/source-preview/tailwind.js').then((r) => r.text()),
    ]);
    return { key, revision: bundle.revision, javascript, vendor, tailwind };
  } finally {
    clearTimeout(timer!);
    signal.removeEventListener('abort', cancel);
    worker.terminate();
  }
}
