import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { ReferenceEntry } from './canvas-schema';
import { citationToken } from './references';
export const newReference = (): ReferenceEntry => ({
  id: crypto.randomUUID(),
  text: '',
  url: '',
});
export function ReferencesEditor({
  nodeId,
  entries,
  onChange,
  onEnd,
}: {
  nodeId: string;
  entries: ReferenceEntry[];
  onChange: (entries: ReferenceEntry[], group?: string) => void;
  onEnd: () => void;
}) {
  const [message, setMessage] = useState('');
  const update = (id: string, change: Partial<ReferenceEntry>, key: string) =>
    onChange(
      entries.map((entry) =>
        entry.id === id ? { ...entry, ...change } : entry,
      ),
      key,
    );
  const move = (i: number, delta: number) => {
    const next = [...entries];
    const [item] = next.splice(i, 1);
    next.splice(i + delta, 0, item);
    onChange(next);
    onEnd();
  };
  return (
    <div className="references-editor">
      <p>
        Add your sources, then copy a citation and paste it into any text on
        this page. It appears as a numbered link.
      </p>
      {entries.map((entry, i) => (
        <fieldset key={entry.id}>
          <legend>Source {i + 1}</legend>
          <label className="studio-field" htmlFor={'ref-text-' + entry.id}>
            <span>Reference details</span>
            <Textarea
              id={'ref-text-' + entry.id}
              value={entry.text}
              rows={3}
              maxLength={12000}
              placeholder="Authors. Title. Journal or publisher, year."
              onChange={(e) =>
                update(entry.id, { text: e.target.value }, entry.id + '-text')
              }
              onBlur={onEnd}
            />
          </label>
          <label className="studio-field" htmlFor={'ref-url-' + entry.id}>
            <span>Source URL (optional)</span>
            <Input
              id={'ref-url-' + entry.id}
              value={entry.url}
              placeholder="https://doi.org/…"
              onChange={(e) =>
                update(entry.id, { url: e.target.value }, entry.id + '-url')
              }
              onBlur={onEnd}
            />
          </label>
          {entry.url && !/^https?:\/\//.test(entry.url) && (
            <p className="reference-url-error">
              Use a complete http:// or https:// URL.
            </p>
          )}
          <div className="reference-editor-actions">
            <button
              type="button"
              onClick={() => {
                if (!navigator.clipboard) {
                  setMessage('Copy the citation marker below.');
                  return;
                }
                void navigator.clipboard
                  .writeText(citationToken(nodeId, entry.id))
                  .then(() =>
                    setMessage('Citation copied. Paste it into your text.'),
                  )
                  .catch(() => setMessage('Copy the citation marker below.'));
              }}
            >
              Copy citation
            </button>
            <button
              type="button"
              aria-label={'Move source ' + (i + 1) + ' up'}
              disabled={i === 0}
              onClick={() => move(i, -1)}
            >
              ↑
            </button>
            <button
              type="button"
              aria-label={'Move source ' + (i + 1) + ' down'}
              disabled={i === entries.length - 1}
              onClick={() => move(i, 1)}
            >
              ↓
            </button>
            <button
              type="button"
              onClick={() => {
                onChange(entries.filter((e) => e.id !== entry.id));
                onEnd();
              }}
            >
              Remove
            </button>
          </div>
          <details>
            <summary>Citation marker</summary>
            <code className="reference-token">
              {citationToken(nodeId, entry.id)}
            </code>
          </details>
        </fieldset>
      ))}
      <button
        type="button"
        onClick={() => {
          onChange([...entries, newReference()]);
          onEnd();
        }}
      >
        + Add reference
      </button>
      <p aria-live="polite">{message}</p>
    </div>
  );
}
