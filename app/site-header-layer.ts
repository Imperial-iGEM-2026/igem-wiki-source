import type { CanvasNode } from './canvas-schema';
import parse from 'postcss/lib/parse';
import selectorParser from 'postcss-selector-parser';

/** Semantic marker for current headers plus compatibility with saved Luca frames. */
export function isSiteHeader(
  node: CanvasNode,
  nodes: CanvasNode[],
  region?: string,
) {
  if (region === 'header' || node.siteRole === 'header') return true;
  if (node.kind !== 'section') return false;
  if (node.name?.trim().toLowerCase() === 'site header') return true;
  // Older imported headers used padding 3 as their role. Inspect saved numbers,
  // never the browser/SSR serialization of the style attribute.
  return (
    (node.paddingX ?? node.padding) === 3 &&
    nodes.some(
      (child) =>
        child.parentId === node.id &&
        child.kind === 'button' &&
        (child.linkTo === '/' || child.linkTo === '/home'),
    )
  );
}

/** Keep saved legacy header CSS working; new styles target the semantic marker. */
export function normalizeHeaderCss(source: string) {
  if (!/padding-inline\s*:\s*3px/.test(source)) return source;
  try {
    const root = parse(source, { from: undefined });
    root.walkRules((rule) => {
      const selector = selectorParser().astSync(rule.selector);
      selector.walkAttributes((attribute) => {
        if (
          attribute.attribute === 'style' &&
          attribute.operator === '*=' &&
          /^padding-inline\s*:\s*3px\s*;?$/.test(attribute.value || '')
        )
          attribute.replaceWith(
            selectorParser.attribute({
              attribute: 'data-site-header',
              value: undefined,
              raws: {},
            }),
          );
      });
      rule.selector = selector.toString();
    });
    return root.toString();
  } catch {
    return source;
  }
}
