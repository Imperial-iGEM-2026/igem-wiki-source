'use client';
import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
import {
  AlignLeft,
  AlignCenter,
  AlignRight,
  Bold,
  Italic,
  Sparkles,
  Type,
  Square,
  ArrowUpLeft,
  Pencil,
  ArrowUp,
  ImagePlus,
  GripHorizontal,
} from 'lucide-react';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { FontPicker } from './font-picker';
import { HexColorPicker } from './hex-color-picker';
import { StudioNumber } from './studio-number';
import { RotationPicker } from './rotation-picker';
import { placeSelectionDock, type DockScope } from './selection-style';
import type { DesignTarget } from './studio-target';

type DockView = {
  left: number;
  top: number;
  width: number;
  text: boolean;
  media: boolean;
  replaceable: boolean;
  fontSize: number;
  family: string;
  bold: boolean;
  italic: boolean;
  align: string;
  color: string;
  fill: string;
  radius: number;
  padding: number;
  fit: string;
  rotation: number;
};
function hex(value: string, fallback: string) {
  const rgb = value.match(/^rgba?\(\s*(\d+)[, ]+\s*(\d+)[, ]+\s*(\d+)/);
  return rgb
    ? '#' +
        rgb
          .slice(1, 4)
          .map((n) => Number(n).toString(16).padStart(2, '0'))
          .join('')
    : fallback;
}

export function SelectionDock({
  target,
  artboard,
  stage,
  revision,
  zoom,
  scope,
  disabled,
  onStyle,
  onEnd,
  onSend,
  onLayer,
  onEditText,
  onEditInline,
  onReplaceImage,
  uploadProgress,
  count = 1,
}: {
  /** How many elements the dock styles at once (shown instead of the label). */
  count?: number;
  target: DesignTarget;
  artboard: RefObject<HTMLDivElement | null>;
  stage: RefObject<HTMLDivElement | null>;
  revision: unknown;
  zoom: number;
  scope: DockScope;
  disabled: boolean;
  onStyle: (property: string, value: string, group?: string) => void;
  onEnd: () => void;
  onSend: (message: string) => void;
  onLayer: () => void;
  onEditText?: () => void;
  onEditInline?: () => void;
  onReplaceImage?: (file: File) => void;
  uploadProgress?: number;
}) {
  const imageInput = useRef<HTMLInputElement>(null);
  const dock = useRef<HTMLDivElement>(null);
  const controls = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<DockView | null>(null);
  const [message, setMessage] = useState('');
  const [showAssistant, setShowAssistant] = useState(false);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const moving = useRef<{
    x: number;
    y: number;
    left: number;
    top: number;
  } | null>(null);
  const dockVisible = view !== null;
  useLayoutEffect(() => {
    const element = artboard.current?.querySelector(target.selector);
    const area = stage.current;
    if (!element || !area) {
      const frame = requestAnimationFrame(() => setView(null));
      return () => cancelAnimationFrame(frame);
    }
    const clampPosition = (left: number, top: number) => {
      const r = stage.current?.getBoundingClientRect();
      return {
        left: Math.max(
          r?.left || 0,
          Math.min(
            (r?.right || window.innerWidth) -
              (dock.current?.offsetWidth || 320),
            left,
          ),
        ),
        top: Math.max(
          r?.top || 0,
          Math.min(
            (r?.bottom || window.innerHeight) -
              (dock.current?.offsetHeight || 120),
            top,
          ),
        ),
      };
    };
    let frame = 0;
    let appearance: Omit<DockView, 'left' | 'top' | 'width'> | null = null;
    let cachedToolWidth = 0;
    const measure = () => {
      // Size from the tools, not the caption or the chat input's intrinsic width.
      const row = controls.current;
      const tools =
        row && !cachedToolWidth
          ? Array.from(row.children).filter((child) => {
              const position = getComputedStyle(child).position;
              return (
                child.getBoundingClientRect().width > 0 &&
                position !== 'absolute' &&
                position !== 'fixed'
              );
            })
          : [];
      const toolWidth =
        cachedToolWidth ||
        (row
          ? tools.reduce((total, child) => {
              const style = getComputedStyle(child);
              return (
                total +
                child.getBoundingClientRect().width +
                (parseFloat(style.marginLeft) || 0) +
                (parseFloat(style.marginRight) || 0)
              );
            }, 0) +
            Math.max(0, tools.length - 1) *
              (parseFloat(getComputedStyle(row).columnGap) || 0) +
            18
          : 440);
      if (row) cachedToolWidth = toolWidth;
      const position = placeSelectionDock(
        element.getBoundingClientRect(),
        area.getBoundingClientRect(),
        dock.current?.offsetHeight || 98,
        { width: window.innerWidth, height: window.innerHeight },
        Math.ceil(toolWidth),
      );
      if (!position) {
        setView((previous) => (previous === null ? previous : null));
        return;
      }
      if (!appearance) {
        const style = getComputedStyle(element);
        const family = style.fontFamily;
        const text =
          element.matches(
            'h1,h2,h3,h4,h5,h6,p,a,button,span,label,blockquote,figcaption,li',
          ) ||
          (!element.querySelector(
            'div,section,article,p,h1,h2,h3,img,video,iframe',
          ) &&
            Boolean(element.textContent?.trim()));
        appearance = {
          text,
          media: element.matches('img,video'),
          replaceable:
            element.closest('[data-layer-id]')?.querySelectorAll('img')
              .length === 1,
          fontSize: Math.round(parseFloat(style.fontSize) * 10) / 10,
          family,
          bold: Number(style.fontWeight) >= 600 || style.fontWeight === 'bold',
          italic: style.fontStyle === 'italic',
          align:
            style.textAlign === 'start'
              ? 'left'
              : style.textAlign === 'end'
                ? 'right'
                : style.textAlign,
          color: hex(style.color, '#222222'),
          fill: hex(style.backgroundColor, '#ffffff'),
          radius: parseFloat(style.borderTopLeftRadius) || 0,
          padding: parseFloat(style.paddingTop) || 0,
          fit: style.objectFit,
          rotation: Math.round((parseFloat(style.rotate) || 0) * 10) / 10,
        };
      }
      const next: DockView = {
        ...position,
        ...clampPosition(position.left + offset.x, position.top + offset.y),
        ...appearance,
      };
      setView((previous) =>
        JSON.stringify(previous) === JSON.stringify(next) ? previous : next,
      );
    };
    const schedule = () => {
      if (!frame)
        frame = requestAnimationFrame(() => {
          frame = 0;
          measure();
        });
    };
    const observer = new ResizeObserver(() => {
      cachedToolWidth = 0;
      schedule();
    });
    observer.observe(element);
    observer.observe(area);
    if (dock.current) observer.observe(dock.current);
    if (controls.current) observer.observe(controls.current);
    window.addEventListener('resize', schedule);
    document.addEventListener('scroll', schedule, true);
    // Measure after the saved/draft stylesheet has reached the browser.
    schedule();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', schedule);
      document.removeEventListener('scroll', schedule, true);
    };
  }, [
    target.selector,
    artboard,
    stage,
    revision,
    zoom,
    scope,
    dockVisible,
    offset,
  ]);
  if (!view) return null;
  const colour = (property: string, value: string, label: string) => (
    <HexColorPicker
      label={label}
      value={value}
      compact
      disabled={disabled}
      onChange={(next) => onStyle(property, next, 'dock-colour-' + property)}
      onEnd={onEnd}
    />
  );
  return (
    <div
      ref={dock}
      className="studio-selection-dock"
      style={{ left: view.left, top: view.top, width: view.width }}
    >
      <div className="studio-dock-caption">
        <button
          className="studio-dock-grip"
          aria-label="Move formatting toolbar"
          title="Drag toolbar; arrow keys move it; double-click to reset"
          onDoubleClick={() => setOffset({ x: 0, y: 0 })}
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            e.preventDefault();
            e.stopPropagation();
            moving.current = {
              x: e.clientX,
              y: e.clientY,
              left: offset.x,
              top: offset.y,
            };
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            const start = moving.current;
            if (start)
              setOffset({
                x: start.left + e.clientX - start.x,
                y: start.top + e.clientY - start.y,
              });
          }}
          onPointerUp={() => {
            moving.current = null;
          }}
          onPointerCancel={() => {
            moving.current = null;
          }}
          onKeyDown={(e) => {
            if (
              !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(
                e.key,
              )
            )
              return;
            e.preventDefault();
            e.stopPropagation();
            setOffset((p) => ({
              x:
                p.x +
                (e.key === 'ArrowRight' ? 10 : e.key === 'ArrowLeft' ? -10 : 0),
              y:
                p.y +
                (e.key === 'ArrowDown' ? 10 : e.key === 'ArrowUp' ? -10 : 0),
            }));
          }}
        >
          <GripHorizontal size={14} />
        </button>
        {view.text ? <Type size={13} /> : <Square size={13} />}
        <span title={target.label}>
          {count > 1 ? `${count} selected` : target.label}
        </span>
        {onReplaceImage && view.replaceable && (
          <>
            <button
              type="button"
              className="selection-replace-image"
              disabled={disabled || uploadProgress !== undefined}
              onClick={() => imageInput.current?.click()}
              title="Replace the selected logo or image"
              aria-label={
                uploadProgress !== undefined
                  ? `Uploading image ${uploadProgress}%`
                  : 'Replace image'
              }
            >
              <ImagePlus size={16} />
              <span className="selection-replace-label">
                {uploadProgress !== undefined
                  ? `Uploading ${uploadProgress}%`
                  : 'Replace image'}
              </span>
            </button>
            <input
              ref={imageInput}
              type="file"
              hidden
              aria-label="Replace selected image"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) onReplaceImage(file);
              }}
            />
          </>
        )}
        {onEditText && (
          <button
            className="studio-dock-edit-text"
            title="Edit text"
            aria-label="Edit text"
            disabled={disabled}
            onClick={onEditText}
          >
            <Pencil size={13} /> Edit text
          </button>
        )}
        {onEditInline && (
          <button
            title="Edit text on canvas"
            aria-label="Edit text on canvas"
            disabled={disabled}
            onClick={onEditInline}
          >
            On canvas
          </button>
        )}
        <button
          title="Ask AI about selection"
          aria-label="Ask AI about selection"
          aria-expanded={showAssistant}
          onClick={() => setShowAssistant((v) => !v)}
        >
          <Sparkles size={14} />
        </button>
        <small>
          {scope === 'all'
            ? 'All sizes'
            : scope === 'tablet'
              ? 'Tablet ≤1000'
              : 'Mobile ≤760'}
        </small>
        <button
          aria-label="Select containing layer"
          title="Select containing layer"
          onClick={onLayer}
        >
          <ArrowUpLeft size={13} />
        </button>
      </div>
      <div
        ref={controls}
        className="studio-dock-controls"
        role="toolbar"
        tabIndex={0}
        aria-label="Selection tools"
        onKeyDown={(e) => {
          if (
            !(e.target instanceof HTMLButtonElement) ||
            !['ArrowLeft', 'ArrowRight'].includes(e.key)
          )
            return;
          const buttons = Array.from(
            e.currentTarget.querySelectorAll<HTMLButtonElement>(
              'button:not(:disabled)',
            ),
          );
          const index = buttons.indexOf(e.target);
          if (index >= 0) {
            e.preventDefault();
            buttons[
              (index + (e.key === 'ArrowRight' ? 1 : buttons.length - 1)) %
                buttons.length
            ]?.focus();
          }
        }}
      >
        {view.text ? (
          <>
            <FontPicker
              value={view.family}
              disabled={disabled}
              onChange={(value) => onStyle('font-family', value)}
            />
            <StudioNumber
              label="Font size"
              value={view.fontSize}
              min={8}
              max={200}
              step={0.5}
              disabled={disabled}
              onCommit={(value) => {
                if (value !== undefined) onStyle('font-size', value + 'px');
              }}
              onEnd={onEnd}
            />
            <span className="studio-dock-divider" />
            <button
              aria-label="Bold"
              title="Bold"
              disabled={disabled}
              aria-pressed={view.bold}
              onClick={() => onStyle('font-weight', view.bold ? '400' : '700')}
            >
              <Bold size={16} />
            </button>
            <button
              aria-label="Italic"
              title="Italic"
              disabled={disabled}
              aria-pressed={view.italic}
              onClick={() =>
                onStyle('font-style', view.italic ? 'normal' : 'italic')
              }
            >
              <Italic size={16} />
            </button>
            {colour('color', view.color, 'Text colour')}
            <span className="studio-dock-divider" />
            {(
              [
                ['left', AlignLeft],
                ['center', AlignCenter],
                ['right', AlignRight],
              ] as const
            ).map(([align, Icon]) => (
              <button
                key={align}
                aria-label={'Align ' + align}
                title={'Align ' + align}
                disabled={disabled}
                aria-pressed={view.align === align}
                onClick={() => onStyle('text-align', align)}
              >
                <Icon size={16} />
              </button>
            ))}
          </>
        ) : (
          <>
            {colour('background-color', view.fill, 'Fill colour')}
            <label
              className="studio-dock-number"
              htmlFor="selection-corner-radius"
            >
              <span>Radius</span>
              <StudioNumber
                id="selection-corner-radius"
                label="Corner radius"
                min={0}
                max={200}
                value={view.radius}
                disabled={disabled}
                onCommit={(value) => {
                  if (value !== undefined)
                    onStyle('border-radius', value + 'px');
                }}
                onEnd={onEnd}
              />
            </label>
            {view.media ? (
              <Select
                value={view.fit}
                disabled={disabled}
                onValueChange={(value) => {
                  if (value) onStyle('object-fit', String(value));
                }}
              >
                <SelectTrigger aria-label="Image fit">
                  <SelectValue>
                    {{
                      cover: 'Crop to fill',
                      contain: 'Fit image',
                      fill: 'Stretch',
                      none: 'Original size',
                      'scale-down': 'Shrink to fit',
                    }[view.fit] || view.fit}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent
                  className="studio-select-menu"
                  align="start"
                  alignItemWithTrigger={false}
                >
                  {['cover', 'contain', 'fill', 'none', 'scale-down'].map(
                    (fit) => (
                      <SelectItem key={fit} value={fit}>
                        {
                          {
                            cover: 'Crop to fill',
                            contain: 'Fit image',
                            fill: 'Stretch',
                            none: 'Original size',
                            'scale-down': 'Shrink to fit',
                          }[fit]
                        }
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            ) : (
              <label
                className="studio-dock-number"
                htmlFor="selection-element-padding"
              >
                <span>Padding</span>
                <StudioNumber
                  id="selection-element-padding"
                  label="Element padding"
                  min={0}
                  max={160}
                  value={view.padding}
                  disabled={disabled}
                  onCommit={(value) => {
                    if (value !== undefined) onStyle('padding', value + 'px');
                  }}
                  onEnd={onEnd}
                />
              </label>
            )}
          </>
        )}
        {(view.text || view.media) && (
          <RotationPicker
            key={target.selector}
            value={view.rotation}
            disabled={disabled}
            onChange={(value) => onStyle('rotate', value + 'deg')}
            onEnd={onEnd}
          />
        )}
      </div>
      {showAssistant && (
        <form
          className="studio-dock-chat"
          onSubmit={(event) => {
            event.preventDefault();
            if (disabled || !message.trim()) return;
            onSend(message.trim());
            setMessage('');
          }}
        >
          <Sparkles size={15} aria-hidden="true" />
          <input
            aria-label="Ask AI about selected element"
            placeholder="Ask AI to change this element…"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            maxLength={4000}
            disabled={disabled}
          />
          <button
            type="submit"
            aria-label="Send to Assistant"
            title="Send to Assistant"
            disabled={disabled || !message.trim()}
          >
            <ArrowUp size={16} />
          </button>
        </form>
      )}
    </div>
  );
}
