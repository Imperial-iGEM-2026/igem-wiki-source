'use client';
import { useState } from 'react';
import {
  Plus,
  Type,
  Image,
  MousePointer2,
  Frame,
  Video,
  AudioLines,
  FileText,
  Box,
  Code2,
  ChevronDown,
  ListCollapse,
  Sigma,
  BookOpen,
} from 'lucide-react';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverTitle,
} from '@/components/ui/popover';
import type { BlockKind } from './canvas-schema';

const items = [
  ['text', 'Text', Type],
  ['equation', 'LaTeX equation', Sigma],
  ['references', 'References', BookOpen],
  ['image', 'Image', Image],
  ['button', 'Button', MousePointer2],
  ['section', 'Frame', Frame],
  ['video', 'Video', Video],
  ['audio', 'Audio', AudioLines],
  ['pdf', 'PDF', FileText],
  ['model', '3D model', Box],
  ['embed', 'Embed', Code2],
  ['html', 'Custom HTML', Code2],
  ['accordion', 'Collapsible', ListCollapse],
] as const;
export function StudioInsertMenu({
  container,
  locked,
  inside,
  onInside,
  disabled,
  onInsert,
}: {
  container?: string;
  locked: boolean;
  inside: boolean;
  onInside: (inside: boolean) => void;
  disabled: boolean;
  onInsert: (kind: BlockKind, inside: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const nested = Boolean(container && inside);
  return (
    <div className="studio-insert-launcher">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger className="studio-insert-button" disabled={disabled}>
          <Plus size={17} />
          <span>Insert element</span>
          <ChevronDown size={14} />
        </PopoverTrigger>
        <PopoverContent
          className="studio-insert-popover"
          align="start"
          sideOffset={8}
        >
          <PopoverTitle>Insert element</PopoverTitle>
          <fieldset
            className="studio-insert-destination"
            aria-label="Insert destination"
          >
            <button
              type="button"
              aria-pressed={!nested}
              onClick={() => onInside(false)}
            >
              On page
            </button>
            <button
              type="button"
              aria-pressed={nested}
              disabled={!container || locked}
              onClick={() => onInside(true)}
            >
              In section
            </button>
          </fieldset>
          <p title={nested ? container : undefined}>
            {nested ? `Inside ${container}` : 'Adds a new element to this page'}
          </p>
          <div className="studio-insert-grid">
            {items.map(([kind, label, Icon]) => (
              <button
                type="button"
                key={kind}
                disabled={disabled || (nested && locked)}
                onClick={() => {
                  onInsert(kind, nested);
                  setOpen(false);
                }}
              >
                <Icon size={22} strokeWidth={1.6} />
                <span>{label}</span>
              </button>
            ))}
          </div>
          <small>
            {container
              ? 'Choose a type to insert it.'
              : 'Select a section to insert elements inside it.'}
          </small>
        </PopoverContent>
      </Popover>
    </div>
  );
}
