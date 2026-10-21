import { CitationText, citationMarkerSource } from './references';
import { useMemo } from 'react';
import katex from 'katex';

export function renderEquation(source: string, displayMode = true) {
  let tex = source.trim();
  for (const [start, end] of [
    ['$$', '$$'],
    ['\\[', '\\]'],
    ['\\(', '\\)'],
    ['$', '$'],
  ]) {
    if (
      tex.startsWith(start) &&
      tex.endsWith(end) &&
      tex.length >= start.length + end.length
    ) {
      tex = tex.slice(start.length, -end.length).trim();
      break;
    }
  }
  if (!tex) return { html: '', error: '' };
  try {
    return {
      html: katex.renderToString(tex, {
        output: 'mathml',
        displayMode,
        throwOnError: true,
        trust: false,
        strict: 'error',
        maxExpand: 1000,
        maxSize: 20,
      }),
      error: '',
    };
  } catch (error) {
    return {
      html: '',
      error:
        error instanceof Error
          ? error.message.replace(/^KaTeX parse error:\s*/, '')
          : 'Check the equation syntax.',
    };
  }
}

export function EquationBlock({ source }: { source: string }) {
  const result = useMemo(() => renderEquation(source), [source]);
  if (result.error)
    return (
      <div className="equation-error" aria-live="polite">
        <strong>Check your LaTeX</strong>
        <p>{result.error}</p>
        <code>{source}</code>
      </div>
    );
  if (!result.html)
    return (
      <p className="equation-placeholder">
        Enter a LaTeX equation in Element settings.
      </p>
    );
  // Only KaTeX's untrusted-input MathML renderer produces this markup.
  return (
    <div
      className="equation-render"
      dangerouslySetInnerHTML={{ __html: result.html }}
    />
  );
}

/** Parse explicit math delimiters; leave prose, escaped dollars and code intact. */
export function splitMathText(text: string) {
  const citation = new RegExp('^' + citationMarkerSource);
  const parts: { text: string; source?: string; display?: boolean }[] = [];
  const escaped = (at: number) => {
    let slashes = 0;
    while (at > 0 && text[--at] === '\\') slashes++;
    return slashes % 2 === 1;
  };
  let start = 0,
    i = 0;
  while (i < text.length) {
    // Citation labels are plain text, including escaped brackets and dollars.
    const citationAt = text.startsWith('\\[@', i) ? i + 1 : i;
    if (text.startsWith('[@', citationAt)) {
      const marker = text.slice(citationAt).match(citation);
      if (marker) { i = citationAt + marker[0].length; continue; }
    }
    if (text[i] === '`' && !escaped(i)) {
      const run = text.slice(i).match(/^`+/)![0];
      const end = text.indexOf(run, i + run.length);
      i = end < 0 ? text.length : end + run.length;
      continue;
    }
    const open =
      !escaped(i) &&
      (text.startsWith('$$', i)
        ? '$$'
        : text.startsWith('\\[', i)
          ? '\\['
          : text.startsWith('\\(', i)
            ? '\\('
            : text[i] === '$'
              ? '$'
              : '');
    if (!open) {
      i++;
      continue;
    }
    const close = open === '\\[' ? '\\]' : open === '\\(' ? '\\)' : open;
    let end = text.indexOf(close, i + open.length);
    while (end >= 0 && escaped(end))
      end = text.indexOf(close, end + close.length);
    if (end < 0) {
      i += open.length;
      continue;
    }
    const source = text.slice(i + open.length, end);
    // Avoid treating typical prices ("$5 and $10") as an equation.
    if (
      !source.trim() ||
      (open === '$' &&
        (/^\s|\s$|\n/.test(source) || /\d/.test(text[end + 1] || '')))
    ) {
      i += open.length;
      continue;
    }
    if (i > start) parts.push({ text: text.slice(start, i) });
    parts.push({
      text: text.slice(i, end + close.length),
      source,
      display: open === '$$' || open === '\\[',
    });
    i = end + close.length;
    start = i;
  }
  if (start < text.length) parts.push({ text: text.slice(start) });
  return parts;
}

export function MathText({ text }: { text: string }) {
  return (
    <>
      {useMemo(
        () =>
          splitMathText(text).map((part, index) => {
            if (part.source === undefined)
              return <CitationText key={index} text={part.text} />;
            const result = renderEquation(part.source, part.display);
            if (result.error)
              return (
                <span
                  key={index}
                  className="inline-math-error"
                  title={result.error}
                >
                  {part.text}
                </span>
              );
            return (
              <span
                key={index}
                className={
                  part.display ? 'text-math-display' : 'text-math-inline'
                }
                dangerouslySetInnerHTML={{ __html: result.html }}
              />
            );
          }),
        [text],
      )}
    </>
  );
}
