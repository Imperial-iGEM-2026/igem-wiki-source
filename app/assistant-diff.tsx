/* oxlint-disable jsx-a11y/no-noninteractive-tabindex -- The diff scroll region must be keyboard-scrollable. */
import parse from 'postcss/lib/parse';
import type { DesignTarget } from './studio-target';
import { useMemo } from 'react';
import { FileDiff, Download } from 'lucide-react';
import type { CanvasLayout } from './canvas-schema';
export type DiffFiles = Record<string, string>;
const stable = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(stable)
    : value && typeof value === 'object'
      ? Object.fromEntries(
          Object.entries(value)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => [k, stable(v)]),
        )
      : value;
export function pageDiffFiles(
  page: string,
  layout: CanvasLayout,
  fields: Record<string, { value: string }>,
) {
  const { nodes, customCss, ...settings } = layout;
  const files: DiffFiles = {
    'page.json': JSON.stringify(stable(settings), null, 2),
    'styles.css': customCss || '',
  };
  for (const node of nodes)
    files[`layers/${node.id}.json`] = JSON.stringify(stable(node), null, 2);
  if (fields['site:header']) {
    try {
      files['site/header.json'] = JSON.stringify(
        stable(JSON.parse(fields['site:header'].value)),
        null,
        2,
      );
    } catch {
      files['site/header.json'] = fields['site:header'].value;
    }
  }
  for (const [id, field] of Object.entries(fields)) {
    const belongs =
      page === 'home'
        ? /^(headline|intro|feature|featureBody|title[123]|body[123]|home:[a-z0-9-]+)$/.test(
            id,
          )
        : id.startsWith('wiki:' + page + ':') || id.startsWith(page + ':');
    if (
      belongs ||
      id.startsWith('template:' + page + ':') ||
      id.startsWith('template:header:') ||
      id.startsWith('template:footer:')
    )
      files[`text/${id.replaceAll(':', '-')}.txt`] = field.value;
  }
  return files;
}
/** Limit the history panel to the selected element; proposal review still shows all changes. */
export function selectionDiffFiles(
  files: DiffFiles,
  target: DesignTarget | null,
): DiffFiles {
  if (!target) return files;
  const result: DiffFiles = {};
  const layer = `[data-layer-id="${target.layerId}"]`;
  const wholeLayer = target.selector === layer;
  for (const [file, value] of Object.entries(files)) {
    if (file === 'styles.css') {
      try {
        const css = parse(value);
        css.walkComments((comment) => {
          comment.remove();
        });
        css.walkRules((rule) => {
          const selectors = rule.selectors.filter(
            (selector) =>
              selector === target.selector ||
              selector.startsWith(target.selector + ' > '),
          );
          if (selectors.length) rule.selectors = selectors;
          else rule.remove();
        });
        css.walkAtRules((rule) => {
          if (!rule.nodes?.length) rule.remove();
        });
        result[file] = css.toString().trim();
      } catch {
        result[file] = '';
      }
    } else if (file === `layers/${target.layerId}.json`) {
      if (wholeLayer) result[file] = value;
      else if (target.textProperty) {
        try {
          result[`text/${target.layerId}-${target.textProperty}.txt`] =
            JSON.parse(value)[target.textProperty] || '';
        } catch {
          /* Ignore malformed snapshots. */
        }
      }
    } else if (
      target.fieldId &&
      file === `text/${target.fieldId.replaceAll(':', '-')}.txt`
    )
      result[file] = value;
  }
  return result;
}

export function assistantConversationKey(
  identity: string,
  page: string,
  selector?: string,
) {
  return JSON.stringify([identity, page, selector || 'page']);
}

// Linear-time unified hunks, with unchanged edges trimmed. No Git process or
// quadratic matrix runs on each keystroke. Full patch remains downloadable.
export function unifiedDiff(before: DiffFiles, after: DiffFiles) {
  const lines: string[] = [];
  let added = 0,
    removed = 0;
  for (const file of [
    ...new Set([...Object.keys(before), ...Object.keys(after)]),
  ].sort()) {
    if (before[file] === after[file]) continue;
    const a = before[file] ? before[file].split('\n') : [],
      b = after[file] ? after[file].split('\n') : [];
    let start = 0,
      suffix = 0;
    while (start < a.length && start < b.length && a[start] === b[start])
      start++;
    while (
      suffix < a.length - start &&
      suffix < b.length - start &&
      a[a.length - 1 - suffix] === b[b.length - 1 - suffix]
    )
      suffix++;
    const from = Math.max(0, start - 2),
      oldEnd = a.length - suffix,
      newEnd = b.length - suffix,
      tail = Math.min(2, suffix);
    const oldCount = oldEnd + tail - from,
      newCount = newEnd + tail - from;
    lines.push(
      `diff --git a/${file} b/${file}`,
      ...(!Object.hasOwn(before, file)
        ? ['new file mode 100644']
        : !Object.hasOwn(after, file)
          ? ['deleted file mode 100644']
          : []),
      `--- ${Object.hasOwn(before, file) ? 'a/' + file : '/dev/null'}`,
      `+++ ${Object.hasOwn(after, file) ? 'b/' + file : '/dev/null'}`,
      `@@ -${oldCount ? from + 1 : from},${oldCount} +${newCount ? from + 1 : from},${newCount} @@`,
    );
    lines.push(
      ...a.slice(from, start).map((line) => ' ' + line),
      ...a.slice(start, oldEnd).map((line) => '-' + line),
      ...b.slice(start, newEnd).map((line) => '+' + line),
      ...a.slice(oldEnd, oldEnd + tail).map((line) => ' ' + line),
    );
    added += newEnd - start;
    removed += oldEnd - start;
  }
  return { lines, added, removed };
}
export function AssistantDiff({
  before,
  after,
  label = 'Changes this session',
}: {
  before: DiffFiles;
  after: DiffFiles;
  label?: string;
}) {
  const diff = useMemo(() => unifiedDiff(before, after), [before, after]);
  if (!diff.lines.length) return null;
  return (
    <details className="studio-change-diff" open>
      <summary>
        <FileDiff size={14} />
        <span>{label}</span>
        <b className="added">+{diff.added}</b>
        <b className="removed">−{diff.removed}</b>
      </summary>
      <pre aria-label={label + ' diff'} tabIndex={0}>
        {diff.lines.slice(0, 200).map((line, index) => (
          <span
            key={index}
            className={
              line.startsWith('+')
                ? 'added'
                : line.startsWith('-')
                  ? 'removed'
                  : ''
            }
          >
            {line}
            {'\n'}
          </span>
        ))}
        {diff.lines.length > 200 &&
          '… Preview shortened. Download the full diff below.\n'}
      </pre>
      <button
        type="button"
        className="studio-diff-download"
        onClick={() => {
          const url = URL.createObjectURL(
            new Blob([diff.lines.join('\n') + '\n'], { type: 'text/plain' }),
          );
          const link = document.createElement('a');
          link.href = url;
          link.download = 'page-changes.diff';
          link.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        }}
      >
        <Download size={12} /> Download diff
      </button>
    </details>
  );
}
