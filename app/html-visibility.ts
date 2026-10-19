/** Shared by the editor and publication runtime. Never inspect the opaque frame DOM. */
type Entry = { start: () => void; started: boolean; visible: boolean };
const frames = new Map<HTMLIFrameElement, Entry>();
let near: IntersectionObserver | undefined;
let visible: IntersectionObserver | undefined;

function notify(frame: HTMLIFrameElement, entry: Entry) {
  frame.contentWindow?.postMessage(
    {
      type: 'custom-html-visibility',
      visible: entry.visible && !document.hidden,
    },
    '*',
  );
}
function visibilityChanged() {
  for (const [frame, entry] of frames) notify(frame, entry);
}
function ready(event: MessageEvent) {
  if (event.data?.type !== 'custom-html-ready') return;
  for (const [frame, entry] of frames) {
    if (event.source === frame.contentWindow) {
      notify(frame, entry);
      break;
    }
  }
}

export function watchHtmlFrame(frame: HTMLIFrameElement, start: () => void) {
  if (!frames.size) {
    window.addEventListener('message', ready);
    document.addEventListener('visibilitychange', visibilityChanged);
    if ('IntersectionObserver' in window) {
      near = new IntersectionObserver(
        (entries) => {
          for (const item of entries) {
            const entry = frames.get(item.target as HTMLIFrameElement);
            if (!item.isIntersecting || !entry || entry.started) continue;
            entry.started = true;
            near?.unobserve(item.target);
            entry.start();
          }
        },
        { rootMargin: '300px' },
      );
      visible = new IntersectionObserver((entries) => {
        for (const item of entries) {
          const frame = item.target as HTMLIFrameElement;
          const entry = frames.get(frame);
          if (!entry) continue;
          entry.visible = item.isIntersecting;
          notify(frame, entry);
        }
      });
    }
  }
  const entry = { start, started: false, visible: !visible };
  frames.set(frame, entry);
  if (near && visible) {
    visible.observe(frame);
    near.observe(frame);
  } else {
    entry.started = true;
    start();
  }
  return () => {
    near?.unobserve(frame);
    visible?.unobserve(frame);
    frames.delete(frame);
    if (!frames.size) {
      near?.disconnect();
      visible?.disconnect();
      near = visible = undefined;
      window.removeEventListener('message', ready);
      document.removeEventListener('visibilitychange', visibilityChanged);
    }
  };
}

/** Serialized into the sandbox before user scripts. Keep this function self-contained. */
export function htmlVisibilityBridge() {
  let active = false;
  let parentVisible = false;
  let next = 0;
  let scheduled = 0;
  const callbacks = new Map<number, FrameRequestCallback>();
  const paused = new Set<Animation>();
  const pausedSVG = new Set<SVGSVGElement>();
  const raf = window.requestAnimationFrame.bind(window);
  const caf = window.cancelAnimationFrame.bind(window);
  function queue() {
    if (!active || scheduled || !callbacks.size) return;
    scheduled = raf((time) => {
      scheduled = 0;
      const batch = [...callbacks];
      for (const [id, callback] of batch) {
        if (!active) break;
        if (!callbacks.delete(id)) continue;
        // One failing animation must not prevent other callbacks from running.
        try {
          callback(time);
        } catch (error) {
          setTimeout(() => {
            throw error;
          });
        }
      }
      queue();
    });
  }
  window.requestAnimationFrame = (callback) => {
    const id = ++next;
    callbacks.set(id, callback);
    queue();
    return id;
  };
  window.cancelAnimationFrame = (id) => {
    callbacks.delete(id);
  };
  const style = document.createElement('style');
  style.textContent =
    'html[data-studio-motion-paused],html[data-studio-motion-paused]::before,html[data-studio-motion-paused]::after,html[data-studio-motion-paused] *,html[data-studio-motion-paused] *::before,html[data-studio-motion-paused] *::after{animation-play-state:paused!important}';
  document.head.appendChild(style);
  document.documentElement.setAttribute('data-studio-motion-paused', '');
  function pauseAnimation(animation: Animation) {
    if (animation.playState === 'running') {
      paused.add(animation);
      const time = animation.currentTime;
      animation.pause();
      // Finish the pending pause even when Chromium throttles an offscreen frame.
      if (time !== null) animation.currentTime = time;
    }
  }
  // oxlint-disable-next-line typescript/unbound-method -- Applied below with the original element receiver.
  const animate = Element.prototype.animate;
  Element.prototype.animate = function (...args) {
    const animation = animate.apply(this, args);
    if (!active) pauseAnimation(animation);
    return animation;
  };
  function pauseSVG(svg: SVGSVGElement) {
    if (!svg.animationsPaused()) {
      svg.pauseAnimations();
      pausedSVG.add(svg);
    }
  }
  function update() {
    const nextActive = parentVisible && !document.hidden;
    if (nextActive === active) return;
    active = nextActive;
    document.documentElement.toggleAttribute(
      'data-studio-motion-paused',
      !active,
    );
    if (active) {
      for (const animation of paused) {
        if (animation.playState === 'paused') animation.play();
      }
      paused.clear();
      for (const svg of pausedSVG) if (svg.isConnected) svg.unpauseAnimations();
      pausedSVG.clear();
      queue();
    } else {
      caf(scheduled);
      scheduled = 0;
      for (const svg of document.querySelectorAll('svg')) pauseSVG(svg);
      for (const animation of document.getAnimations()) {
        // CSS animations are controlled by the pause rule, preserving author pauses.
        if (animation instanceof CSSAnimation) {
          const time = animation.currentTime;
          if (time !== null) animation.currentTime = time;
        } else if (!(animation instanceof CSSTransition))
          pauseAnimation(animation);
      }
    }
    // Custom timer/canvas integrations may cooperate without altering application timers.
    window.dispatchEvent(
      new CustomEvent('studio:visibility', { detail: { visible: active } }),
    );
  }
  window.addEventListener('message', (event) => {
    if (
      event.source !== parent ||
      event.data?.type !== 'custom-html-visibility' ||
      typeof event.data.visible !== 'boolean'
    )
      return;
    parentVisible = event.data.visible;
    update();
  });
  document.addEventListener('visibilitychange', update);
  function images(root: Document | Element) {
    for (const img of root.querySelectorAll('img')) {
      if (!img.hasAttribute('loading')) img.loading = 'lazy';
      if (!img.hasAttribute('decoding')) img.decoding = 'async';
    }
  }
  const observer = new MutationObserver((records) => {
    for (const record of records)
      for (const node of record.addedNodes) {
        if (!(node instanceof Element)) continue;
        if (!active) {
          if (node instanceof SVGSVGElement) pauseSVG(node);
          for (const svg of node.querySelectorAll('svg')) pauseSVG(svg);
        }
        if (node instanceof HTMLImageElement) {
          if (!node.hasAttribute('loading')) node.loading = 'lazy';
          if (!node.hasAttribute('decoding')) node.decoding = 'async';
        }
        images(node);
      }
  });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
  parent.postMessage({ type: 'custom-html-ready' }, '*');
}
