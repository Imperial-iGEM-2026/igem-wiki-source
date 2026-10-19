'use client';
import { useEffect, useRef } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import type { AccordionItem, BlockKind } from './canvas-schema';
import { StudioInsertMenu } from './studio-insert-menu';
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
  onAdd,
  focusItem,
  onInsert,
  canRemove,
}: {
  items: AccordionItem[];
  onChange: (items: AccordionItem[], group?: string) => void;
  onEnd: () => void;
  onAdd?: () => void;
  focusItem?: { id: string };
  onInsert?: (itemId: string, kind: BlockKind) => void;
  canRemove?: (itemId: string) => boolean;
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!focusItem) return;
    const editor = editorRef.current;
    const title = editor?.querySelector<HTMLInputElement>(
      `#accordion-title-${CSS.escape(focusItem.id)}`,
    );
    if (!title) return;
    const group = editor?.closest('details');
    if (group) group.open = true;
    title.focus({ preventScroll: true });
    title.select();
    title.closest('fieldset')?.scrollIntoView({ block: 'nearest' });
  }, [focusItem]);
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
    <div className="studio-accordion-editor" ref={editorRef}>
      <button
        type="button"
        className="studio-accordion-add"
        disabled={items.length >= 30}
        onClick={() =>
          onAdd
            ? onAdd()
            : onChange([
                ...items,
                newAccordionItem('New subsection', 'Add text here.'),
              ])
        }
      >
        <Plus size={14} /> Add subsection
      </button>
      {items.map((item, index) => (
        <fieldset key={item.id} className="studio-accordion-item">
          <legend>Subsection {index + 1}</legend>
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
          {onInsert && (
            <div className="studio-accordion-add-content">
              <span>Add image or element</span>
              <StudioInsertMenu
                compact
                container={item.title || 'Untitled subsection'}
                locked={false}
                disabled={false}
                inside
                onInside={() => {}}
                onInsert={(kind) => onInsert(item.id, kind)}
              />
            </div>
          )}
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
                aria-label={'Move subsection ' + (index + 1) + ' up'}
                disabled={index === 0}
                onClick={() => move(index, -1)}
              >
                <ArrowUp size={14} />
              </button>
              <button
                type="button"
                aria-label={'Move subsection ' + (index + 1) + ' down'}
                disabled={index === items.length - 1}
                onClick={() => move(index, 1)}
              >
                <ArrowDown size={14} />
              </button>
              <button
                type="button"
                aria-label={'Delete subsection ' + (index + 1)}
                disabled={canRemove && !canRemove(item.id)}
                title={
                  canRemove && !canRemove(item.id)
                    ? 'Unlock nested elements before deleting this subsection'
                    : 'Delete subsection and its elements'
                }
                onClick={() => onChange(items.filter((i) => i.id !== item.id))}
              >
                <Trash2 size={14} />
              </button>
            </span>
          </div>
        </fieldset>
      ))}
      <p className="studio-help">
        Add a subsection above or in Layers. Select its title in Layers to edit
        it here. Use its + button to insert images or other elements inside.
        Readers can open several subsections at once.
      </p>
    </div>
  );
}
