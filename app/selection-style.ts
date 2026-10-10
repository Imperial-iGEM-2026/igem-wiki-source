import parse from 'postcss/lib/parse';
import { Rule, Declaration, AtRule, Comment, type ChildNode } from 'postcss';
import { cssError } from './custom-css';

export type DockScope = 'all' | 'tablet' | 'mobile';
const marker = 'prion-selection-controls';
const properties = [
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'color',
  'text-align',
  'line-height',
  'letter-spacing',
  'background-color',
  'border-radius',
  'padding',
  'object-fit',
  'display',
  'rotate',
  'translate',
];
const queries = { tablet: '(max-width: 1000px)', mobile: '(max-width: 760px)' };
/** Older drag gestures translated the PDF's contents instead of its layer. */
export function normalizePdfPlacementCss(
  source: string,
  ids: string[],
): string {
  if (!source || !ids.length) return source;
  const root = parse(source, { from: undefined });
  const selectors = new Map(
    ids.map((id) => [
      `[data-layer-id="${id}"] > div:nth-of-type(1)`,
      `[data-layer-id="${id}"]`,
    ]),
  );
  root.walkRules((rule) => {
    const layer = selectors.get(rule.selector);
    if (!layer) return;
    const owner = rule.parent?.type === 'atrule' ? rule.parent : rule;
    const comment = owner.prev();
    if (comment?.type !== 'comment' || comment.text !== marker) return;
    const move = rule.nodes.find(
      (node) => node.type === 'decl' && node.prop === 'translate',
    );
    if (!move) return;
    const placement = new Rule({ selector: layer });
    placement.append(move.clone());
    move.remove();
    if (!rule.nodes.length) {
      rule.selector = layer;
      rule.append(placement.nodes[0]);
    } else {
      const next =
        owner.type === 'atrule'
          ? owner.clone({ nodes: [placement] })
          : placement;
      owner.parent!.insertAfter(owner, next);
      owner.parent!.insertBefore(next, new Comment({ text: marker }));
    }
  });
  return root.toString();
}
const rank = (node: ChildNode) =>
  node.type !== 'atrule' ? 0 : node.params === queries.tablet ? 1 : 2;

/** Keep dock edits separate from authored CSS, with narrow breakpoints last. */
export function applySelectionStyle(
  source: string,
  selector: string,
  property: string,
  value: string,
  scope: DockScope = 'all',
): string {
  const error = cssError(source);
  if (error) throw Error('Fix the page CSS in Advanced CSS first: ' + error);
  if (
    !/^\[data-layer-id="[a-zA-Z0-9-]+"\](?: > [a-z][a-z0-9-]*:nth-of-type\([1-9][0-9]*\))*$/.test(
      selector,
    ) ||
    selector.length > 2000
  )
    throw Error('Select a page element first.');
  if (
    !properties.includes(property) ||
    !['all', 'tablet', 'mobile'].includes(scope) ||
    !value.trim() ||
    /[{};!]/.test(value)
  )
    throw Error('Unsupported style value.');
  const root = parse(source, { from: undefined });
  const owned: ChildNode[] = [];
  for (const comment of root.nodes.filter((node) => node.type === 'comment')) {
    if (comment.type !== 'comment' || comment.text !== marker) continue;
    const next = comment.next();
    if (
      next?.type === 'rule' ||
      (next?.type === 'atrule' &&
        next.name === 'media' &&
        Object.values(queries).includes(next.params) &&
        next.nodes?.length === 1 &&
        next.nodes[0].type === 'rule')
    ) {
      owned.push(next.remove());
      comment.remove();
    }
  }
  const scopeRank = scope === 'all' ? 0 : scope === 'tablet' ? 1 : 2;
  const existing = owned.find(
    (item) =>
      rank(item) === scopeRank &&
      (item.type === 'rule'
        ? item.selector
        : item.type === 'atrule' &&
          item.nodes?.[0]?.type === 'rule' &&
          item.nodes[0].selector) === selector,
  );
  let rule: Rule;
  if (existing)
    rule =
      existing.type === 'rule'
        ? existing
        : ((existing as AtRule).nodes![0] as Rule);
  else {
    rule = new Rule({ selector });
    if (scope === 'all') owned.push(rule);
    else {
      const media = new AtRule({ name: 'media', params: queries[scope] });
      media.append(rule);
      owned.push(media);
    }
  }
  rule.walkDecls(property, (decl) => {
    decl.remove();
  });
  rule.append(new Declaration({ prop: property, value, important: true }));
  for (const item of owned.sort((a, b) => rank(a) - rank(b))) {
    root.append(new Comment({ text: marker }));
    root.append(item);
  }
  const result = root.toString();
  const resultError = cssError(result);
  if (resultError) throw Error(resultError);
  return result;
}

export type DockRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};
/** All measurements are viewport pixels, independent of artboard zoom. */
export function placeSelectionDock(
  selection: DockRect,
  stage: DockRect,
  height: number,
  viewport: { width: number; height: number },
  preferredWidth = 560,
) {
  const left = Math.max(0, stage.left),
    top = Math.max(0, stage.top);
  const right = Math.min(viewport.width, stage.left + stage.width),
    bottom = Math.min(viewport.height, stage.top + stage.height);
  if (
    selection.width <= 0 ||
    selection.height <= 0 ||
    selection.left >= right ||
    selection.left + selection.width <= left ||
    selection.top >= bottom ||
    selection.top + selection.height <= top ||
    right - left < 160 ||
    bottom - top < height + 16
  )
    return null;
  const width = Math.min(Math.max(160, preferredWidth), right - left - 20);
  const x = Math.max(
    left + 10,
    Math.min(
      right - width - 10,
      selection.left + selection.width / 2 - width / 2,
    ),
  );
  const below = selection.top + selection.height + 12;
  const above = selection.top - height - 12;
  const y =
    below + height <= bottom - 8
      ? below
      : above >= top + 8
        ? above
        : bottom - height - 8;
  return { left: x, top: y, width };
}
