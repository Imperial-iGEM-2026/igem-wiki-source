'use client';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import type { AccordionItem } from './canvas-schema';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

export const newAccordionItem = (title: string, body = ''): AccordionItem => ({
  id: 'item-' + crypto.randomUUID().slice(0, 8),
  title,
  body,
});

/** Edit the sections of a collapsible element in the Design panel. */
export function AccordionEditor({
  items,
  onChange,
  onEnd,
}: {
  items: AccordionItem[];
  onChange: (items: AccordionItem[], group?: string) => void;
  onEnd: () => void;
}) {
  const update = (
    id: string,
    changes: Partial<AccordionItem>,
    group?: string,
  ) =>
    onChange(
      items.map((item) => (item.id === id ? { ...item, ...changes } : item)),
      group,
    );
  const move = (index: number, delta: number) => {
    const next = [...items];
    const [item] = next.splice(index, 1);
    next.splice(index + delta, 0, item);
    onChange(next);
  };
  return (
    <div className="studio-accordion-editor">
      {items.map((item, index) => (
        <fieldset key={item.id} className="studio-accordion-item">
          <legend>Section {index + 1}</legend>
          <label
            className="studio-field"
            htmlFor={'accordion-title-' + item.id}
          >
            <span>Title</span>
            <Input
              id={'accordion-title-' + item.id}
              value={item.title}
              maxLength={200}
              onChange={(e) =>
                update(
                  item.id,
                  { title: e.target.value },
                  'item-title-' + item.id,
                )
              }
              onBlur={onEnd}
            />
          </label>
          <label className="studio-field" htmlFor={'accordion-body-' + item.id}>
            <span>Text</span>
            <Textarea
              id={'accordion-body-' + item.id}
              value={item.body}
              maxLength={5000}
              rows={3}
              onChange={(e) =>
                update(
                  item.id,
                  { body: e.target.value },
                  'item-body-' + item.id,
                )
              }
              onBlur={onEnd}
            />
          </label>
          <div className="studio-accordion-actions">
            <label>
              <input
                type="checkbox"
                checked={Boolean(item.open)}
                onChange={(e) =>
                  update(item.id, { open: e.target.checked || undefined })
                }
              />
              Open when the page loads
            </label>
            <span>
              <button
                type="button"
                aria-label={'Move section ' + (index + 1) + ' up'}
                disabled={index === 0}
                onClick={() => move(index, -1)}
              >
                <ArrowUp size={14} />
              </button>
              <button
                type="button"
                aria-label={'Move section ' + (index + 1) + ' down'}
                disabled={index === items.length - 1}
                onClick={() => move(index, 1)}
              >
                <ArrowDown size={14} />
              </button>
              <button
                type="button"
                aria-label={'Delete section ' + (index + 1)}
                onClick={() => onChange(items.filter((i) => i.id !== item.id))}
              >
                <Trash2 size={14} />
              </button>
            </span>
          </div>
        </fieldset>
      ))}
      <button
        type="button"
        className="studio-accordion-add"
        disabled={items.length >= 30}
        onClick={() =>
          onChange([
            ...items,
            newAccordionItem('New section', 'Add text here.'),
          ])
        }
      >
        <Plus size={14} /> Add section
      </button>
      <p className="studio-help">
        Readers can open several sections at once. Opening one never changes the
        page address or scroll position.
      </p>
    </div>
  );
}
