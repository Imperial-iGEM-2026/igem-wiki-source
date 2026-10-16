import { sectionIndexTargets, sectionIndexLabel } from './section-navigator';
import { currentSection } from './section-position';

// The same enhancement runs in Studio, Preview and the exported static site.
// Only the dedicated host is mutated; saved page content is never rewritten.
export function startPageIndex(root) {
  const main = root.querySelector('main');
  if (!main) return () => {};
  const stage = root.dataset.editorViewport
    ? root.closest('.studio-stage')
    : null;
  const generated = new Map();
  let sidebar, host, panel, list, toggle, title, grid, tip;
  let entries = [],
    active = -1,
    frame = 0,
    disposed = false,
    dirty = true;
  let choice = null;
  try {
    choice = sessionStorage.getItem('wiki-page-index-collapsed');
  } catch {}
  let collapsed = choice === 'true',
    mobile;
  const size = new ResizeObserver(() => schedule());
  size.observe(main);
  size.observe(root);
  function schedule(rebuild = false) {
    dirty ||= rebuild;
    if (!frame && !disposed) frame = requestAnimationFrame(update);
  }
  function setCollapsed(value, remember = false) {
    const anchor = remember ? entries[active]?.heading : undefined;
    const before = anchor?.getBoundingClientRect().top;
    collapsed = value;
    if (!panel) return;
    panel.dataset.collapsed = String(value);
    toggle.textContent = value ? 'Index ›' : '‹ Hide';
    toggle.setAttribute(
      'aria-label',
      value ? 'Show page index' : 'Hide page index',
    );
    toggle.setAttribute('aria-expanded', String(!value));
    hideTip();
    title.hidden = value;
    grid?.setAttribute('data-page-index-collapsed', String(value));
    if (anchor && before !== undefined) {
      const delta = anchor.getBoundingClientRect().top - before;
      if (stage) stage.scrollBy({ top: delta, behavior: 'instant' });
      else window.scrollBy({ top: delta, behavior: 'instant' });
    }
    if (remember) {
      choice = String(value);
      try {
        sessionStorage.setItem('wiki-page-index-collapsed', choice);
      } catch {}
    }
    schedule();
  }
  function mount() {
    const next = main.querySelector('[data-page-index-host]');
    if (next === host && panel?.isConnected) return;
    panel?.remove();
    grid?.removeAttribute('data-page-index-collapsed');
    host = next;
    sidebar = host?.closest('[data-page-index-sidebar]');
    grid =
      sidebar?.closest('[data-layer-id="custom-content"]') ||
      sidebar?.closest('.wiki-content');
    if (!host) return;
    panel = document.createElement('nav');
    panel.className = 'wiki-page-index';
    panel.setAttribute('aria-label', 'Page section index');
    const head = document.createElement('div');
    head.className = 'wiki-page-index-head';
    title = document.createElement('strong');
    title.textContent = 'On this page';
    toggle = document.createElement('button');
    toggle.type = 'button';
    list = document.createElement('ol');
    let id = 'wiki-page-index-links';
    while (document.getElementById(id)) id += '-next';
    list.id = id;
    toggle.setAttribute('aria-controls', id);
    toggle.addEventListener('click', () => setCollapsed(!collapsed, true));
    // The surrounding editor must not select or drag generated navigation.
    panel.addEventListener('pointerdown', (e) => e.stopPropagation());
    panel.addEventListener('keydown', (e) => e.stopPropagation());
    head.append(title, toggle);
    tip = document.createElement('div');
    tip.className = 'wiki-page-index-tip';
    tip.hidden = true;
    tip.setAttribute('aria-hidden', 'true');
    list.addEventListener('pointerleave', hideTip);
    list.addEventListener('scroll', hideTip, { passive: true });
    panel.append(head, list, tip);
    host.append(panel);
    setCollapsed(collapsed);
  }
  function hideTip() {
    if (tip) tip.hidden = true;
    entries.forEach(({ link }) => link.removeAttribute('data-proximity'));
  }
  function showTip(index) {
    if (!collapsed || !entries[index]) return;
    const { heading, link } = entries[index];
    const label = document.createElement('strong');
    label.textContent = sectionIndexLabel(heading);
    const excerpt = document.createElement('span');
    excerpt.textContent = (heading.closest('.canvas-section,section')?.querySelector('p')?.textContent || '')
      .trim().replace(/\s+/g, ' ').slice(0, 180);
    tip.replaceChildren(label, excerpt);
    tip.hidden = false;
    const box = link.getBoundingClientRect(), bounds = panel.getBoundingClientRect();
    const scale = bounds.width / panel.offsetWidth || 1;
    tip.style.top = (mobile ? panel.offsetHeight + 8 :
      Math.max(0, Math.min((box.top - bounds.top) / scale,
        ((stage?.getBoundingClientRect().bottom || innerHeight) - bounds.top) / scale - tip.offsetHeight - 12))) + 'px';
    entries.forEach(({ link }, i) => {
      if (Math.abs(i - index) <= 3) link.dataset.proximity = String(Math.abs(i - index));
      else link.removeAttribute('data-proximity');
    });
  }
  function rebuild() {
    hideTip();
    mount();
    if (!host) return;
    const focused = list.querySelector('a:focus')?.getAttribute('href');
    const headings = sectionIndexTargets(main).filter(
      (el) =>
        !el.closest('aside,nav,[data-page-index-host],.page-heading') &&
        !el.matches('h1'),
    );
    entries = headings.map((heading, i) => {
      if (!heading.id) {
        let id = 'page-section-' + (i + 1);
        while (document.getElementById(id)) id += '-index';
        heading.id = id;
        generated.set(heading, id);
      }
      const item = document.createElement('li');
      item.dataset.level =
        heading.matches('h3') ||
        (heading.matches('[data-section-index]') &&
          heading.querySelector('h3') &&
          !heading.querySelector('h2'))
          ? '3'
          : '2';
      const link = document.createElement('a');
      link.href = '#' + encodeURIComponent(heading.id);
      const number = document.createElement('span');
      number.className = 'wiki-page-index-number';
      number.setAttribute('aria-hidden', 'true');
      number.textContent = String(i + 1).padStart(2, '0');
      const label = document.createElement('span');
      label.className = 'wiki-page-index-label';
      label.textContent = sectionIndexLabel(heading);
      link.setAttribute('aria-label', label.textContent);
      const marker = document.createElement('span');
      marker.className = 'wiki-page-index-marker';
      marker.setAttribute('aria-hidden', 'true');
      link.append(marker);
      link.addEventListener('pointerenter', () => showTip(i));
      link.addEventListener('focus', () => showTip(i));
      link.addEventListener('blur', hideTip);
      link.append(number, label);
      link.addEventListener('click', (event) => {
        if (
          event.button ||
          event.metaKey ||
          event.ctrlKey ||
          event.altKey ||
          event.shiftKey
        )
          return;
        event.preventDefault();
        hideTip();
        const top = heading.getBoundingClientRect().top;
        const offset = topOffset();
        const behavior = matchMedia('(prefers-reduced-motion: reduce)').matches
          ? 'instant'
          : 'smooth';
        if (stage)
          stage.scrollTo({
            top: stage.scrollTop + top - stage.getBoundingClientRect().top - 24,
            behavior,
          });
        else {
          history.replaceState(history.state, '', link.getAttribute('href'));
          window.scrollTo({ top: window.scrollY + top - offset, behavior });
        }
        const previousTabIndex = heading.getAttribute('tabindex');
        heading.setAttribute('tabindex', '-1');
        heading.focus({ preventScroll: true });
        if (previousTabIndex === null) heading.removeAttribute('tabindex');
        else heading.setAttribute('tabindex', previousTabIndex);
        activate(i);
      });
      item.append(link);
      return { heading, link, item };
    });
    list.replaceChildren(...entries.map((e) => e.item));
    if (!entries.length) {
      const empty = document.createElement('li');
      empty.className = 'wiki-page-index-empty';
      empty.textContent = 'Sections will appear here.';
      list.append(empty);
    }
    if (focused)
      entries
        .find((e) => e.link.getAttribute('href') === focused)
        ?.link.focus({ preventScroll: true });
    active = -1;
  }
  function topOffset() {
    if (stage) return stage.getBoundingClientRect().top + 24;
    const header = root.querySelector('.wiki-header');
    const pinned =
      header && ['sticky', 'fixed'].includes(getComputedStyle(header).position);
    return pinned
      ? Math.max(24, header.getBoundingClientRect().bottom + 16)
      : 24;
  }
  function activate(index) {
    if (active === index) return;
    entries[active]?.link.removeAttribute('aria-current');
    active = index;
    const link = entries[active]?.link;
    link?.setAttribute('aria-current', 'location');
    if (link && !panel.matches(':hover,:focus-within')) {
      const box = link.getBoundingClientRect(),
        bounds = list.getBoundingClientRect();
      if (box.top < bounds.top || box.bottom > bounds.bottom)
        list.scrollTop +=
          box.top - bounds.top - bounds.height / 2 + box.height / 2;
    }
  }
  function update() {
    frame = 0;
    if (dirty) {
      dirty = false;
      rebuild();
    }
    if (!host?.isConnected || !panel) return;
    const narrow = root.clientWidth <= 780;
    if (narrow !== mobile) {
      mobile = narrow;
      sidebar.dataset.indexMobile = String(narrow);
      if (choice === null) setCollapsed(narrow);
    }
    const bounds = sidebar.getBoundingClientRect(),
      mainBox = main.getBoundingClientRect();
    const offset = topOffset();
    // Pin against the whole page, including sections added below the template.
    const scale = root.getBoundingClientRect().width / root.offsetWidth || 1;
    const pinned = !mobile && bounds.top < offset && bounds.width > 0;
    panel.toggleAttribute('data-pinned', pinned);
    if (pinned) {
      // The canvas uses contain:paint, which changes the containing block of
      // position:fixed. Translate in normal flow instead of escaping the canvas.
      panel.style.setProperty(
        '--index-shift',
        Math.max(
          0,
          Math.min(offset, mainBox.bottom - panel.offsetHeight * scale - 16) -
            bounds.top,
        ) /
          scale +
          'px',
      );
    } else {
      panel.style.removeProperty('--index-shift');
    }
    panel.style.setProperty(
      '--index-height',
      Math.max(
        160,
        ((stage?.clientHeight || innerHeight) - (stage ? 48 : offset + 24)) /
          scale,
      ) + 'px',
    );
    const positions = entries
      .map((e, index) => ({
        index,
        top: e.heading.getBoundingClientRect().top,
      }))
      .sort((a, b) => a.top - b.top || a.index - b.index);
    const atEnd = stage
      ? stage.scrollTop + stage.clientHeight >= stage.scrollHeight - 2
      : window.scrollY > 0 &&
        window.scrollY + innerHeight >=
          document.documentElement.scrollHeight - 2;
    activate(
      atEnd
        ? (positions.at(-1)?.index ?? -1)
        : currentSection(positions, offset + 32, active),
    );
  }
  const changes = new MutationObserver((records) => {
    if (
      records.some((record) => {
        const el =
          record.target.nodeType === 1
            ? record.target
            : record.target.parentElement;
        if (el?.closest('[data-page-index-host],svg,.modern-pdf-reader'))
          return false;
        if (record.type === 'attributes')
          return (
            record.attributeName !== 'class' || el?.matches('.canvas-section')
          );
        if (record.type === 'characterData')
          return !!el?.closest('h1,h2,h3,[data-section-index]');
        return [...record.addedNodes, ...record.removedNodes].some(
          (n) =>
            n.nodeType === 1 &&
            (n.matches(
              'h1,h2,h3,[data-section-index],[data-page-index-host]',
            ) ||
              n.querySelector(
                'h1,h2,h3,[data-section-index],[data-page-index-host]',
              )),
        );
      })
    )
      schedule(true);
  });
  changes.observe(main, {
    subtree: true,
    childList: true,
    characterData: true,
    attributeFilter: [
      'hidden',
      'class',
      'data-section-index',
      'data-index-hidden',
    ],
  });
  const onScroll = () => { hideTip(); schedule(); };
  const onLoad = () => schedule(true);
  window.addEventListener('scroll', onScroll, { passive: true });
  stage?.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  main.addEventListener('load', onLoad, true);
  document.fonts?.addEventListener('loadingdone', onLoad);
  update();
  return () => {
    disposed = true;
    changes.disconnect();
    size.disconnect();
    cancelAnimationFrame(frame);
    window.removeEventListener('scroll', onScroll);
    stage?.removeEventListener('scroll', onScroll);
    window.removeEventListener('resize', onScroll);
    main.removeEventListener('load', onLoad, true);
    document.fonts?.removeEventListener('loadingdone', onLoad);
    panel?.remove();
    grid?.removeAttribute('data-page-index-collapsed');
    sidebar?.removeAttribute('data-index-mobile');
    generated.forEach((id, el) => {
      if (el.id === id) el.removeAttribute('id');
    });
  };
}
