type Part = { start: number; end: number; url: string };
export function startPdfParts(root: ParentNode = document) {
  root.querySelectorAll<HTMLElement>('[data-pdf-parts]').forEach((viewer) => {
    if (viewer.dataset.pdfReady) return;
    viewer.dataset.pdfReady = 'true';
    const parts: Part[] = JSON.parse(viewer.dataset.pdfParts!);
    const frame = viewer.querySelector('iframe')!;
    const select = viewer.querySelector(
      '[data-pdf-select]',
    ) as unknown as HTMLSelectElement;
    const previous =
      viewer.querySelector<HTMLButtonElement>('[data-pdf-prev]')!;
    const next = viewer.querySelector<HTMLButtonElement>('[data-pdf-next]')!;
    const download = viewer.querySelector<HTMLButtonElement>(
      '[data-pdf-download]',
    )!;
    const cancel =
      viewer.querySelector<HTMLButtonElement>('[data-pdf-cancel]')!;
    const status = viewer.querySelector<HTMLElement>('[data-pdf-status]')!;
    let index = 0;
    let controller: AbortController | undefined;
    const update = (value: number) => {
      index = Math.max(0, Math.min(parts.length - 1, value));
      select.value = String(index);
      previous.disabled = index === 0;
      next.disabled = index === parts.length - 1;
      frame.src = parts[index].url + "#view=Fit&toolbar=1&navpanes=0";
      frame.title = `PDF pages ${parts[index].start}–${parts[index].end}`;
      if (!controller)
        status.textContent = `Pages ${parts[index].start}–${parts[index].end} of ${parts.at(-1)!.end}. Search and print apply to this part.`;
    };
    // The first frame already has its source, so don't reload it on initialization.
    previous.disabled = true;
    next.disabled = parts.length === 1;
    select.onchange = () => update(Number(select.value));
    previous.onclick = () => update(index - 1);
    next.onclick = () => update(index + 1);
    viewer.querySelector<HTMLButtonElement>('[data-pdf-fit]')!.onclick = () => {
      frame.src = parts[index].url + '#view=Fit&toolbar=1&navpanes=0';
    };
    const fullscreen = viewer.querySelector<HTMLButtonElement>('[data-pdf-fullscreen]')!;
    fullscreen.onclick = async () => {
      try {
        if (document.fullscreenElement === viewer) await document.exitFullscreen();
        else await viewer.requestFullscreen();
      } catch { status.textContent = 'Full screen is unavailable in this browser.'; }
    };
    document.addEventListener('fullscreenchange', () => {
      fullscreen.textContent = document.fullscreenElement === viewer ? 'Exit full screen' : 'Full screen';
    });
    cancel.onclick = () => controller?.abort();
    download.onclick = async () => {
      if (controller) return;
      controller = new AbortController();
      const signal = controller.signal;
      download.disabled = true;
      cancel.hidden = false;
      status.textContent = 'Preparing complete PDF…';
      try {
        const { PDFDocument } = await import('pdf-lib');
        const merged = await PDFDocument.create();
        for (let i = 0; i < parts.length; i++) {
          signal.throwIfAborted();
          status.textContent = `Downloading part ${i + 1} of ${parts.length}…`;
          const response = await fetch(parts[i].url, {
            signal,
            credentials: 'omit',
          });
          if (!response.ok)
            throw Error(`Part ${i + 1}: HTTP ${response.status}`);
          const pdf = await PDFDocument.load(await response.arrayBuffer());
          if (pdf.getPageCount() !== parts[i].end - parts[i].start + 1)
            throw Error(`Part ${i + 1} has an unexpected page count.`);
          (await merged.copyPages(pdf, pdf.getPageIndices())).forEach((page) =>
            merged.addPage(page),
          );
        }
        signal.throwIfAborted();
        status.textContent = 'Creating download…';
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
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
        status.textContent = 'Complete PDF download ready.';
      } catch (error) {
        status.textContent = signal.aborted
          ? 'Download cancelled.'
          : `Could not create the complete PDF. ${(error as Error).message} You can still open each part. Retry the download when ready.`;
      } finally {
        controller = undefined;
        download.disabled = false;
        cancel.hidden = true;
      }
    };
    window.addEventListener('pagehide', () => controller?.abort(), {
      once: true,
    });
  });
}
