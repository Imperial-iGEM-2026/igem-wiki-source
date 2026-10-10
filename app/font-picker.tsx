'use client';
import { useRef, useState } from 'react';
import {
  Combobox,
  ComboboxTrigger,
  ComboboxContent,
  ComboboxInput,
  ComboboxList,
  ComboboxItem,
  ComboboxEmpty,
} from '@/components/ui/combobox';
import { filterFonts, selectedFont, type StudioFont } from './studio-fonts';

export function FontPicker({
  value,
  disabled,
  onChange,
}: {
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const anchor = useRef<HTMLButtonElement>(null);
  const [query, setQuery] = useState('');
  const font = selectedFont(value);
  return (
    <Combobox
      items={filterFonts(query)}
      value={font || null}
      filter={null}
      autoHighlight
      inputValue={query}
      onInputValueChange={setQuery}
      onOpenChange={() => setQuery('')}
      itemToStringLabel={(item: StudioFont) => item.label}
      onValueChange={(next) => {
        if (next && !disabled) onChange(next.value);
      }}
    >
      <ComboboxTrigger
        ref={anchor}
        className="studio-dock-font"
        disabled={disabled}
        aria-label="Font family"
        title={font?.label || value}
      >
        <span>{font?.label || value.split(',')[0].replace(/["']/g, '')}</span>
      </ComboboxTrigger>
      <ComboboxContent
        className="studio-font-menu"
        aria-label="Choose a font"
        anchor={anchor}
        align="start"
        side="bottom"
        sideOffset={8}
      >
        <ComboboxInput
          aria-label="Search fonts"
          placeholder="Search fonts or styles…"
          showTrigger={false}
        />
        <ComboboxEmpty>No matching fonts</ComboboxEmpty>
        <ComboboxList>
          {(item: StudioFont) => (
            <ComboboxItem key={item.value} value={item}>
              <span style={{ fontFamily: item.value }}>{item.label}</span>
              <small>{item.category}</small>
            </ComboboxItem>
          )}
        </ComboboxList>
        <p className="studio-font-note">
          Device fonts · Appearance depends on installed fonts.
        </p>
      </ComboboxContent>
    </Combobox>
  );
}
