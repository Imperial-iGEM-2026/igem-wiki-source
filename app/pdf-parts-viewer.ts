import readerStyles from './pdf-reader.css?inline';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
type Part = { start: number; end: number; url: string };
const icons: Record<string, string> = {
  sidebar: 'M3 4h18v16H3zM8 4v16',
  prev: 'm14 6-6 6 6 6',
  next: 'm10 6 6 6-6 6',
  minus: 'M5 12h14',
  plus: 'M5 12h14M12 5v14',
  fit: 'M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5',
  rotate: 'M20 11a8 8 0 1 0-2 7M20 3v8h-8',
  full: 'M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5',
  download: 'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5',
  close: 'm6 6 12 12M6 18 18 6',
};
const button = (action: string, label: string, icon = action) =>
  `<button type="button" data-reader="${action}" aria-label="${label}" title="${label}"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${icons[icon]}"/></svg></button>`;
export async function mountPdfReader(viewer: HTMLElement) {
  if (viewer.dataset.pdfReady) return () => {};
  viewer.dataset.pdfReady = 'true';
  const parts: Part[] = JSON.parse(viewer.dataset.pdfParts!);
  const native = viewer.querySelector('iframe');
  const title = native?.title || 'PDF document';
  viewer.replaceChildren();
  let alive = true,
    current = 1,
    zoom = 1,
    fit = true,
    rotation = 0;
  let downloadController: AbortController | undefined;
  viewer.classList.add('modern-pdf-reader');
  // Isolate the reader UI from saved page selectors and template styles.
  const shadow = viewer.shadowRoot || viewer.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = readerStyles;
  const ui = document.createElement('div');
  ui.className = 'reader-shell';
  shadow.replaceChildren(style, ui);
  ui.innerHTML = `<div class="pdf-reader-toolbar" role="toolbar" aria-label="PDF reader">${button('sidebar', 'Toggle page thumbnails')}<span class="pdf-reader-title"></span><div class="pdf-reader-navigation">${button('prev', 'Previous page')}<input data-reader-page type="number" min="1" value="1" aria-label="Page number"><span data-reader-total>/ …</span>${button('next', 'Next page')}</div><span class="pdf-reader-divider"></span>${button('minus', 'Zoom out')}<span data-reader-zoom>Fit</span>${button('plus', 'Zoom in')}${button('fit', 'Fit page')}${button('rotate', 'Rotate clockwise')}<span class="pdf-reader-spacer"></span>${button('download', 'Download complete PDF')}${button('full', 'Full screen')}<button type="button" data-reader-cancel hidden>Cancel</button></div><div class="pdf-reader-body"><aside class="pdf-reader-thumbnails" aria-label="Page thumbnails" hidden></aside><div class="pdf-reader-scroll" tabindex="0" aria-label="PDF pages"><div class="pdf-reader-loading">Loading document…</div></div></div><div class="pdf-reader-status" role="status">Loading document…</div>`;
  ui.querySelector<HTMLElement>('.pdf-reader-title')!.textContent = title;
  const scroll = ui.querySelector<HTMLElement>('.pdf-reader-scroll')!;
  const sidebar = ui.querySelector<HTMLElement>('.pdf-reader-thumbnails')!;
  const status = ui.querySelector<HTMLElement>('.pdf-reader-status')!;
  const input = ui.querySelector(
    '[data-reader-page]',
  ) as unknown as HTMLInputElement;
  const action = (name: string) =>
    ui.querySelector<HTMLButtonElement>(`[data-reader="${name}"]`)!;
  const cancel = ui.querySelector<HTMLButtonElement>('[data-reader-cancel]')!;
  const documents = new Map<
    number,
    { promise: Promise<PDFDocumentProxy>; active: number; used: number }
  >();
  const tasks = new Map<HTMLElement, RenderTask>();
  const visible = new Set<HTMLElement>();
  const dimensions = new Map<number, { width: number; height: number }>();
  let observer: IntersectionObserver | undefined,
    thumbObserver: IntersectionObserver | undefined;
  let resizeObserver: ResizeObserver | undefined;
  let total = parts.at(-1)?.end || 0;
  let pdfjs: typeof import('pdfjs-dist');
  const getDocument = (partIndex: number) => {
    let entry = documents.get(partIndex);
    if (!entry) {
      const base = viewer.dataset.pdfAssets || '/assets/pdfjs/';
      const task = pdfjs.getDocument({
        url: parts[partIndex].url,
        cMapUrl: base + 'cmaps/',
        cMapPacked: true,
        standardFontDataUrl: base + 'standard_fonts/',
        wasmUrl: base + 'wasm/',
        iccUrl: base + 'iccs/',
        useSystemFonts: true,
      });
      entry = { promise: task.promise, active: 0, used: Date.now() };
      documents.set(partIndex, entry);
      entry.promise.catch(() => documents.delete(partIndex));
    }
    entry.used = Date.now();
    return entry;
  };
  const trim = () => {
    if (documents.size <= 3) return;
    for (const [index, entry] of [...documents].sort(
      (a, b) => a[1].used - b[1].used,
    )) {
      if (documents.size <= 3) break;
      if (!entry.active) {
        documents.delete(index);
        void entry.promise
          .then((doc) => doc.loadingTask.destroy())
          .catch(() => {});
      }
    }
  };
  const pageScale = (n: number, thumbnail = false) => {
    const d = dimensions.get(n) || { width: 612, height: 792 };
    const w = rotation % 180 ? d.height : d.width,
      h = rotation % 180 ? d.width : d.height;
    return thumbnail
      ? 110 / w
      : fit
        ? Math.min(
            Math.max(100, scroll.clientWidth - 48) / w,
            Math.max(100, scroll.clientHeight - 40) / h,
          )
        : zoom;
  };
  const size = (element: HTMLElement) => {
    const n = Number(element.dataset.page),
      thumb = element.dataset.thumb === 'true',
      d = dimensions.get(n) || { width: 612, height: 792 };
    const scale = pageScale(n, thumb);
    element.style.width = (rotation % 180 ? d.height : d.width) * scale + 'px';
    element.style.height = (rotation % 180 ? d.width : d.height) * scale + 'px';
  };
  const render = async (element: HTMLElement) => {
    if (!alive || tasks.has(element) || element.dataset.rendered === 'true')
      return;
    const n = Number(element.dataset.page),
      i = parts.findIndex((p) => n >= p.start && n <= p.end);
    if (i < 0) return;
    const entry = getDocument(i);
    entry.active++;
    element.dataset.rendered = 'true';
    try {
      const doc = await entry.promise;
      if (!alive || !visible.has(element)) {
        element.dataset.rendered = 'false';
        return;
      }
      const page = await doc.getPage(n - parts[i].start + 1);
      const original = page.getViewport({ scale: 1 });
      dimensions.set(n, { width: original.width, height: original.height });
      size(element);
      const scale = pageScale(n, element.dataset.thumb === 'true');
      const viewport = page.getViewport({
        scale,
        rotation: (page.rotate + rotation) % 360,
      });
      const canvas = document.createElement('canvas');
      const ratio = Math.min(
        window.devicePixelRatio || 1,
        2,
        4096 / Math.max(viewport.width, viewport.height),
      );
      canvas.width = Math.ceil(viewport.width * ratio);
      canvas.height = Math.ceil(viewport.height * ratio);
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      canvas.setAttribute('aria-label', `Page ${n}`);
      element.replaceChildren(canvas);
      const task = page.render({
        canvas,
        viewport,
        transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0],
      });
      tasks.set(element, task);
      await task.promise;
    } catch (error) {
      element.dataset.rendered = 'false';
      if (alive && (error as Error).name !== 'RenderingCancelledException') {
        element.textContent = `Page ${n} unavailable. Click to retry.`;
        status.textContent =
          'Could not load a PDF page. Check your connection and click the page to retry.';
        element.onclick = () => void render(element);
      }
    } finally {
      tasks.delete(element);
      entry.active--;
      trim();
    }
  };
  const navigate = (n: number) => {
    current = Math.max(1, Math.min(total, n || 1));
    input.value = String(current);
    const target = scroll.querySelector<HTMLElement>(
      `[data-page="${current}"]`,
    );
    if (target)
      scroll.scrollTo({ top: target.offsetTop - 16, behavior: 'instant' });
    action('prev').disabled = current === 1;
    action('next').disabled = current === total;
  };
  const refresh = () => {
    for (const element of ui.querySelectorAll<HTMLElement>('[data-page]')) {
      const task = tasks.get(element);
      task?.cancel();
      element.dataset.rendered = 'false';
      size(element);
      if (!task && visible.has(element)) void render(element);
      else if (task)
        void task.promise
          .catch(() => {})
          .then(() => {
            if (visible.has(element)) void render(element);
          });
    }
    ui.querySelector<HTMLElement>('[data-reader-zoom]')!.textContent = fit
      ? 'Fit'
      : Math.round(zoom * 100) + '%';
  };
  const cleanup = () => {
    alive = false;
    downloadController?.abort();
    observer?.disconnect();
    thumbObserver?.disconnect();
    resizeObserver?.disconnect();
    for (const task of tasks.values()) task.cancel();
    for (const entry of documents.values())
      void entry.promise
        .then((doc) => doc.loadingTask.destroy())
        .catch(() => {});
    delete viewer.dataset.pdfReady;
  };
  try {
    pdfjs = await import('pdfjs-dist');
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
    if (!alive) return cleanup;
    if (!total) {
      const doc = await getDocument(0).promise;
      total = doc.numPages;
      parts[0].end = total;
    }
    input.max = String(total);
    ui.querySelector<HTMLElement>('[data-reader-total]')!.textContent =
      '/ ' + total;
    scroll.replaceChildren();
    for (let n = 1; n <= total; n++) {
      const sheet = document.createElement('div');
      sheet.className = 'pdf-reader-sheet';
      sheet.dataset.page = String(n);
      sheet.textContent = `Page ${n}`;
      size(sheet);
      scroll.appendChild(sheet);
      const thumb = document.createElement('button');
      thumb.type = 'button';
      thumb.className = 'pdf-reader-thumb';
      thumb.setAttribute('aria-label', `Go to page ${n}`);
      thumb.innerHTML = `<span data-thumb="true" data-page="${n}"></span><span>${n}</span>`;
      thumb.onclick = () => navigate(n);
      sidebar.appendChild(thumb);
      size(thumb.firstElementChild as HTMLElement);
    }
    const observe = (entries: IntersectionObserverEntry[]) => {
      for (const item of entries) {
        const element = item.target as HTMLElement;
        if (item.isIntersecting) {
          visible.add(element);
          void render(element);
        } else {
          visible.delete(element);
          tasks.get(element)?.cancel();
          element.dataset.rendered = 'false';
          element.replaceChildren();
        }
      }
    };
    observer = new IntersectionObserver(observe, {
      root: scroll,
      rootMargin: '400px 0px',
    });
    scroll
      .querySelectorAll('[data-page]')
      .forEach((el) => observer!.observe(el));
    thumbObserver = new IntersectionObserver(observe, {
      root: sidebar,
      rootMargin: '100px 0px',
    });
    sidebar
      .querySelectorAll('[data-page]')
      .forEach((el) => thumbObserver!.observe(el));
    action('sidebar').setAttribute('aria-expanded', 'false');
    action('sidebar').onclick = () => {
      sidebar.hidden = !sidebar.hidden;
      action('sidebar').setAttribute('aria-expanded', String(!sidebar.hidden));
      refresh();
    };
    action('prev').onclick = () => navigate(current - 1);
    action('next').onclick = () => navigate(current + 1);
    action('prev').disabled = true;
    action('next').disabled = total === 1;
    input.onchange = () => navigate(Number(input.value));
    input.onkeydown = (e) => {
      if (e.key === 'Enter') navigate(Number(input.value));
    };
    action('minus').onclick = () => {
      zoom = Math.max(0.25, (fit ? pageScale(current) : zoom) - 0.25);
      fit = false;
      refresh();
    };
    action('plus').onclick = () => {
      zoom = Math.min(4, (fit ? pageScale(current) : zoom) + 0.25);
      fit = false;
      refresh();
    };
    action('fit').onclick = () => {
      fit = true;
      refresh();
    };
    action('rotate').onclick = () => {
      rotation = (rotation + 90) % 360;
      refresh();
    };
    action('full').onclick = async () => {
      try {
        if (document.fullscreenElement === viewer)
          await document.exitFullscreen();
        else await viewer.requestFullscreen();
      } catch {
        status.textContent = 'Full screen is unavailable in this browser.';
      }
    };
    let scheduled = false;
    scroll.onscroll = () => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        if (!alive) return;
        const sheets = [...scroll.querySelectorAll<HTMLElement>('[data-page]')];
        const top = scroll.scrollTop + scroll.clientHeight / 3;
        const sheet = sheets.find((el) => el.offsetTop + el.offsetHeight > top);
        if (sheet) {
          current = Number(sheet.dataset.page);
          if (shadow.activeElement !== input) input.value = String(current);
          action('prev').disabled = current === 1;
          action('next').disabled = current === total;
        }
      });
    };
    resizeObserver = new ResizeObserver(() => {
      if (fit) refresh();
    });
    resizeObserver.observe(scroll);
    status.textContent = `${total} pages`;
  } catch (error) {
    scroll.textContent = 'The PDF reader could not load.';
    status.textContent = (error as Error).message;
    const link = document.createElement('a');
    link.href = parts[0].url;
    link.textContent = 'Open PDF in browser';
    link.target = '_blank';
    link.rel = 'noopener';
    scroll.appendChild(link);
  }
  cancel.onclick = () => downloadController?.abort();
  action('download').onclick = async () => {
    if (downloadController) return;
    downloadController = new AbortController();
    const signal = downloadController.signal;
    action('download').disabled = true;
    cancel.hidden = false;
    try {
      const { PDFDocument } = await import('pdf-lib');
      const merged = await PDFDocument.create();
      for (let i = 0; i < parts.length; i++) {
        signal.throwIfAborted();
        status.textContent = `Preparing download · ${i + 1} of ${parts.length}`;
        const response = await fetch(parts[i].url, {
          signal,
          credentials: 'same-origin',
        });
        if (!response.ok) throw Error(`HTTP ${response.status}`);
        const doc = await PDFDocument.load(await response.arrayBuffer());
        (await merged.copyPages(doc, doc.getPageIndices())).forEach((page) =>
          merged.addPage(page),
        );
      }
      const bytes = await merged.save();
      signal.throwIfAborted();
      const url = URL.createObjectURL(
        new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }),
      );
      const link = document.createElement('a');
      link.href = url;
      link.download = 'complete-document.pdf';
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      status.textContent = 'Download ready';
    } catch (error) {
      status.textContent = signal.aborted
        ? 'Download cancelled'
        : `Download failed: ${(error as Error).message}. Try again.`;
    } finally {
      downloadController = undefined;
      action('download').disabled = false;
      cancel.hidden = true;
    }
  };
  return cleanup;
}
export function startPdfParts(root: ParentNode = document) {
  root.querySelectorAll<HTMLElement>('[data-pdf-parts]').forEach((viewer) => {
    void mountPdfReader(viewer);
  });
}
