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
        'Use valid settings. Custom CSS can animate the supplied elements; use the image field for assets. Vector mode supports local SVG filter references, but no external resources or imports.',
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
            <option value="first">First visit, then after expiry</option>
            <option value="always">Every page visit</option>
          </select>
        </label>
        {d.frequency === 'first' && (
          <label className="studio-field" htmlFor="loading-expiry">
            <span>Replay after (minutes)</span>
            <Input id="loading-expiry" type="number" min={1} max={10080}
              value={d.firstVisitExpiryMinutes}
              onChange={(e) => update({ firstVisitExpiryMinutes: Number(e.target.value) })} />
            <span className="studio-help">Measured from finishing or dismissing the animation, across tabs in this browser. Default: 30 minutes.</span>
          </label>
        )}
        <label className="studio-toggle" htmlFor="loading-symbol">
          <span>Show built-in loading symbol</span>
          <Switch id="loading-symbol" checked={d.showSymbol}
            onCheckedChange={(showSymbol) => update({ showSymbol })} />
        </label>
        <p className="studio-help">Hides the preset spinner or dots only. Your uploaded image and custom animation remain.</p>
        <label className="studio-toggle" htmlFor="loading-skip">
          <span>Show Skip animation button</span>
          <Switch id="loading-skip" checked={d.showSkip}
            onCheckedChange={(showSkip) => update({ showSkip })} />
        </label>
        <p className="studio-help">Escape and the automatic timeout still dismiss the animation. Preview always has a Close button.</p>
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
            <option value="vector">HTML / SVG / JavaScript animation</option>
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
        {d.animation === 'vector' && (
          <>
            <label className="studio-field">
              <span>Animation HTML / SVG</span>
              <textarea rows={10} maxLength={64000} value={d.customHtml}
                onChange={(e) => update({ customHtml: e.target.value })}
                placeholder={'<svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="30" fill="currentColor" /></svg>'} />
            </label>
            <label className="studio-field">
              <span>Animation JavaScript</span>
              <textarea rows={10} maxLength={64000} value={d.customJs}
                onChange={(e) => update({ customJs: e.target.value })}
                placeholder={"document.querySelector('circle').animate([{opacity:0.3},{opacity:1}],{duration:900,iterations:Infinity,direction:'alternate'});"} />
            </label>
            <p className="studio-help">Use inline SVG, canvas, CSS or JavaScript. Code runs after the markup inside an isolated frame. External libraries, network requests and access to Studio are blocked. Use the image animation style for uploaded files. Preview before saving.</p>
          </>
        )}
        {(d.animation === 'custom' || d.animation === 'vector') && (
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
              website; Escape and the timeout remain available.
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
