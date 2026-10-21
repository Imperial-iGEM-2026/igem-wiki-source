// Runs only inside an opaque data-document sandbox. Never grant parent DOM access.
export function sourcePreviewBootstrap(token: string) {
  if (!crypto.randomUUID)
    crypto.randomUUID = () => {
      const bytes = crypto.getRandomValues(new Uint8Array(16));
      bytes[6] = (bytes[6] & 15) | 64;
      bytes[8] = (bytes[8] & 63) | 128;
      const h = [...bytes].map((v) => v.toString(16).padStart(2, '0')).join('');
      return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
    };
  const runtime = window as unknown as Window & {
    __studioSourceCss: string[];
    __studioSourceVendors: Record<string, Record<string, unknown>>;
    __mountSourcePreview: (
      data: unknown,
      page: string,
      project?: string,
      editor?: { id: string; name: string },
    ) => void;
  };
  const pending = new Map<
    number,
    { resolve: (r: Response) => void; reject: (e: Error) => void }
  >();
  let next = 0;
  let editing = false;
  let dirty = false;
  let lastInteraction = 0;
  let pointerDown = false;
  addEventListener(
    'pointerdown',
    () => {
      pointerDown = true;
    },
    true,
  );
  for (const name of ['pointerup', 'pointercancel'])
    addEventListener(
      name,
      () => {
        pointerDown = false;
        lastInteraction = Date.now();
      },
      true,
    );
  for (const name of ['pointerdown', 'keydown', 'input'])
    addEventListener(
      name,
      () => {
        lastInteraction = Date.now();
      },
      true,
    );
  const send = (type: string, data = {}) =>
    parent.postMessage({ type, token, ...data }, '*');
  addEventListener('source-preview-route', (event) =>
    send('source-preview-route', { page: (event as CustomEvent).detail }),
  );
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const address = input instanceof Request ? input.url : String(input);
    const url = new URL(address, document.baseURI);
    if (url.origin !== new URL(document.baseURI).origin)
      return originalFetch(input, init);
    const method = (
      init.method || (input instanceof Request ? input.method : 'GET')
    ).toUpperCase();
    if (method !== 'GET' && !editing)
      throw Error('Source Preview is read-only.');
    const body =
      method === 'GET'
        ? undefined
        : (init.body ??
          (input instanceof Request ? await input.clone().text() : undefined));
    const id = ++next;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      send('source-preview-fetch', { id, url: url.href, method, body });
      const timer = setTimeout(() => {
        if (pending.delete(id)) reject(Error('Website request timed out'));
      }, 180000);
      const signal =
        init.signal || (input instanceof Request ? input.signal : undefined);
      signal?.addEventListener(
        'abort',
        () => {
          clearTimeout(timer);
          if (pending.delete(id))
            reject(new DOMException('Aborted', 'AbortError'));
        },
        { once: true },
      );
    });
  };
  const uploads = new Map<
    number,
    {
      resolve: (v: unknown) => void;
      reject: (e: Error) => void;
      progress: (n: number) => void;
    }
  >();
  const streams = new Map<string, EventTarget>();
  const host = window as any;
  host.__studioUpload = (file: File, progress: (n: number) => void) => {
    if (!editing) return Promise.reject(Error('Preview is read-only.'));
    return new Promise((resolve, reject) => {
      const id = ++next;
      uploads.set(id, { resolve, reject, progress });
      send('source-editor-upload', { id, file });
    });
  };
  host.__studioNavigate = (url: string) => {
    if (editing) send('source-editor-navigate', { url });
  };
  host.__studioOpenProjects = () => {
    if (editing) send('source-editor-projects');
  };
  host.__studioOpenExport = () => {
    if (editing) send('source-editor-export');
  };
  window.addEventListener('studio-dirty', (event) => {
    dirty = Boolean((event as CustomEvent).detail);
    if (editing)
      send('source-editor-dirty', {
        dirty: Boolean((event as CustomEvent).detail),
      });
  });
  host.__studioOpenAI = (page: string) => {
    if (editing) send('source-editor-ai', { page });
  };
  // Data documents cannot change their URL to the authenticated site's origin.
  // Keep navigation inside React and reflect the route in the trusted parent.
  const route = (
    _state: unknown,
    _title: string,
    url?: string | URL | null,
  ) => {
    if (editing && url) send('source-editor-route', { url: String(url) });
  };
  history.replaceState = route;
  history.pushState = route;
  const images = new Map<string, Promise<string>>();
  const loadImage = (img: HTMLImageElement) => {
    const src = img.getAttribute('src');
    if (!src) return;
    const url = new URL(src, document.baseURI);
    if (
      url.origin !== new URL(document.baseURI).origin ||
      !(
        /^(\/api\/media\/|\/assets\/|\/templates\/)/.test(url.pathname) ||
        url.pathname === '/prion-hero.png'
      )
    )
      return;
    if (!images.has(url.href))
      images.set(
        url.href,
        fetch(url.href)
          .then((r) => {
            if (!r.ok) throw Error('Image request failed: ' + r.status);
            return r.blob();
          })
          .then((b) => URL.createObjectURL(b)),
      );
    void images
      .get(url.href)!
      .then((value) => {
        if (img.getAttribute('src') === src) img.src = value;
      })
      .catch((e) =>
        send('source-preview-resource-error', { error: String(e) }),
      );
  };
  new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === 'attributes' && r.target instanceof HTMLImageElement)
        loadImage(r.target);
      for (const n of r.addedNodes)
        if (n instanceof Element) {
          if (n instanceof HTMLImageElement) loadImage(n);
          n.querySelectorAll('img').forEach(loadImage);
        }
    }
  }).observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['src'],
  });
  const inject = (code: string) => {
    const script = document.createElement('script');
    script.textContent = code;
    document.body.appendChild(script);
  };
  let loaded = false;
  addEventListener('message', async (event) => {
    if (event.source !== parent || event.data?.token !== token) return;
    const payload = event.data;
    if (payload.type === 'source-preview-prepare-update' && loaded) {
      const focused = document.activeElement;
      const state = host.__studioCaptureState?.();
      if (
        pointerDown ||
        dirty ||
        state?.dirty ||
        uploads.size ||
        Date.now() - lastInteraction < 1500 ||
        focused?.matches('input,textarea,select,[contenteditable="true"]') ||
        document.querySelector('[role="dialog"],dialog[open]')
      )
        return;
      const scrolls = [
        '.studio-stage',
        '.studio-outline',
        '.studio-preview-scroll',
      ].map((selector) => {
        const element = document.querySelector(selector);
        return {
          selector,
          top: element?.scrollTop || 0,
          left: element?.scrollLeft || 0,
        };
      });
      const root = document.getElementById('root');
      if (root) {
        root.inert = true;
        setTimeout(() => {
          root.inert = false;
        }, 1000);
      }
      send('source-preview-update-ready', {
        resume: { editor: state, scrolls, top: scrollY, left: scrollX },
      });
    }
    if (payload.type === 'source-editor-live-event') {
      streams
        .get(payload.id)
        ?.dispatchEvent(new MessageEvent(payload.name, { data: payload.data }));
    }
    if (payload.type === 'source-editor-upload-progress')
      uploads.get(payload.id)?.progress(payload.progress);
    if (payload.type === 'source-editor-upload-result') {
      const item = uploads.get(payload.id);
      uploads.delete(payload.id);
      if (payload.error) item?.reject(Error(payload.error));
      else item?.resolve(payload.result);
    }
    if (payload.type === 'source-preview-response') {
      const item = pending.get(payload.id);
      if (!item) return;
      pending.delete(payload.id);
      if (payload.error) item.reject(Error(payload.error));
      else
        item.resolve(
          new Response(payload.body, {
            status: payload.status,
            headers: { 'Content-Type': payload.contentType },
          }),
        );
    }
    if (payload.type === 'source-preview-load' && !loaded) {
      loaded = true;
      editing = Boolean(payload.editor);
      host.__studioSourceResume = payload.resume;
      if (editing) {
        const preferences = new Map<string, string>(
          Object.entries(payload.preferences || {}).filter(
            (entry): entry is [string, string] => typeof entry[1] === 'string',
          ),
        );
        const keys = Object.keys(payload.preferences || {});
        host.__studioPreferences = {
          getItem: (key: string) => preferences.get(key) ?? null,
          setItem: (key: string, value: string) => {
            if (
              !keys.includes(key) ||
              typeof value !== 'string' ||
              value.length > 16384
            )
              return;
            preferences.set(key, value);
            send('source-editor-preference', { key, value });
          },
        };
      }
      host.__studioSourceBuild = {
        key: payload.projectId || '',
        revision: payload.revision,
        javascript: payload.javascript,
        vendor: payload.vendor,
        tailwind: payload.tailwind,
      };
      if (editing) {
        document.body.classList.remove('publication');
        host.EventSource = class extends EventTarget {
          id = String(++next);
          onerror: ((event: Event) => void) | null = null;
          constructor(address: string) {
            super();
            const url = new URL(address, document.baseURI);
            if (
              url.pathname !== '/api/live' ||
              url.origin !== new URL(document.baseURI).origin
            )
              throw Error('Unsupported event stream');
            streams.set(this.id, this);
            this.addEventListener('error', (e) => this.onerror?.(e));
            send('source-editor-live', {
              id: this.id,
              clientId: url.searchParams.get('clientId'),
              page: url.searchParams.get('page'),
            });
          }
          close() {
            streams.delete(this.id);
            send('source-editor-live-close', { id: this.id });
          }
        };
      }
      runtime.__studioSourceCss = [];
      inject(payload.vendor);
      // PDF.js normally fetches from its worker. Keep authenticated reads in
      // the parent bridge, and give its worker an opaque local module URL.
      const vendors = runtime.__studioSourceVendors;
      const pdf = vendors['pdfjs-dist'];
      if (pdf) {
        const getDocument = pdf.getDocument as (options: unknown) => unknown;
        pdf.getDocument = (options: { url?: string } | string) =>
          getDocument(
            typeof options === 'object' && options.url
              ? {
                  ...options,
                  url: new URL(options.url, document.baseURI).href,
                  useWorkerFetch: false,
                }
              : options,
          );
        const worker = await fetch('/assets/source-preview/pdf.worker.mjs');
        if (!worker.ok) throw Error('PDF preview worker could not load');
        vendors['pdfjs-dist/build/pdf.worker.min.mjs?url'].default =
          URL.createObjectURL(
            new Blob([await worker.text()], { type: 'text/javascript' }),
          );
      }
      inject(payload.javascript);
      const style = document.createElement('style');
      style.setAttribute('type', 'text/tailwindcss');
      style.textContent = runtime.__studioSourceCss.join('\n');
      document.head.appendChild(style);
      inject(payload.tailwind);
      runtime.__mountSourcePreview(
        payload.data,
        payload.page,
        payload.projectId,
        payload.editor,
      );
      // React and nested previews mount asynchronously. Keep the previous frame
      // visible until the replacement has content and its scroll is restored.
      await new Promise<void>((resolve, reject) => {
        const deadline = performance.now() + 15000;
        const ready = () => {
          if (
            !document.querySelector(editing ? '.studio-stage' : 'main') ||
            document.querySelector('.editor-loading-screen')
          ) {
            if (performance.now() > deadline) {
              reject(
                Error(
                  'Source view did not become ready. The previous view is retained.',
                ),
              );
              return;
            }
            requestAnimationFrame(ready);
            return;
          }
          const saved = payload.resume;
          if (saved) {
            scrollTo(saved.left || 0, saved.top || 0);
            for (const item of saved.scrolls || [])
              document
                .querySelector(item.selector)
                ?.scrollTo(item.left, item.top);
          }
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        };
        requestAnimationFrame(ready);
      });
      send('source-preview-loaded');
    }
    if (payload.type === 'source-preview-data' && loaded)
      runtime.__mountSourcePreview(
        payload.data,
        payload.page,
        payload.projectId,
        payload.editor,
      );
  });
  addEventListener('error', (e) =>
    send('source-preview-error', { error: e.message }),
  );
  window.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) =>
    send('source-preview-error', { error: String(e.reason) }),
  );
  send('source-preview-ready');
}
