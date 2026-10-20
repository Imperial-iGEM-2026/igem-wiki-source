import type { SectionLinkTarget } from './section-link-targets';
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
  sections,
}: {
  value: string;
  onChange: (value: string) => void;
  pages: [string, string][];
  disabled?: boolean;
  label?: string;
  optional?: boolean;
  sections?: (href: string) => SectionLinkTarget[];
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
  const pageValue = value.split('#')[0];
  const sectionOptions = sections && pages.some(p => p[0] === pageValue) ? sections(pageValue) : [];
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
          value={pages.some((p) => p[0] === pageValue) ? pageValue : ''}
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
              {pages.find((p) => p[0] === pageValue)?.[1] || 'Choose a page'}
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
      {sections && pages.some(p => p[0] === pageValue) && (
        <label className="studio-field"><span>Section on this page</span>
          <select aria-label="Choose a page section" disabled={disabled} value={value.split('#')[1] || ''}
            onChange={event => { const next=pageValue+(event.target.value ? '#'+event.target.value : ''); setUrl(next); setError(''); onChange(next); }}>
            <option value="">Top of page</option>
            {value.includes('#') && !sectionOptions.some(s=>s.anchor===value.split('#')[1]) && <option value={value.split('#')[1]}>Custom or unavailable section</option>}
            {sectionOptions.map(section=><option key={section.anchor} value={section.anchor}>{section.label}</option>)}
          </select>
        </label>
      )}
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
