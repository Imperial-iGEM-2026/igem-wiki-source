import { LinkEditor } from './link-editor';
/* oxlint-disable next/no-img-element -- Private uploaded logos use authenticated media URLs. */
import { useRef } from 'react';
import { FontPicker } from './font-picker';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import {
  Network,
  Upload,
  Plus,
  ArrowUp,
  ArrowDown,
  Trash2,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { HexColorPicker } from './hex-color-picker';
import { type HeaderDesign, type HeaderLink } from './header-schema';
export {
  HEADER_FIELD,
  parseHeader,
  validHeader,
  type HeaderDesign,
} from './header-schema';
import { validHeader } from './header-schema';
export function headerStyle(d: HeaderDesign) {
  return {
    background: d.background,
    color: d.color,
    minHeight: d.height,
    height: 'auto',
    padding: `${d.paddingY}px ${d.paddingX}%`,
    borderBottom: `${d.borderWidth}px solid ${d.borderColor}`,
    fontFamily: d.fontFamily,
    '--header-nav-size': `${d.navSize}px`,
    '--header-nav-gap': `${d.navGap}px`,
    '--header-ink': d.color,
  };
}
export function HeaderBrand({
  design,
  fallback,
}: {
  design: HeaderDesign;
  fallback: string;
}) {
  return (
    <span
      className="site-brand-content"
      style={{ fontSize: design.fontSize, fontFamily: design.fontFamily }}
    >
      {design.showLogo &&
        (design.logo ? (
          <img
            className="site-brand-logo"
            src={design.logo}
            alt={design.logoAlt}
            style={{ width: design.logoSize, height: design.logoSize }}
          />
        ) : (
          <Network size={design.logoSize} />
        ))}
      {design.showName && <span>{design.name || fallback}</span>}
    </span>
  );
}

type HeaderPage = { slug: string; title: string; group: string };
export function defaultHeaderLinks(pages: HeaderPage[]): HeaderLink[] {
  return pages.map((p) => ({
    label: p.title,
    href: p.slug === 'home' ? '/' : '/' + p.slug,
    group: p.slug === 'home' || p.slug === 'judging' ? '' : p.group,
    hidden: false,
  }));
}
function Picker({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  options: [string, string][];
  disabled: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <div className="studio-field">
      <span>{label}</span>
      <Select
        value={value}
        disabled={disabled}
        onValueChange={(v) => {
          if (v !== null) onChange(v);
        }}
      >
        <SelectTrigger aria-label={label}>
          <SelectValue>
            {options.find((o) => o[0] === value)?.[1] || value}
          </SelectValue>
        </SelectTrigger>
        <SelectContent
          className="studio-select-menu"
          align="start"
          alignItemWithTrigger={false}
        >
          {options.map(([id, text]) => (
            <SelectItem key={id} value={id}>
              {text}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
export function HeaderControls({
  design,
  onChange,
  onUpload,
  disabled,
  pages,
  uploading = false,
  progress = 0,
}: {
  design: HeaderDesign;
  onChange: (d: HeaderDesign) => void;
  onUpload: (file: File) => void;
  disabled: boolean;
  pages: HeaderPage[];
  uploading?: boolean;
  progress?: number;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const links = design.links ?? defaultHeaderLinks(pages);
  const destinations: [string, string][] = pages.map((p) => [
    p.slug === 'home' ? '/' : '/' + p.slug,
    p.title,
  ]);
  function updateLink(index: number, patch: Partial<HeaderLink>) {
    onChange({
      ...design,
      links: links.map((link, i) =>
        i === index ? { ...link, ...patch } : link,
      ),
    });
  }
  function moveLink(index: number, step: number) {
    const next = [...links];
    [next[index], next[index + step]] = [next[index + step], next[index]];
    onChange({ ...design, links: next });
  }
  const number = (
    key:
      | 'height'
      | 'logoSize'
      | 'fontSize'
      | 'navSize'
      | 'navGap'
      | 'paddingX'
      | 'paddingY'
      | 'borderWidth',
    label: string,
    min: number,
    max: number,
  ) => (
    <label className="studio-field" htmlFor={'header-' + key} key={key}>
      <span>{label}</span>
      <Input
        id={'header-' + key}
        type="number"
        min={min}
        max={max}
        value={design[key]}
        disabled={disabled}
        onChange={(e) => {
          const next = { ...design, [key]: Number(e.target.value) };
          if (validHeader(next)) onChange(next);
        }}
      />
    </label>
  );
  const toggle = (
    key: 'navigation' | 'showLogo' | 'showName',
    label: string,
  ) => (
    <label className="studio-toggle" htmlFor={'header-' + key}>
      <span>{label}</span>
      <Switch
        id={'header-' + key}
        disabled={disabled}
        checked={design[key]}
        onCheckedChange={(v) => onChange({ ...design, [key]: v })}
      />
    </label>
  );
  return (
    <div className="studio-header-controls">
      <p className="studio-help">
        Changes apply to every page in this project.
      </p>
      <details
        className="studio-group studio-design-group"
        open
        id="header-brand-controls"
      >
        <summary>Name & logo</summary>
        <div className="studio-design-group-body">
          <label className="studio-field" htmlFor="studio-header-name">
            <span>Site name</span>
            <Input
              id="studio-header-name"
              value={design.name}
              placeholder="prion collective"
              maxLength={100}
              disabled={disabled}
              onChange={(e) => onChange({ ...design, name: e.target.value })}
            />
          </label>
          {toggle('showName', 'Show site name')}
          <div className="studio-logo-upload">
            <div className="studio-logo-thumbnail">
              {design.logo ? (
                <img src={design.logo} alt={design.logoAlt} />
              ) : (
                <Network size={25} />
              )}
            </div>
            <button
              type="button"
              disabled={disabled}
              onClick={() => fileInput.current?.click()}
            >
              <Upload size={14} />
              {uploading
                ? `Uploading ${progress}%`
                : design.logo
                  ? 'Replace logo'
                  : 'Choose logo'}
            </button>
            <input
              ref={fileInput}
              type="file"
              hidden
              aria-label="Choose logo file"
              accept="image/png,image/jpeg,image/webp"
              disabled={disabled}
              onChange={(e) => {
                if (e.target.files?.[0]) onUpload(e.target.files[0]);
                e.target.value = '';
              }}
            />
          </div>
          <p className="studio-help">PNG, JPG or WebP</p>
          {design.logo && (
            <button
              type="button"
              disabled={disabled}
              onClick={() => onChange({ ...design, logo: '' })}
            >
              Use default logo
            </button>
          )}
          {toggle('showLogo', 'Show logo')}
          <label className="studio-field" htmlFor="header-logo-alt">
            <span>Logo description</span>
            <Input
              id="header-logo-alt"
              value={design.logoAlt}
              maxLength={200}
              disabled={disabled}
              onChange={(e) => onChange({ ...design, logoAlt: e.target.value })}
            />
          </label>
          <LinkEditor
            optional={false}
            label="Logo & name link"
            value={design.brandHref}
            pages={destinations}
            disabled={disabled}
            onChange={(brandHref) => onChange({ ...design, brandHref })}
          />
          <div className="studio-grid">
            {number('logoSize', 'Logo size · px', 16, 100)}
            {number('fontSize', 'Name size · px', 12, 48)}
          </div>
          <div className="studio-field">
            <span>Header font</span>
            <FontPicker
              value={design.fontFamily}
              disabled={disabled}
              onChange={(fontFamily) => onChange({ ...design, fontFamily })}
            />
          </div>
        </div>
      </details>
      <details className="studio-group studio-design-group" open>
        <summary>Layout & colours</summary>
        <div className="studio-design-group-body">
          <Picker
            label="Header layout"
            value={design.layout}
            options={[
              ['split', 'Logo left, links right'],
              ['centered', 'Centered, two rows'],
              ['reversed', 'Links left, logo right'],
            ]}
            disabled={disabled}
            onChange={(layout) =>
              onChange({ ...design, layout: layout as HeaderDesign['layout'] })
            }
          />
          <div className="studio-grid">
            {number('height', 'Minimum height · px', 48, 180)}
            {number('paddingX', 'Side padding · %', 0, 15)}
            {number('paddingY', 'Vertical padding · px', 0, 64)}
            {number('borderWidth', 'Bottom border · px', 0, 8)}
          </div>
          {(['background', 'color', 'borderColor'] as const).map((key) => (
            <div className="studio-field" key={key}>
              <span>
                {
                  {
                    background: 'Background',
                    color: 'Text colour',
                    borderColor: 'Border colour',
                  }[key]
                }
              </span>
              <HexColorPicker
                value={design[key]}
                disabled={disabled}
                onChange={(v) => onChange({ ...design, [key]: v })}
                onEnd={() => {}}
                label={'Header ' + key}
              />
            </div>
          ))}
        </div>
      </details>
      <details
        className="studio-group studio-design-group"
        open
        id="header-navigation-controls"
      >
        <summary>Navigation</summary>
        <div className="studio-design-group-body">
          {toggle('navigation', 'Show navigation')}
          <div className="studio-grid">
            {number('navSize', 'Link size · px', 10, 32)}
            {number('navGap', 'Link gap · px', 0, 80)}
          </div>
          <p className="studio-help">
            Rename links, choose their pages and set a menu group. Leave the
            group empty for a top-level link.
          </p>
          {links.map((link, index) => (
            <details className="studio-header-link" key={index}>
              <summary>
                {link.label || 'Untitled link'}
                <small>
                  {link.hidden ? 'Hidden' : link.group || 'Top level'}
                </small>
              </summary>
              <div>
                <label
                  className="studio-field"
                  htmlFor={'header-link-label-' + index}
                >
                  <span>Link label</span>
                  <Input
                    id={'header-link-label-' + index}
                    value={link.label}
                    maxLength={80}
                    disabled={disabled}
                    onChange={(e) =>
                      updateLink(index, { label: e.target.value })
                    }
                  />
                </label>
                <LinkEditor
                  optional={false}
                  label={'Destination for ' + (link.label || 'link')}
                  value={link.href}
                  pages={destinations}
                  disabled={disabled}
                  onChange={(href) => updateLink(index, { href })}
                />
                <label
                  className="studio-field"
                  htmlFor={'header-link-group-' + index}
                >
                  <span>Menu group</span>
                  <Input
                    id={'header-link-group-' + index}
                    value={link.group}
                    placeholder="Top level"
                    maxLength={60}
                    disabled={disabled}
                    onChange={(e) =>
                      updateLink(index, { group: e.target.value })
                    }
                  />
                </label>
                <label
                  className="studio-toggle"
                  htmlFor={'header-link-visible-' + index}
                >
                  <span>Visible</span>
                  <Switch
                    id={'header-link-visible-' + index}
                    checked={!link.hidden}
                    disabled={disabled}
                    onCheckedChange={(v) => updateLink(index, { hidden: !v })}
                  />
                </label>
                <div className="studio-header-link-actions">
                  <button
                    type="button"
                    aria-label={'Move ' + link.label + ' up'}
                    disabled={disabled || index === 0}
                    onClick={() => moveLink(index, -1)}
                  >
                    <ArrowUp size={14} />
                  </button>
                  <button
                    type="button"
                    aria-label={'Move ' + link.label + ' down'}
                    disabled={disabled || index === links.length - 1}
                    onClick={() => moveLink(index, 1)}
                  >
                    <ArrowDown size={14} />
                  </button>
                  <button
                    type="button"
                    aria-label={'Remove ' + link.label}
                    disabled={disabled}
                    onClick={() =>
                      onChange({
                        ...design,
                        links: links.filter((_, i) => i !== index),
                      })
                    }
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </details>
          ))}
          <div className="studio-header-link-actions">
            <button
              type="button"
              disabled={disabled || links.length >= 100}
              onClick={() =>
                onChange({
                  ...design,
                  links: [
                    ...links,
                    { label: 'New link', href: '/', group: '', hidden: false },
                  ],
                })
              }
            >
              <Plus size={14} />
              Add link
            </button>
            <button
              type="button"
              disabled={disabled || design.links === null}
              onClick={() => onChange({ ...design, links: null })}
            >
              Default navigation
            </button>
          </div>
        </div>
      </details>
    </div>
  );
}
