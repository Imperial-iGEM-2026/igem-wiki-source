import { editorImageURL } from './editor-image';
const retries = new WeakSet<Event>();
const handled = new WeakSet<Event>();
const errorHandlers = new WeakMap<EventTarget, (event: Event) => void>();
export const imageDisplayRetry = (event: Event) => {
  if (event.target) errorHandlers.get(event.target)?.(event);
  return retries.has(event);
};

/** Display copies only; src and the original-download link retain the source. */
export function imageDisplayAttributes(src: string, editing = false) {
  // PNG/WebP may contain animation. Keep their original playback outside Studio.
  if (!editing && !/\.jpe?g$/i.test(src)) return {};
  const large = editorImageURL(src);
  return large === src
    ? {}
    : {
        srcSet: large + ' 1x',
        'data-image-small': editorImageURL(src, 640),
        'data-image-large': large,
        'data-image-capped': editing ? 'true' : undefined,
      };
}

// Shared by React and the static website. No canvas decoding, scroll listener,
// or per-frame work: switch cached native-resampled files after load/resize.
export function watchImageDisplay(img: HTMLImageElement) {
  if (!img.dataset.imageSmall || !img.dataset.imageLarge) return;
  let stopped = false;
  let frame = 0;
  let original = false;
  let failedSmall = false;
  let aspect = 0;
  const update = () => {
    frame = 0;
    if (
      stopped ||
      original ||
      !img.naturalWidth ||
      !img.clientWidth ||
      !img.clientHeight
    )
      return;
    const fit = getComputedStyle(img).objectFit;
    aspect ||= img.naturalWidth / img.naturalHeight;
    // Cover needs enough pixels for the cropped dimension, not just the frame's width.
    const edges = [
      img.clientWidth * Math.max(1, 1 / aspect),
      img.clientHeight * Math.max(1, aspect),
    ];
    const required =
      (fit === 'contain' || fit === 'scale-down'
        ? Math.min(...edges)
        : Math.max(...edges)) * Math.max(1, window.devicePixelRatio || 1);
    let target =
      required <= 640 && !failedSmall
        ? img.dataset.imageSmall
        : img.dataset.imageLarge;
    if (required > 1600 && img.dataset.imageCapped !== 'true') {
      target = img.getAttribute('src') || undefined;
    }
    if (target && img.getAttribute('srcset') !== target + ' 1x')
      img.setAttribute('srcset', target + ' 1x');
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(update);
  };
  const fail = (event: Event) => {
    if (handled.has(event)) return;
    handled.add(event);
    if (img.getAttribute('srcset') === img.dataset.imageSmall + ' 1x') {
      failedSmall = true;
      retries.add(event);
      img.setAttribute('srcset', img.dataset.imageLarge + ' 1x');
    } else if (img.dataset.imageCapped !== 'true' && !original) {
      original = true;
      retries.add(event);
      img.removeAttribute('srcset');
    }
  };
  errorHandlers.set(img, fail);
  img.addEventListener('load', schedule);
  img.addEventListener('error', fail);
  const resize = new ResizeObserver(schedule);
  resize.observe(img);
  window.addEventListener('resize', schedule);
  schedule();
  return () => {
    stopped = true;
    cancelAnimationFrame(frame);
    resize.disconnect();
    img.removeEventListener('load', schedule);
    img.removeEventListener('error', fail);
    errorHandlers.delete(img);
    window.removeEventListener('resize', schedule);
  };
}
