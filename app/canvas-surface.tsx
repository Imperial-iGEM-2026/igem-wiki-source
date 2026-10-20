'use client';

import { sectionAnchor } from './section-links';
import { isSiteHeader, normalizeHeaderCss } from './site-header-layer';
import { ReferenceContext, referenceIndex } from './references';
/* eslint-disable next/no-img-element -- The standalone Node/static renderer has no Next image optimizer. */

import {
  Children,
  useMemo,
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
  type CSSProperties,
  type PointerEvent,
} from 'react';
import { TemplateStyles, TemplateMotion } from './template-renderer';
import { pageMainClass } from './templates';
import { compileCustomCss } from './custom-css';
import { normalizePdfPlacementCss } from './selection-style';
import { GripVertical } from 'lucide-react';
import { MediaBlock } from './media-block';
import { editorImageURL } from './editor-image';
import { materialize } from './studio-engine';
import {
  nodeLocked,
  type CanvasLayout,
  type CanvasNode,
} from './canvas-schema';
export type Builtin = {
  defaults?: Partial<CanvasNode>;
  linkPath?: string;
  sponsorGrid?: boolean;
  sponsorSlot?: 'grid' | 'fixed';
  id: string;
  label: string;
  region?: string;
  node: ReactElement;
};
function hasPageIndexHost(element: ReactNode): boolean {
  return Children.toArray(element).some((child) => {
    if (!isValidElement(child)) return false;
    const props = child.props as Record<string, unknown> & {
      children?: ReactNode;
    };
    return (
      props['data-page-index-host'] !== undefined ||
      hasPageIndexHost(props.children)
    );
  });
}
function replaceImage(
  element: ReactElement,
  src: string,
  alt?: string,
): ReactElement {
  if (element.type === 'img')
    return cloneElement(
      element as ReactElement<{ src: string; alt?: string }>,
      { src, ...(alt !== undefined ? { alt } : {}) },
    );
  const props = element.props as { children?: ReactNode };
  return props.children
    ? cloneElement(element as ReactElement<{ children: ReactNode }>, {
        children: Children.map(props.children, (c) =>
          isValidElement(c) ? replaceImage(c, src, alt) : c,
        ),
      })
    : element;
}
export function replaceTemplateLinks(
  element: ReactElement,
  links: Record<string, string> = {},
): ReactElement {
  const props = element.props as {
    children?: ReactNode;
    'data-template-link'?: string;
  };
  const key = props['data-template-link'];
  return cloneElement(element as ReactElement<Record<string, unknown>>, {
    ...(element.type === 'a' && key && Object.hasOwn(links, key)
      ? { href: links[key], rel: 'noopener noreferrer' }
      : {}),
    ...(props.children
      ? {
          children: Children.map(props.children, (c) =>
            isValidElement(c) ? replaceTemplateLinks(c, links) : c,
          ),
        }
      : {}),
  });
}
export function nodeStyle(n: CanvasNode): CSSProperties {
  return {
    gridColumn: 'span ' + n.span,
    textAlign: n.align,
    background: n.kind === 'shape' ? undefined : n.background || undefined,
    paddingInline: n.paddingX ?? (n.padding || undefined),
    paddingBlock: n.paddingY ?? (n.padding || undefined),
    marginTop: n.marginTop,
    marginBottom: n.marginBottom,
    minHeight: n.minHeight,
    height: ['pdf', 'html', 'shape'].includes(n.kind)
      ? n.minHeight || (n.kind === 'pdf' ? 600 : 360)
      : undefined,
    boxSizing: ['pdf', 'html', 'shape'].includes(n.kind)
      ? 'border-box'
      : undefined,
    borderRadius: n.radius,
    border:
      n.kind !== 'shape' && n.borderWidth !== undefined
        ? `${n.borderWidth}px solid ${n.borderColor || '#d3d9d5'}`
        : undefined,
    opacity: n.opacity !== undefined ? n.opacity / 100 : undefined,
    zIndex: n.zIndex,
    boxShadow:
      n.shadow === 'soft'
        ? '0 4px 18px #18292114'
        : n.shadow === 'raised'
          ? '0 12px 36px #18292126'
          : n.shadow === 'none'
            ? 'none'
            : undefined,
    fontFamily:
      n.fontFamily === 'serif'
        ? 'Georgia, serif'
        : n.fontFamily === 'mono'
          ? 'monospace'
          : n.fontFamily === 'sans'
            ? 'Arial, Helvetica, sans-serif'
            : undefined,
    '--node-desktop-span': n.span,
    '--node-tablet-span': n.tabletSpan ?? n.span,
    '--node-mobile-span': n.mobileSpan ?? 12,
    '--node-color': n.textColor,
    '--node-font-size': n.fontSize ? `${n.fontSize}px` : undefined,
    '--node-heading-size': n.headingSize ? `${n.headingSize}px` : undefined,
    '--node-weight': n.fontWeight,
    '--node-leading': n.lineHeight,
    '--node-tracking':
      n.letterSpacing !== undefined ? `${n.letterSpacing}px` : undefined,
    '--node-object-fit': n.objectFit,
    '--free-element-height': n.freeHeight ? `${n.freeHeight}px` : undefined,
  } as CSSProperties;
}
export function CanvasSurface({
  layout,
  templateId,
  sourcePage,
  appearanceId,
  builtins,
  publication = false,
  editing = false,
  selected = [],
  interactingHtmlId,
  selectedItem,
  onSelect,
  onLayerPointerDown,
  onElementSelect,
  onTextEdit,
  page = 'home',
  editorViewport = false,
  cssOverride,
  disableCss = false,
  viewport = 1440,
  onResize,
  onResizeKey,
  onFreeMove,
}: {
  layout: CanvasLayout;
  sourcePage?: string;
  templateId?: string;
  appearanceId?: string;
  builtins: Builtin[];
  publication?: boolean;
  editing?: boolean;
  selected?: string[];
  interactingHtmlId?: string;
  selectedItem?: { layerId: string; itemId: string } | null;
  onTextEdit?: (element: Element) => void;
  onSelect?: (id: string, multiple: boolean) => void;
  onElementSelect?: (element: Element, multiple: boolean) => void;
  onLayerPointerDown?: (event: PointerEvent<HTMLElement>, id: string) => void;
  page?: string;
  editorViewport?: boolean;
  cssOverride?: string;
  disableCss?: boolean;
  viewport?: number;
  onResize?: (event: PointerEvent<HTMLButtonElement>, id: string) => void;
  onFreeMove?: (event: PointerEvent<HTMLElement>, id: string) => void;
  onResizeKey?: (id: string, delta: number) => void;
}) {
  const value = useMemo(
    () => materialize(layout, builtins),
    [layout, builtins],
  );
  const references = useMemo(() => referenceIndex(value), [value]);
  const nodeMap = useMemo(
    () => new Map(value.nodes.map((node) => [node.id, node])),
    [value.nodes],
  );
  const builtinMap = useMemo(
    () => new Map(builtins.map((item) => [item.id, item])),
    [builtins],
  );
  // Appearance changes keep the original content template. Native content
  // therefore needs an index host even when it started as a Blank project.
  const builtinIndex = builtins.some((item) => {
    const n = nodeMap.get(item.id);
    return (
      !n?.deleted && (!n?.hidden || editing) && hasPageIndexHost(item.node)
    );
  });
  const contentNode = nodeMap.get('custom-content');
  const nativeIndex =
    value.sidebar &&
    !builtinIndex &&
    contentNode &&
    !contentNode.deleted &&
    (!contentNode.hidden || editing) &&
    !builtinMap.has('custom-content');
  const outerIndex =
    value.sidebar &&
    !builtinIndex &&
    !nativeIndex &&
    !builtins.some((item) => item.region === 'main');
  const indexHost = (
    <aside
      className="wiki-sidebar"
      data-page-index-sidebar=""
      aria-label="Page sections"
    >
      <div data-page-index-host="" />
    </aside>
  );
  const withPageIndex = (children: ReactNode) =>
    outerIndex ? (
      <div className="page-index-layout" data-page-index-grid="outer">
        {indexHost}
        {children}
      </div>
    ) : (
      children
    );
  const childrenMap = useMemo(() => {
    const groups = new Map<string, string[]>();
    for (const id of value.order) {
      const parent = nodeMap.get(id)?.parentId;
      if (parent) {
        let children = groups.get(parent);
        if (!children) groups.set(parent, (children = []));
        children.push(id);
      }
    }
    return groups;
  }, [value.order, nodeMap]);
  const templateNodes = useMemo(
    () =>
      new Map(
        builtins.map((builtin) => {
          const node = nodeMap.get(builtin.id);
          const clean = cloneElement(
            builtin.node as ReactElement<Record<string, unknown>>,
            { 'data-builtin-info': undefined },
          );
          const parent = nodeMap.get(node?.parentId || '');
          const src = node?.src || (builtin.sponsorSlot ? parent?.src : '');
          const element = src
            ? replaceImage(
                clean,
                src,
                builtin.sponsorSlot ? node?.alt : undefined,
              )
            : clean;
          const links = {
            ...(builtin.sponsorSlot ? parent?.links : {}),
            ...node?.links,
          };
          return [
            builtin.id,
            Object.keys(links).length
              ? replaceTemplateLinks(element, links)
              : element,
          ];
        }),
      ),
    [builtins, nodeMap],
  );
  const scope = '[data-page-css="' + page.replace(/[^a-z0-9-]/gi, '') + '"]';
  const cssSource = cssOverride ?? layout.customCss ?? '';
  const headerIds = new Set(
    value.nodes
      .filter((n) => isSiteHeader(n, value.nodes, builtinMap.get(n.id)?.region))
      .map((n) => n.id),
  );
  const nativeHeader = value.nodes.some(
    (n) => n.kind === 'section' && headerIds.has(n.id),
  );
  const pdfIds = value.nodes
    .filter((node) => node.kind === 'pdf')
    .map((node) => node.id)
    .join(',');
  const customCss = useMemo(() => {
    if (disableCss) return '';
    try {
      return compileCustomCss(
        normalizePdfPlacementCss(
          nativeHeader ? normalizeHeaderCss(cssSource) : cssSource,
          pdfIds ? pdfIds.split(',') : [],
        ),
        scope,
        editorViewport,
      );
    } catch {
      return '';
    }
  }, [cssSource, scope, editorViewport, disableCss, pdfIds, nativeHeader]);
  const renderNode = (id: string): ReactNode => {
    const n = nodeMap.get(id)!;
    const locked = nodeLocked(value, id);
    const allKids = childrenMap.get(id) || [];
    const kids = allKids.filter(
      (child) =>
        !builtinMap.get(id)?.sponsorGrid ||
        nodeMap.get(child)?.kind !== 'image',
    );
    const parent = nodeMap.get(n.parentId || '');
    const sponsor =
      n.kind === 'image' &&
      Boolean(builtinMap.get(n.parentId || '')?.sponsorGrid);
    const free = Boolean(
      !sponsor &&
      parent &&
      parent.layoutMode === 'free' &&
      parent.kind !== 'accordion' &&
      (!editorViewport || viewport > 760),
    );
    const builtin = builtinMap.get(id);
    if (n.deleted || (n.hidden && !editing)) return null;
    const fillSlots = (element: ReactElement): ReactNode => {
      const props = element.props as Record<string, unknown> & {
        children?: ReactNode;
      };
      const slot = props['data-canvas-slot'];
      if (editing && element.type === 'img' && typeof props.src === 'string') {
        const preview = editorImageURL(props.src);
        if (preview !== props.src)
          return cloneElement(
            element as ReactElement<Record<string, unknown>>,
            {
              srcSet: preview + ' 1x',
              sizes: undefined,
              loading: 'lazy',
              decoding: 'async',
            },
          );
      }
      if (typeof slot === 'string')
        return nodeMap.has(slot) ? renderNode(slot) : null;
      if (props['data-sponsor-grid']) {
        const gridIds = allKids.filter(
          (child) =>
            nodeMap.get(child)?.kind === 'image' &&
            builtinMap.get(child)?.sponsorSlot !== 'fixed',
        );
        // Older saved layouts know only the added images: put those after the original logos.
        if (
          !layout.order.some(
            (child) => builtinMap.get(child)?.sponsorSlot === 'grid',
          )
        )
          gridIds.sort(
            (a, b) => Number(!builtinMap.has(a)) - Number(!builtinMap.has(b)),
          );
        return cloneElement(element as ReactElement<{ children: ReactNode }>, {
          children: gridIds.map(renderNode),
        });
      }
      if (sponsor && element.type === 'a' && n.linkTo)
        return cloneElement(element as ReactElement<Record<string, unknown>>, {
          href: n.linkTo,
          rel: 'noopener noreferrer',
        });
      return props.children
        ? cloneElement(element as ReactElement<{ children: ReactNode }>, {
            children: Children.map(props.children, (child) =>
              isValidElement(child) ? fillSlots(child) : child,
            ),
          })
        : element;
    };
    const templateElement = templateNodes.get(id);
    const sponsorAnchor =
      sponsor &&
      templateElement &&
      Children.toArray(
        (templateElement.props as { children?: ReactNode }).children,
      ).find((child) => isValidElement(child) && child.type === 'a');
    const {
      children: sponsorChildren,
      className: sponsorClass,
      ...sponsorProps
    } = (isValidElement(sponsorAnchor) ? sponsorAnchor.props : {}) as Record<
      string,
      unknown
    > & { children?: ReactNode; className?: string };
    const LayerTag = sponsor ? 'a' : 'div';
    return (
      <LayerTag
        {...(sponsor ? sponsorProps : {})}
        {...(sponsor
          ? {
              href:
                (builtin?.linkPath &&
                Object.hasOwn(n.links || {}, builtin.linkPath)
                  ? n.links![builtin.linkPath]
                  : n.linkTo) || undefined,
              target: '_blank',
              rel: 'noopener noreferrer',
            }
          : {})}
        key={id}
        id={sectionAnchor(id)}
        data-layer-id={id}
        data-layer-kind={n.kind}
        data-page-index-grid={
          nativeIndex && id === 'custom-content' ? 'native' : undefined
        }
        data-site-header={headerIds.has(id) || undefined}
        className={
          'canvas-section node-styled' +
          (n.hidden ? ' canvas-hidden' : '') +
          (editing && selected.includes(id) ? ' studio-selected' : '') +
          (locked ? ' studio-locked' : '') +
          (sponsor ? ' canvas-sponsor ' + (sponsorClass || 'sponsor-logo') : '')
        }
        data-free-child={free || undefined}
        data-section-index={n.indexLabel?.trim() || undefined}
        data-index-hidden={n.indexHidden || undefined}
        style={{
          ...nodeStyle(n),
          ...(['pdf', 'html', 'shape'].includes(n.kind) && free
            ? { height: n.freeHeight ?? 80, minHeight: n.freeHeight ?? 80 }
            : {}),
          ...(sponsor
            ? {
                gridColumn: 'auto',
                paddingInline: n.paddingX,
                paddingBlock: n.paddingY,
                minHeight: undefined,
              }
            : {}),
          ...(free
            ? {
                position: 'absolute',
                left: (n.x ?? 5) + '%',
                top: n.y ?? 20,
                width: (n.freeWidth ?? 40) + '%',
                minHeight: n.freeHeight ?? 80,
                ...(['pdf', 'html', 'shape'].includes(n.kind)
                  ? { height: n.freeHeight ?? 80 }
                  : {}),
              }
            : {}),
        }}
        onPointerDown={
          editing && free && !locked
            ? (e) => {
                if (
                  (e.target as HTMLElement)
                    .closest('[data-layer-id]')
                    ?.getAttribute('data-layer-id') === id &&
                  !(e.target as HTMLElement).closest(
                    'button,input,textarea,.editable,[data-citation-link],.modern-pdf-reader,[data-page-index-host]',
                  )
                )
                  onFreeMove?.(e, id);
              }
            : undefined
        }
        onDoubleClickCapture={
          editing && !locked
            ? (e) => {
                const element = e.target as Element;
                if (
                  element
                    .closest('[data-layer-id]')
                    ?.getAttribute('data-layer-id') !== id ||
                  element.closest(
                    '.studio-section-handle,.studio-resize,input,textarea,[data-page-index-host]',
                  )
                )
                  return;
                if (element.closest('[data-field-id],[data-node-text]')) {
                  e.preventDefault();
                  e.stopPropagation();
                  onTextEdit?.(element);
                }
              }
            : undefined
        }
        onClickCapture={
          editing
            ? (e) => {
                const target = e.target as HTMLElement;
                if (
                  target.closest(
                    '[data-citation-link],.modern-pdf-reader,[data-page-index-host],[data-html-interaction-control]',
                  )
                )
                  return;
                if (
                  target.closest(
                    '.studio-section-handle,.studio-resize,.field-editor',
                  )
                )
                  return;
                if (
                  target
                    .closest('[data-layer-id]')
                    ?.getAttribute('data-layer-id') !== id
                )
                  return;
                const adding = e.shiftKey || e.ctrlKey || e.metaKey;
                onSelect?.(id, adding);
                onElementSelect?.(target, adding);
                if (!locked && target.closest('summary') && e.detail < 2) {
                  e.stopPropagation();
                  return;
                }
                e.preventDefault();
                e.stopPropagation();
              }
            : undefined
        }
      >
        {editing && (
          <button
            className="studio-section-handle"
            onPointerDown={(e) =>
              free ? onFreeMove?.(e, id) : onLayerPointerDown?.(e, id)
            }
            onDragStart={(e) => e.preventDefault()}
            disabled={locked}
            onClick={(e) => {
              const adding = e.shiftKey || e.ctrlKey || e.metaKey;
              onSelect?.(id, adding);
              // The handle stands for the whole section in a multi-selection.
              if (adding) onElementSelect?.(e.currentTarget, true);
            }}
            title="Drag to reorder section"
          >
            <GripVertical size={13} />
            {n.name || n.title || n.kind}
            <span>
              {viewport <= 760
                ? (n.mobileSpan ?? 12)
                : viewport <= 1000
                  ? (n.tabletSpan ?? n.span)
                  : n.span}
              /12
            </span>
          </button>
        )}
        {sponsor ? (
          sponsorAnchor ? (
            Children.map(sponsorChildren, (child) =>
              isValidElement(child) ? fillSlots(child) : child,
            )
          ) : n.src ? (
            <img
              src={n.src}
              srcSet={
                editing && editorImageURL(n.src) !== n.src
                  ? editorImageURL(n.src) + ' 1x'
                  : undefined
              }
              alt={n.alt || n.name || 'Sponsor logo'}
              loading="lazy"
              decoding="async"
            />
          ) : (
            <span>Add sponsor logo</span>
          )
        ) : builtin ? (
          fillSlots(templateNodes.get(id)!)
        ) : n.kind !== 'template' ? (
          <MediaBlock
            node={n}
            editing={editing}
            htmlInteracting={
              editing && selected.includes(n.id) && interactingHtmlId === n.id
            }
            publication={publication}
            openItems={
              editing
                ? (n.items || [])
                    .filter(
                      (item) =>
                        (selectedItem?.layerId === n.id &&
                          selectedItem.itemId === item.id) ||
                        selected.some((selectedId) => {
                          let child = nodeMap.get(selectedId);
                          while (child?.parentId && child.parentId !== n.id)
                            child = nodeMap.get(child.parentId);
                          return (
                            child?.parentId === n.id &&
                            child.parentItemId === item.id
                          );
                        }),
                    )
                    .map((item) => item.id)
                : []
            }
            renderItem={
              n.kind === 'accordion'
                ? (itemId) => {
                    const itemKids = kids.filter(
                      (child) => nodeMap.get(child)?.parentItemId === itemId,
                    );
                    return itemKids.length ? (
                      <div className="canvas-children canvas-children-flow">
                        {itemKids.map(renderNode)}
                      </div>
                    ) : null;
                  }
                : undefined
            }
          />
        ) : null}
        {nativeIndex && id === 'custom-content' && indexHost}
        {n.kind !== 'accordion' && kids.length > 0 && (
          <div
            className={
              'canvas-children ' +
              (n.layoutMode === 'free'
                ? 'canvas-children-free'
                : 'canvas-children-flow')
            }
            style={
              n.layoutMode === 'free'
                ? {
                    minHeight: Math.max(
                      320,
                      ...kids.map((child) => {
                        const c = nodeMap.get(child)!;
                        return (c.y ?? 20) + (c.freeHeight ?? 80) + 30;
                      }),
                    ),
                  }
                : undefined
            }
          >
            {kids.map(renderNode)}
          </div>
        )}
        {n.linkTo && !sponsor && (
          <a
            className={
              'canvas-page-link' + (n.kind === 'button' ? ' canvas-button' : '')
            }
            href={n.linkTo}
            style={
              n.kind === 'button'
                ? {
                    background: n.background || '#3478f6',
                    color: n.textColor || '#ffffff',
                    borderRadius: n.radius,
                    fontSize: n.fontSize,
                  }
                : undefined
            }
          >
            <span data-node-text="linkLabel">
              {n.linkLabel ||
                (n.kind === 'button' ? n.title || 'Button' : 'Open page')}
            </span>{' '}
            <span aria-hidden="true">↗</span>
          </a>
        )}
        {editing && selected.includes(id) && !locked && (
          <>
            <i className="studio-corner nw" />
            <i className="studio-corner ne" />
            <i className="studio-corner sw" />
            <i className="studio-corner se" />
            {(['width', 'height', 'both'] as const).map((axis) => (
              <button
                key={axis}
                type="button"
                className={'studio-resize studio-resize-' + axis}
                data-resize-axis={axis}
                aria-label={'Resize ' + (n.name || n.kind) + ' ' + axis}
                title={
                  axis === 'both'
                    ? 'Drag to resize width and height'
                    : 'Drag to resize ' + axis
                }
                onPointerDown={(e) => onResize?.(e, id)}
                onKeyDown={(e) => {
                  if (
                    ['ArrowLeft', 'ArrowRight'].includes(e.key) &&
                    axis !== 'height'
                  ) {
                    e.preventDefault();
                    e.stopPropagation();
                    onResizeKey?.(id, e.key === 'ArrowRight' ? 1 : -1);
                  }
                }}
              />
            ))}
          </>
        )}
      </LayerTag>
    );
  };
  return (
    <ReferenceContext.Provider value={references}>
      <div
        className="page-css-root"
        data-template-theme={templateId}
        data-page-css={page.replace(/[^a-z0-9-]/gi, '')}
        data-editor-viewport={editorViewport || undefined}
        data-editor-breakpoint={
          editorViewport
            ? viewport <= 760
              ? 'mobile'
              : viewport <= 1000
                ? 'tablet'
                : 'desktop'
            : undefined
        }
        data-mobile-preview={(editorViewport && viewport <= 760) || undefined}
      >
        {templateId && (
          <TemplateStyles
            id={templateId}
            appearanceId={appearanceId}
            editor={editorViewport}
          />
        )}
        {templateId && <TemplateMotion id={templateId} page={page} />}
        {customCss && <style dangerouslySetInnerHTML={{ __html: customCss }} />}
        {templateId ? (
          <>
            {value.order
              .filter(
                (id) =>
                  !nodeMap.get(id)?.parentId &&
                  builtinMap.get(id)?.region === 'header',
              )
              .map(renderNode)}
            <main className={pageMainClass(templateId, sourcePage || page)}>
              {withPageIndex(
                <div
                  className={'page-canvas' + (editing ? ' studio-canvas' : '')}
                  data-width={value.width}
                  data-sidebar={String(value.sidebar)}
                  style={{ gap: value.gap }}
                >
                  {value.order
                    .filter(
                      (id) =>
                        !nodeMap.get(id)?.parentId &&
                        !['header', 'footer'].includes(
                          builtinMap.get(id)?.region || '',
                        ),
                    )
                    .map(renderNode)}
                </div>,
              )}
            </main>
            {value.order
              .filter(
                (id) =>
                  !nodeMap.get(id)?.parentId &&
                  builtinMap.get(id)?.region === 'footer',
              )
              .map(renderNode)}
            {editing && value.nodes.length === 0 && (
              <div className="template-empty-canvas">
                Your blank canvas. Add text, an image or a section from Insert.
              </div>
            )}
          </>
        ) : (
          <div
            className={'page-canvas' + (editing ? ' studio-canvas' : '')}
            data-sidebar={String(value.sidebar)}
            data-width={value.width}
            style={{ gap: value.gap }}
          >
            {value.order
              .filter((id) => !nodeMap.get(id)?.parentId)
              .map(renderNode)}
          </div>
        )}
      </div>
    </ReferenceContext.Provider>
  );
}
