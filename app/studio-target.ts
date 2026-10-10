export type DesignTarget = {
  layerId: string;
  selector: string;
  label: string;
  fieldId?: string;
  textProperty?: 'title' | 'body' | 'linkLabel';
  linkKey?: string;
  href?: string;
};

/** Select exact text fragments using structure shared by editor and publication. */
export function pickDesignTarget(clicked: Element): DesignTarget | null {
  const layer = clicked.closest('[data-layer-id]');
  const layerId = layer?.getAttribute('data-layer-id');
  if (!layer || !layerId || !/^[a-zA-Z0-9-]{1,90}$/.test(layerId)) return null;
  let element = clicked;
  if (element.closest('.studio-section-handle,.studio-resize,.field-editor'))
    element = layer;
  else {
    const editable = element.closest('[data-field-id],.editable');
    if (editable) element = editable;
    // SVG internals and inline wrappers are less useful than their content element.
    const semantic = element.closest(
      'h1,h2,h3,h4,h5,h6,p,a,button,img,video,audio,iframe,model-viewer,figure,li',
    );
    if (!editable && semantic && layer.contains(semantic)) element = semantic;
  }
  const parts: string[] = [];
  for (
    let cursor: Element | null = element;
    cursor && cursor !== layer;
    cursor = cursor.parentElement
  ) {
    if (!cursor.parentElement) return null;
    const tag = cursor.localName;
    if (!/^[a-z][a-z0-9-]*$/.test(tag)) return null;
    const siblings = Array.from(cursor.parentElement.children).filter(
      (child) => child.localName === tag,
    );
    parts.unshift(`${tag}:nth-of-type(${siblings.indexOf(cursor) + 1})`);
  }
  const selector =
    `[data-layer-id="${layerId}"]` +
    (parts.length ? ' > ' + parts.join(' > ') : '');
  if (selector.length > 2000) return null;
  const text =
    element === layer
      ? layerId
      : (
          element.getAttribute('alt') ||
          element.textContent ||
          element.localName
        )
          .trim()
          .replace(/\s+/g, ' ');
  const field =
    clicked.closest('[data-field-id]') ||
    (element.querySelectorAll('[data-field-id]').length === 1
      ? element.querySelector('[data-field-id]')
      : null);
  const property = clicked
    .closest('[data-node-text]')
    ?.getAttribute('data-node-text');
  return {
    layerId,
    ...(field ? { fieldId: field.getAttribute('data-field-id')! } : {}),
    ...(['title', 'body', 'linkLabel'].includes(property || '')
      ? { textProperty: property as 'title' | 'body' | 'linkLabel' }
      : {}),
    ...(clicked.closest('a[data-template-link]')
      ? {
          linkKey: clicked.closest('a')!.getAttribute('data-template-link')!,
          href: clicked.closest('a')!.getAttribute('href') || '',
        }
      : {}),
    selector,
    label:
      `${element === layer ? 'Layer' : element.localName.toUpperCase()} · ${text}`.slice(
        0,
        100,
      ),
  };
}
