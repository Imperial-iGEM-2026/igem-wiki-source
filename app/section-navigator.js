import { currentSection } from './section-position';
const indexSelector = 'h1,h2,h3,[data-section-index]';
export function sectionIndexLabel(element) {
  return (element.dataset.sectionIndex || element.innerText || '')
    .trim()
    .replace(/\s+/g, ' ');
}
// Headings plus layers given an explicit index label in Studio. A labelled
// layer replaces its own opening heading; "Hide from index" removes a layer.
export function sectionIndexTargets(main) {
  return [...main.querySelectorAll(indexSelector)].filter((element) => {
    if (element.closest('svg,[hidden],[data-index-hidden],.canvas-hidden'))
      return false;
    if (!element.matches('[data-section-index]')) {
      const owner = element.closest('[data-section-index]');
      if (owner && owner.querySelector('h1,h2,h3') === element) return false;
    }
    return (
      element.getClientRects().length &&
      getComputedStyle(element).visibility !== 'hidden' &&
      sectionIndexLabel(element)
    );
  });
}
// Shared by the live site, isolated preview and standalone static export.
export function startSectionNavigator(root, { onInteraction = () => {} } = {}) {
  if (
    !['regelerate', 'notebook-purple', 'notebook-white'].includes(
      root.dataset.templateTheme,
    ) ||
    root.dataset.editorViewport
  )
    return () => {};
  const main = root.querySelector('main');
  if (!main) return () => {};
  const nav = document.createElement('nav');
  nav.className = 'notebook-section-nav';
  nav.dataset.theme = root.dataset.templateTheme;
  nav.setAttribute('aria-label', 'On this page');
  const tip = document.createElement('div');
  tip.className = 'notebook-section-tip';
  tip.dataset.theme = root.dataset.templateTheme;
  tip.setAttribute('aria-hidden', 'true');
  const title = document.createElement('strong'),
    description = document.createElement('span');
  tip.append(title, description);
  document.body.append(nav, tip);
  let entries = [],
    frame = 0,
    rebuildFrame = 0,
    tipFrame = 0,
    shown = null,
    pointerInside = false,
    active = -1,
    positions = [],
    geometryDirty = true,
    activationOffset = 0,
    pageEnd = 0,
    disposed = false;
  const generated = new Set();
  function setActive(index) {
    if (index === active) return;
    entries[active]?.link.removeAttribute('aria-current');
    active = index;
    entries[active]?.link.setAttribute('aria-current', 'location');
  }
  function measure() {
    geometryDirty = false;
    const scroll = window.scrollY;
    positions = entries
      .map((entry, index) => ({
        index,
        top: entry.heading.getBoundingClientRect().top + scroll,
      }))
      .sort((a, b) => a.top - b.top || a.index - b.index);
    const scrollPadding =
      parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) ||
      0;
    const margin = entries[0]
      ? parseFloat(getComputedStyle(entries[0].heading).scrollMarginTop) || 0
      : 0;
    activationOffset = Math.max(innerHeight * 0.2, scrollPadding + margin + 2);
    pageEnd = document.documentElement.scrollHeight - innerHeight;
  }
  function update() {
    frame = 0;
    if (geometryDirty) measure();
    const offset = window.scrollY;
    setActive(
      offset >= pageEnd - 2 && pageEnd > 0
        ? (positions.at(-1)?.index ?? -1)
        : currentSection(positions, offset + activationOffset, active),
    );
  }
  const schedule = () => {
    if (!frame && !disposed) frame = requestAnimationFrame(update);
  };
  const invalidate = () => {
    geometryDirty = true;
    entries.forEach((entry) => {
      entry.tipHeight = 0;
    });
    if (shown) positionTip(shown);
    schedule();
  };
  function highlight(entry) {
    const index = entries.indexOf(entry);
    entries.forEach((item, i) => {
      const distance = index < 0 ? 4 : Math.min(4, Math.abs(i - index));
      if (distance < 4) {
        if (item.link.dataset.proximity !== String(distance))
          item.link.dataset.proximity = String(distance);
      } else if (item.link.dataset.proximity !== undefined)
        delete item.link.dataset.proximity;
    });
  }
  function positionTip(entry) {
    cancelAnimationFrame(tipFrame);
    tipFrame = requestAnimationFrame(() => {
      tipFrame = 0;
      if (shown !== entry || disposed) return;
      const box = entry.link.getBoundingClientRect();
      const height = entry.tipHeight || (entry.tipHeight = tip.offsetHeight);
      const y = Math.max(
        12,
        Math.min(
          innerHeight - height - 12,
          box.top - height / 2 + box.height / 2,
        ),
      );
      tip.style.setProperty('--section-tip-y', y + 'px');
      tip.dataset.open = '';
    });
  }
  function hide() {
    shown = null;
    cancelAnimationFrame(tipFrame);
    tipFrame = 0;
    highlight(null);
    delete tip.dataset.open;
    tip.setAttribute('aria-hidden', 'true');
  }
  function show(entry) {
    if (shown === entry) return;
    shown = entry;
    onInteraction(true);
    highlight(entry);
    title.textContent = entry.label;
    description.textContent = entry.description;
    tip.setAttribute('aria-hidden', 'false');
    positionTip(entry);
  }
  function rebuild() {
    rebuildFrame = 0;
    hide();
    onInteraction(pointerInside);
    entries.forEach((entry) => entry.link.remove());
    entries = [];
    active = -1;
    const headings = sectionIndexTargets(main);
    headings.forEach((heading, i) => {
      if (!heading.id) {
        let id = 'section-' + (i + 1);
        while (document.getElementById(id)) id += '-nav';
        heading.id = id;
        generated.add(heading);
      }
      const label = sectionIndexLabel(heading);
      const link = document.createElement('a');
      link.href = '#' + encodeURIComponent(heading.id);
      link.setAttribute('aria-label', label);
      link.className = 'notebook-section-tick';
      const tick = document.createElement('span');
      tick.setAttribute('aria-hidden', 'true');
      link.append(tick);
      const section = heading.matches('[data-section-index]')
        ? heading
        : heading.closest('section,article,[data-node-id]') ||
          heading.parentElement;
      const entry = {
        heading,
        link,
        label,
        tipHeight: 0,
        description: (section?.querySelector('p')?.textContent || '')
          .trim()
          .replace(/\s+/g, ' ')
          .slice(0, 180),
      };
      entries.push(entry);
      link.addEventListener('mouseenter', () => show(entry));
      link.addEventListener('focus', () => show(entry));
      link.addEventListener('blur', () => {
        hide();
        onInteraction(pointerInside);
      });
      link.addEventListener('click', (event) => {
        if (
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey ||
          event.button
        )
          return;
        event.preventDefault();
        history.replaceState(
          history.state,
          '',
          '#' + encodeURIComponent(heading.id),
        );
        heading.scrollIntoView({
          behavior: 'instant',
          block: 'start',
        });
        setActive(entries.indexOf(entry));
        heading.setAttribute('tabindex', '-1');
        heading.focus({ preventScroll: true });
        hide();
      });
      nav.append(link);
    });
    nav.hidden = entries.length === 0;
    size.disconnect();
    size.observe(main);
    main
      .querySelectorAll('.page-canvas > *, ' + indexSelector)
      .forEach((el) => size.observe(el));
    invalidate();
  }
  const changes = new MutationObserver((records) => {
    const relevant = records.some((record) => {
      if (record.type === 'attributes') return true;
      const element =
        record.target.nodeType === 1
          ? record.target
          : record.target.parentElement;
      if (element?.closest('svg')) return false;
      if (element?.closest('h1,h2,h3,p')) return true;
      return [...record.addedNodes, ...record.removedNodes].some(
        (node) =>
          node.nodeType === 1 &&
          (node.matches('h1,h2,h3,p') || node.querySelector('h1,h2,h3,p')),
      );
    });
    if (!relevant) return;
    if (!rebuildFrame) rebuildFrame = requestAnimationFrame(rebuild);
  });
  changes.observe(main, {
    childList: true,
    subtree: true,
    characterData: true,
    attributeFilter: ['data-section-index', 'data-index-hidden'],
  });
  const size = new ResizeObserver(invalidate);
  size.observe(main);
  nav.addEventListener('mouseenter', () => {
    pointerInside = true;
    onInteraction(true);
  });
  nav.addEventListener('mouseleave', () => {
    pointerInside = false;
    const focused = entries.find(
      (entry) => entry.link === document.activeElement,
    );
    if (focused) show(focused);
    else {
      hide();
      onInteraction(false);
    }
  });
  nav.addEventListener(
    'scroll',
    () => {
      if (shown) positionTip(shown);
    },
    { passive: true },
  );
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', invalidate);
  main.addEventListener('load', invalidate, true);
  document.fonts?.addEventListener('loadingdone', invalidate);
  const theme = getComputedStyle(root);
  nav.style.color = theme.color;
  tip.style.setProperty(
    '--section-paper',
    theme.getPropertyValue('--paper').trim() || '#f7f5ee',
  );
  rebuild();
  return () => {
    disposed = true;
    changes.disconnect();
    size.disconnect();
    cancelAnimationFrame(frame);
    cancelAnimationFrame(rebuildFrame);
    cancelAnimationFrame(tipFrame);
    onInteraction(false);
    window.removeEventListener('scroll', schedule);
    window.removeEventListener('resize', invalidate);
    main.removeEventListener('load', invalidate, true);
    document.fonts?.removeEventListener('loadingdone', invalidate);
    nav.remove();
    tip.remove();
    generated.forEach((heading) => {
      heading.removeAttribute('id');
    });
  };
}
