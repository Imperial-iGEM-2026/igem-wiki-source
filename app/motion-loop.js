// One 30 fps scheduler per page. Give navigation priority over decorative drawing.
export function createMotionLoop(root, env = window) {
  const pending = new Set();
  let raf = 0,
    timer = 0,
    interactionTimer = 0,
    last = -Infinity,
    visible = true,
    scrolling = false,
    interacting = false,
    stopped = false;
  function wake() {
    if (
      !raf &&
      !stopped &&
      visible &&
      !scrolling &&
      !interacting &&
      !env.document.hidden &&
      pending.size &&
      root.isConnected
    )
      raf = env.requestAnimationFrame(tick);
  }
  function tick(time) {
    raf = 0;
    if (time - last < 1000 / 30) {
      wake();
      return;
    }
    last = time;
    const work = [...pending];
    pending.clear();
    for (const fn of work) fn(time);
    wake();
  }
  function pause() {
    if (raf) env.cancelAnimationFrame(raf);
    raf = 0;
  }
  function scroll() {
    scrolling = true;
    pause();
    env.clearTimeout(timer);
    timer = env.setTimeout(() => {
      scrolling = false;
      last = -Infinity;
      wake();
    }, 140);
  }
  function visibility() {
    if (env.document.hidden) pause();
    else {
      last = -Infinity;
      wake();
    }
  }
  const observer = new env.IntersectionObserver((entries) => {
    visible = entries[0]?.isIntersecting ?? false;
    if (!visible) pause();
    else wake();
  });
  observer.observe(root);
  env.document.addEventListener('scroll', scroll, {
    passive: true,
    capture: true,
  });
  env.document.addEventListener('visibilitychange', visibility);
  return {
    setInteracting(value) {
      if (stopped) return;
      env.clearTimeout(interactionTimer);
      interactionTimer = 0;
      if (value) {
        interacting = true;
        pause();
      } else if (interacting) {
        // Let the rail's exit transition finish before restarting SVG work.
        interactionTimer = env.setTimeout(() => {
          interactionTimer = 0;
          interacting = false;
          last = -Infinity;
          wake();
        }, 220);
      }
    },
    request(fn) {
      if (stopped) return;
      pending.add(fn);
      wake();
    },
    stop() {
      stopped = true;
      pause();
      env.clearTimeout(timer);
      env.clearTimeout(interactionTimer);
      pending.clear();
      observer.disconnect();
      env.document.removeEventListener('scroll', scroll, true);
      env.document.removeEventListener('visibilitychange', visibility);
    },
  };
}
