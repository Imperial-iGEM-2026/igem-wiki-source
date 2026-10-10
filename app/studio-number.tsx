'use client';
import { useState } from 'react';
import { Input } from '@/components/ui/input';
export function StudioNumber({
  value,
  min,
  max,
  step = 1,
  onCommit,
  onEnd,
  onFocus,
  id,
  label,
  placeholder,
  disabled = false,
}: {
  value: number | undefined;
  min: number;
  max: number;
  step?: number;
  onCommit: (value: number | undefined) => void;
  onEnd?: () => void;
  onFocus?: () => void;
  id?: string;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState<{
    base: number | undefined;
    text: string;
  } | null>(null);
  const text =
    draft && draft.base === value
      ? draft.text
      : value === undefined
        ? ''
        : String(value);
  function commit() {
    if (draft && draft.base === value) {
      const parsed = Number(draft.text);
      if (!draft.text.trim()) onCommit(undefined);
      else if (Number.isFinite(parsed))
        onCommit(
          Math.max(
            min,
            Math.min(max, step === 1 ? Math.round(parsed) : parsed),
          ),
        );
    }
    setDraft(null);
    onEnd?.();
  }
  return (
    <Input
      id={id}
      aria-label={label}
      type="number"
      min={min}
      max={max}
      step={step}
      value={text}
      disabled={disabled}
      placeholder={placeholder}
      onFocus={onFocus}
      onChange={(e) => setDraft({ base: value, text: e.target.value })}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.currentTarget.blur();
        } else if (e.key === 'Escape') {
          e.stopPropagation();
          setDraft(null);
        }
      }}
    />
  );
}
