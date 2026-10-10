// The header and footer ("chrome") of a template project are layers on every
// page. Their settings, anything placed inside them and CSS aimed at them are
// shared: a change saved on one page is copied to every other page.
import parse from 'postcss/lib/parse';
import type { ChildNode, Container } from 'postcss';
import {
  descendants,
  type CanvasLayout,
  type CanvasNode,
} from './canvas-schema';

export type Chrome = { nodes: CanvasNode[]; order: string[]; css: string };
export const isChromeId = (id: string) =>
  /^import-(header|footer)-\d+$/.test(id);

function chromeIds(layout: CanvasLayout) {
  return new Set(
    descendants(
      layout,
      layout.nodes.filter((n) => isChromeId(n.id)).map((n) => n.id),
    ),
  );
}
const targets = (selector: string, ids: Set<string>) => {
  const id = /^\s*\[data-layer-id="([a-zA-Z0-9-]+)"\]/.exec(selector)?.[1];
  return Boolean(id && ids.has(id));
};
const isChromeRule = (node: ChildNode, ids: Set<string>) =>
  node.type === 'rule' &&
  node.selectors.length > 0 &&
  node.selectors.every((selector) => targets(selector, ids));

/** Split a stylesheet into rules for the chrome layers and everything else. */
export function splitChromeCss(css: string, ids: Set<string>) {
  if (!css.trim() || !ids.size) return { chrome: '', rest: css };
  let root;
  try {
    root = parse(css, { from: undefined });
  } catch {
    return { chrome: '', rest: css };
  }
  const chrome: string[] = [],
    rest: string[] = [];
  const nodes = root.nodes as ChildNode[];
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    // A comment travels with the rule it introduces (e.g. the style dock's marker).
    const lead = node.type === 'comment' ? node : null;
    const body = lead ? nodes[i + 1] : node;
    if (lead && !body) {
      rest.push(lead.toString());
      continue;
    }
    if (lead) i++;
    const prefix = lead ? lead.toString() + '\n' : '';
    if (isChromeRule(body, ids)) {
      chrome.push(prefix + body.toString());
    } else if (body.type === 'atrule' && body.nodes?.length) {
      // Media blocks can hold rules for several elements: split them.
      const inner = body.nodes.filter((c) => c.type !== 'comment');
      const mine = inner.filter((c) => isChromeRule(c, ids));
      if (!mine.length) rest.push(prefix + body.toString());
      else if (mine.length === inner.length)
        chrome.push(prefix + body.toString());
      else {
        const keep = (want: boolean) => {
          const copy = body.clone() as Container;
          copy.each((child) => {
            if (child.type !== 'comment' && isChromeRule(child, ids) !== want)
              child.remove();
          });
          return copy.toString();
        };
        chrome.push(prefix + keep(true));
        rest.push(prefix + keep(false));
      }
    } else rest.push(prefix + body.toString());
  }
  return { chrome: chrome.join('\n'), rest: rest.join('\n') };
}

export function extractChrome(layout: CanvasLayout): Chrome {
  const ids = chromeIds(layout);
  return {
    nodes: layout.nodes.filter((n) => ids.has(n.id)),
    order: layout.order.filter((id) => ids.has(id)),
    css: splitChromeCss(layout.customCss || '', ids).chrome,
  };
}
/** Replace a page's chrome with another page's. */
export function applyChrome(
  layout: CanvasLayout,
  chrome: Chrome,
): CanvasLayout {
  const own = chromeIds(layout);
  const incoming = new Set(chrome.nodes.map((n) => n.id));
  const keep = (id: string) => !own.has(id) && !incoming.has(id);
  const { rest } = splitChromeCss(layout.customCss || '', own);
  const customCss = [rest, chrome.css].filter((part) => part.trim()).join('\n');
  return {
    ...layout,
    nodes: [...layout.nodes.filter((n) => keep(n.id)), ...chrome.nodes],
    order: [...layout.order.filter(keep), ...chrome.order],
    ...(customCss || layout.customCss !== undefined ? { customCss } : {}),
  };
}
const canonical = (chrome: Chrome) =>
  JSON.stringify([
    [...chrome.nodes].sort((a, b) => a.id.localeCompare(b.id)),
    chrome.order,
    chrome.css.replace(/\s+/g, ' ').trim(),
  ]);
export const sameChrome = (a: Chrome, b: Chrome) =>
  canonical(a) === canonical(b);
