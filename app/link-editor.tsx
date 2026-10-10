import { useId, useState } from 'react';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { safeLink } from './link-url';
export function LinkEditor({
  value,
  onChange,
  pages,
  disabled = false,
  label = 'Link destination',
  optional = true,
}: {
  value: string;
  onChange: (value: string) => void;
  pages: [string, string][];
  disabled?: boolean;
  label?: string;
  optional?: boolean;
}) {
  const id = useId();
  const [url, setUrl] = useState(value);
  const [error, setError] = useState('');
  const [sourceValue, setSourceValue] = useState(value);
  if (sourceValue !== value) {
    setSourceValue(value);
    setUrl(value);
    setError('');
  }
  function apply() {
    const next = url.trim();
    if ((next || !optional) && !safeLink(next)) {
      setError('Use https://, http://, mailto:, tel:, or a page address.');
      return;
    }
    setError('');
    onChange(next);
  }
  return (
    <div className="studio-link-editor">
      <label className="studio-field" htmlFor={id}>
        <span>{label}</span>
        <Input
          id={id}
          value={url}
          disabled={disabled}
          maxLength={2048}
          placeholder="https://example.org"
          onChange={(e) => {
            setUrl(e.target.value);
            setError('');
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              apply();
            }
          }}
        />
      </label>
      <div className="studio-link-actions">
        <Select
          value={pages.some((p) => p[0] === value) ? value : ''}
          disabled={disabled}
          onValueChange={(v) => {
            if (v) {
              setUrl(v);
              setError('');
              onChange(v);
            }
          }}
        >
          <SelectTrigger
            aria-label="Choose a website page"
            className="studio-select"
          >
            <SelectValue placeholder="Choose a page">
              {pages.find((p) => p[0] === value)?.[1] || 'Choose a page'}
            </SelectValue>
          </SelectTrigger>
          <SelectContent
            className="studio-select-menu"
            alignItemWithTrigger={false}
          >
            {pages.map(([href, title]) => (
              <SelectItem key={href} value={href}>
                {title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <button
          type="button"
          disabled={disabled || url === value}
          onClick={apply}
        >
          Set link
        </button>
      </div>
      {optional && value && (
        <button
          type="button"
          className="studio-link-clear"
          disabled={disabled}
          onClick={() => {
            setUrl('');
            onChange('');
          }}
        >
          Remove link
        </button>
      )}
      {error && (
        <p className="studio-css-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
