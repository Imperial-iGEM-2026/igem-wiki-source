import { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { HexColorPicker } from './hex-color-picker';
import { defaultLoading, validLoading, startSiteLoading } from './site-loading';
import type { HeaderDesign } from './header-schema';

export function LoadingControls({
  design,
  onChange,
  onUpload,
  disabled,
  uploading,
}: {
  design: HeaderDesign;
  onChange: (design: HeaderDesign) => void;
  onUpload: (file: File) => void;
  disabled: boolean;
  uploading: boolean;
}) {
  const d = { ...defaultLoading, ...design.loading };
  const [error, setError] = useState('');
  const stop = useRef<(() => void) | undefined>(undefined);
  useEffect(() => () => stop.current?.(), []);
  const update = (patch: Partial<typeof d>) => {
    const next = { ...d, ...patch };
    if (!validLoading(next)) {
      setError(
        'Use valid settings. Custom CSS can animate the supplied elements; use the image field for assets, without CSS URLs or imports.',
      );
      return;
    }
    setError('');
    onChange({ ...design, loading: next });
  };
  return (
    <div className="studio-header-controls studio-loading-controls">
      <p className="studio-help">
        A welcome screen for every page in this project. Disabled until you
        enable it. Save to apply to your website and future exports.
      </p>
      <label className="studio-toggle" htmlFor="loading-enabled">
        <span>Enable loading animation</span>
        <Switch
          id="loading-enabled"
          checked={d.enabled}
          disabled={disabled}
          onCheckedChange={(enabled) => update({ enabled })}
        />
      </label>
      <button
        className="studio-primary"
        disabled={uploading}
        onClick={() => {
          stop.current?.();
          stop.current = startSiteLoading(
            { ...d, enabled: true },
            'preview',
            true,
          );
        }}
      >
        Preview animation
      </button>
      <p className="studio-help">
        Preview uses your unsaved settings and does not mark the animation as
        seen. Reduced-motion preferences skip the animation.
      </p>
      <fieldset
        disabled={disabled}
        style={{ border: 0, padding: 0, margin: 0, display: 'grid', gap: 14 }}
      >
        <label className="studio-field">
          <span>Show animation</span>
          <select
            value={d.frequency}
            onChange={(e) => update({ frequency: e.target.value })}
          >
            <option value="session">Once per session (default)</option>
            <option value="first">First visit only</option>
            <option value="always">Every page visit</option>
          </select>
        </label>
        <label className="studio-field">
          <span>Animation style</span>
          <select
            value={d.animation}
            onChange={(e) => update({ animation: e.target.value })}
          >
            <option value="pulse">Soft pulse</option>
            <option value="spin">Spin</option>
            <option value="dots">Loading dots</option>
            <option value="custom">Custom CSS animation</option>
          </select>
        </label>
        <label className="studio-field" htmlFor="loading-message">
          <span>Welcome message</span>
          <Input
            id="loading-message"
            value={d.message}
            maxLength={160}
            onChange={(e) => update({ message: e.target.value })}
          />
        </label>
        <label className="studio-field" htmlFor="loading-image">
          <span>Logo or animated image URL</span>
          <Input
            id="loading-image"
            value={d.image}
            placeholder="/api/media/… or https://…"
            onChange={(e) => update({ image: e.target.value })}
          />
        </label>
        <label className="studio-field">
          <span>
            {uploading ? 'Uploading image…' : 'Upload animation image'}
          </span>
          <input
            type="file"
            accept="image/*"
            disabled={uploading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) onUpload(file);
            }}
          />
        </label>
        {design.logo && (
          <button type="button" onClick={() => update({ image: design.logo })}>
            Use website logo
          </button>
        )}
        {d.image && (
          <button type="button" onClick={() => update({ image: '' })}>
            Remove animation image
          </button>
        )}
        <HexColorPicker
          onEnd={() => {}}
          label="Background"
          value={d.background}
          onChange={(background) => update({ background })}
        />
        <HexColorPicker
          onEnd={() => {}}
          label="Animation and text"
          value={d.color}
          onChange={(color) => update({ color })}
        />
        <label className="studio-field" htmlFor="loading-duration">
          <span>Minimum display time (ms)</span>
          <Input
            id="loading-duration"
            type="number"
            min={0}
            max={5000}
            step={100}
            value={d.duration}
            onChange={(e) => {
              const duration = Number(e.target.value);
              update({ duration, timeout: Math.max(d.timeout, duration) });
            }}
          />
        </label>
        <label className="studio-field" htmlFor="loading-timeout">
          <span>Maximum wait (ms)</span>
          <Input
            id="loading-timeout"
            type="number"
            min={Math.max(1000, d.duration)}
            max={10000}
            step={100}
            value={d.timeout}
            onChange={(e) => update({ timeout: Number(e.target.value) })}
          />
        </label>
        {d.animation === 'custom' && (
          <>
            <label className="studio-field">
              <span>Custom animation CSS</span>
              <textarea
                rows={12}
                maxLength={8000}
                value={d.customCss}
                onChange={(e) => update({ customCss: e.target.value })}
                placeholder={
                  '.loader-mark { animation: float 1s ease-in-out infinite alternate; }\n@keyframes float { to { transform: translateY(-12px); } }'
                }
              />
            </label>
            <p className="studio-help">
              Style .loader-content, .loader-mark, .loader-symbol and
              .loader-label. Add your own @keyframes. CSS is isolated from the
              website; the Skip button remains available.
            </p>
          </>
        )}
      </fieldset>
      <p className="studio-help">
        The screen closes when the initial page is ready and the minimum time
        has elapsed, or at the maximum wait. Visitors can skip it or press
        Escape. A session means this browser tab, including page changes and
        reloads.
      </p>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
