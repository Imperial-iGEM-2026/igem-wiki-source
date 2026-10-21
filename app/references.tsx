import { referenceAnchor } from './reference-anchor';
import { LinkedText } from './text-links';
import { createContext, useContext } from 'react';
import type { CanvasLayout, ReferenceEntry } from './canvas-schema';
export type ReferenceTarget = { number: number; text: string; anchor: string };
export const ReferenceContext = createContext<Record<string, ReferenceTarget>>(
  {},
);
export const citationToken = (nodeId: string, id: string, label = '') =>
  `[@${nodeId}/${id}${label.trim() ? '|' + label.trim().replace(/([\\\[\]])/g, '\\$1').replace(/[\r\n]+/g, ' ') : ''}]`;
export const citationMarkerSource = String.raw`\[@([a-zA-Z0-9-]{1,90}\/[a-zA-Z0-9-]{1,90})(?:\|((?:\\.|[^\]\\\r\n])+))?\]`;
export function referenceIndex(layout: CanvasLayout) {
  const map = new Map(layout.nodes.map((n) => [n.id, n]));
  const result: Record<string, ReferenceTarget> = {};
  let number = 0;
  for (const id of layout.order) {
    const node = map.get(id);
    if (node?.kind !== 'references') continue;
    let ancestor = node;
    let hidden = false;
    const visited = new Set<string>();
    while (ancestor && !visited.has(ancestor.id)) {
      visited.add(ancestor.id);
      if (ancestor.hidden || ancestor.deleted) hidden = true;
      ancestor = map.get(ancestor.parentId || '')!;
    }
    if (hidden) continue;
    for (const ref of node.references || []) {
      const key = `${id}/${ref.id}`;
      result[key] = {
        number: ++number,
        text: ref.text,
        anchor: referenceAnchor(id, ref.id),
      };
    }
  }
  return result;
}
export function ReferenceList({
  nodeId,
  entries,
}: {
  nodeId: string;
  entries: ReferenceEntry[];
}) {
  const index = useContext(ReferenceContext);
  return (
    <ol className="reference-list" role="list">
      {entries.map((entry, i) => {
        const target = index[`${nodeId}/${entry.id}`];
        return (
          <li
            key={entry.id}
            id={target?.anchor}
            className="reference-entry"
            tabIndex={-1}
            value={target?.number || i + 1}
          >
            <span className="reference-number">
              [{target?.number || i + 1}]
            </span>
            <div className="reference-details">
              <span>
                {entry.text || 'Add reference details in Element settings.'}
              </span>
              {entry.url && (
                <a
                  href={entry.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="reference-source"
                >
                  View source ↗
                </a>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
export function CitationText({ text }: { text: string }) {
  const index = useContext(ReferenceContext);
  // Backtick code and escaped markers remain literal, as do ordinary [1] labels.
  const pattern = new RegExp(String.raw`(` + '`' + String.raw`+)[\s\S]*?\1|\\\[@(?:\\.|[^\]\\])*\]|` + citationMarkerSource, 'g');
  const children = [];
  let start = 0;
  for (const match of text.matchAll(pattern)) {
    if (!match[2]) continue;
    children.push(<LinkedText key={"text-" + match.index} text={text.slice(start, match.index)} />);
    const target = index[match[2]];
    const label = match[3]?.replace(/\\([\[\]\\])/g, '$1').trim();
    children.push(
      target ? (
        <a
          key={match.index}
          className={'inline-citation' + (label ? ' inline-citation-label' : '')}
          data-citation-link
          href={'#' + encodeURIComponent(target.anchor)}
          title={target.text}
          aria-label={(label || 'Reference ' + target.number) + ': ' + target.text}
        >
          {label || `[${target.number}]`}
        </a>
      ) : (
        <span
          key={match.index}
          className="citation-missing"
          title="This reference was removed or is hidden on this page."
        >
          [reference unavailable]
        </span>
      ),
    );
    start = match.index! + match[0].length;
  }
  children.push(<LinkedText key="last-text" text={text.slice(start)} />);
  return <>{children}</>;
}
