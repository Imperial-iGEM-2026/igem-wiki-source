'use client';
import { useState, type CSSProperties } from 'react';
import { Check } from 'lucide-react';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverTitle,
} from '@/components/ui/popover';
import { normalizeHex } from './hex-color';

const palette = [
  '#FFFFFF',
  '#E5E7EB',
  '#64748B',
  '#111827',
  '#347CF6',
  '#8B5CF6',
  '#EC4899',
  '#EF4444',
  '#F59E0B',
  '#FACC15',
  '#22C55E',
  '#176E51',
];

export function HexColorPicker({
  label,
  value,
  compact = false,
  disabled = false,
  onChange,
  onEnd,
}: {
  label: string;
  value: string;
  compact?: boolean;
  disabled?: boolean;
  onChange: (value: string) => void;
  onEnd: () => void;
}) {
  const colour = normalizeHex(value) || '#FFFFFF';
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(colour);
  const [error, setError] = useState(false);
  function commit(next: string) {
    if (disabled) return;
    const hex = normalizeHex(next);
    if (!hex) {
      setError(true);
      return;
    }
    setError(false);
    setDraft(hex);
    if (hex !== colour) {
      onChange(hex);
      onEnd();
    }
  }
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setDraft(colour);
          setError(false);
        }
      }}
    >
      <PopoverTrigger
        disabled={disabled}
        aria-label={`${label}: ${colour}`}
        title={`${label}: ${colour}`}
        className={compact ? 'studio-dock-colour' : 'studio-hex-trigger'}
        style={{ '--swatch': colour } as CSSProperties}
      >
        {compact ? (
          <span>{label === 'Text colour' ? 'A' : 'Fill'}</span>
        ) : (
          <>
            <i aria-hidden="true" />
            <span>{colour}</span>
          </>
        )}
      </PopoverTrigger>
      <PopoverContent className="studio-colour-popover" sideOffset={8}>
        <PopoverTitle>{label}</PopoverTitle>
        <div
          className="studio-hex-preview"
          style={{ backgroundColor: normalizeHex(draft) || colour }}
        />
        <label className="studio-hex-field">
          <span>Hex colour</span>
          <div>
            <input
              aria-label={`${label} hex code`}
              value={draft}
              maxLength={7}
              spellCheck={false}
              aria-invalid={error}
              disabled={disabled}
              onChange={(event) => {
                setDraft(event.target.value);
                setError(false);
              }}
              onBlur={() => commit(draft)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  event.stopPropagation();
                  commit(draft);
                }
                if (event.key === 'Escape') {
                  event.stopPropagation();
                  setOpen(false);
                }
              }}
            />
            <button
              type="button"
              aria-label="Apply hex colour"
              disabled={disabled}
              onClick={() => commit(draft)}
            >
              <Check size={16} />
            </button>
          </div>
        </label>
        {error && (
          <p role="alert" className="studio-hex-error">
            Use a hex code such as #347CF6 or #FFF.
          </p>
        )}
        <fieldset className="studio-colour-palette" aria-label="Colour palette">
          {palette.map((hex) => (
            <button
              key={hex}
              type="button"
              title={hex}
              aria-label={hex}
              aria-pressed={colour === hex}
              disabled={disabled}
              style={{ backgroundColor: hex }}
              onClick={() => commit(hex)}
            />
          ))}
        </fieldset>
      </PopoverContent>
    </Popover>
  );
}
