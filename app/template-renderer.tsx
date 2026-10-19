import {
  createElement,
  type ReactNode,
  useEffect,
  useRef,
  useMemo,
} from 'react';
import type { Blocks } from './content';
import type { TemplateAst } from './templates';
import {
  isNode,
  pageLayers,
  transformNode,
  type RenderContext,
} from './template-transform';
import { PageCanvas } from './page-canvas';
import { templateCss } from './template-css';
import { startTemplateMotion } from './template-motion';
const cases: Record<string, string> = {
  viewbox: 'viewBox',
  preserveaspectratio: 'preserveAspectRatio',
  gradientunits: 'gradientUnits',
  filterunits: 'filterUnits',
  stddeviation: 'stdDeviation',
  basefrequency: 'baseFrequency',
  numoctaves: 'numOctaves',
  xchannelselector: 'xChannelSelector',
  ychannelselector: 'yChannelSelector',
  feturbulence: 'feTurbulence',
  fedisplacementmap: 'feDisplacementMap',
  fegaussianblur: 'feGaussianBlur',
  lineargradient: 'linearGradient',
  radialgradient: 'radialGradient',
  clippath: 'clipPath',
  textlength: 'textLength',
  lengthadjust: 'lengthAdjust',
  patternunits: 'patternUnits',
  patterntransform: 'patternTransform',
  gradienttransform: 'gradientTransform',
  markerwidth: 'markerWidth',
  markerheight: 'markerHeight',
  refx: 'refX',
  refy: 'refY',
  attributename: 'attributeName',
};
function ast(
  node: TemplateAst,
  field: (id: string) => ReactNode,
  key = 0,
  linkPath = 'link-0',
  context: RenderContext = { removed: new Set() },
): ReactNode {
  if (typeof node === 'string') return node;
  if ('f' in node) return field(node.f);
  if (!isNode(node)) return null;
  const shown = transformNode(node, context);
  if (!shown) return null;
  node = shown;
  const attrs: Record<string, unknown> = { key };
  for (const [name, value] of Object.entries(node.a)) {
    if (name === 'style')
      attrs.style = Object.fromEntries(
        value
          .split(';')
          .filter(Boolean)
          .map((declaration) => {
            const index = declaration.indexOf(':');
            return [
              declaration.slice(0, index).trim().startsWith('--')
                ? declaration.slice(0, index).trim()
                : declaration
                    .slice(0, index)
                    .trim()
                    .replace(/-([a-z])/g, (_, c) => c.toUpperCase())
                    .replace(/^Ms/, 'ms'),
              declaration.slice(index + 1).trim(),
            ];
          }),
      );
    else
      attrs[
        cases[name] ||
          (
            {
              class: 'className',
              tabindex: 'tabIndex',
              for: 'htmlFor',
            } as Record<string, string>
          )[name] ||
          (name.startsWith('data-') || name.startsWith('aria-')
            ? name
            : name.replace(/-([a-z])/g, (_, c) => c.toUpperCase()))
      ] = value;
  }
  if (node.t === 'a') attrs['data-template-link'] = linkPath;
  if (node.t === 'a' && attrs.target === '_blank')
    attrs.rel = 'noreferrer noopener';
  return createElement(
    cases[node.t] || node.t,
    attrs,
    ...node.c.map((n, i) => ast(n, field, i, linkPath + '-' + i, context)),
  );
}
export function TemplateStyles({
  id,
  appearanceId,
  editor = false,
}: {
  id: string;
  appearanceId?: string;
  editor?: boolean;
}) {
  const css = useMemo(() => templateCss(id, appearanceId, editor), [id, appearanceId, editor]);
  return <style>{css}</style>;
}
export function TemplateMotion({ id, page }: { id: string; page: string }) {
  const marker = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const root = marker.current?.parentElement;
    if (root) return startTemplateMotion(root);
  }, [id, page]);
  return <span ref={marker} hidden />;
}
export function ImportedPage({
  data,
  page,
  field,
}: {
  data: Blocks;
  page: string;
  field: (id: string) => ReactNode;
}) {
  const { context, layers } = pageLayers(data, page);
  return (
    <PageCanvas page={page}>
      {layers.map((layer) => (
        <div
          key={layer.id}
          id={layer.id}
          data-label={layer.label}
          data-region={layer.region}
          data-builtin-info={{
            defaults: layer.defaults,
            linkPath: layer.linkPath,
            sponsorGrid: layer.sponsorGrid,
            sponsorSlot: layer.sponsorSlot,
          }}
          className="template-section-content"
        >
          {ast(layer.ast, field, 0, layer.linkPath || 'link-0', context)}
        </div>
      ))}
    </PageCanvas>
  );
}
