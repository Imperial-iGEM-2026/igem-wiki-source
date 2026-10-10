'use client';
import { RotateCw, RotateCcw, Undo2 } from 'lucide-react';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverTitle,
} from '@/components/ui/popover';
import { StudioNumber } from './studio-number';

export function RotationPicker({
  value,
  disabled,
  onChange,
  onEnd,
}: {
  value: number;
  disabled: boolean;
  onChange: (value: number) => void;
  onEnd: () => void;
}) {
  const apply = (angle: number) => {
    if (disabled || angle === value) return;
    onChange(Math.max(-360, Math.min(360, angle)));
    onEnd();
  };
  return (
    <Popover>
      <PopoverTrigger
        className="studio-rotation-trigger"
        aria-label={`Rotation: ${value} degrees`}
        title={`Rotate · ${value}°`}
        data-rotated={value !== 0 || undefined}
        disabled={disabled}
      >
        <RotateCw size={16} aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent
        className="studio-rotation-popover"
        align="end"
        side="top"
        sideOffset={10}
      >
        <div className="studio-rotation-heading">
          <PopoverTitle>Rotation</PopoverTitle>
          <button
            type="button"
            aria-label="Reset rotation"
            title="Reset to 0°"
            disabled={disabled || value === 0}
            onClick={() => apply(0)}
          >
            <Undo2 size={14} />
          </button>
        </div>
        <div className="studio-rotation-value">
          <div className="studio-rotation-preview" aria-hidden="true">
            <span style={{ transform: `rotate(${value}deg)` }} />
          </div>
          <label className="studio-rotation-field" htmlFor="selection-rotation">
            <span>Angle</span>
            <div>
              <StudioNumber
                id="selection-rotation"
                label="Rotation (degrees)"
                min={-360}
                max={360}
                step={0.1}
                value={value}
                disabled={disabled}
                onCommit={(angle) => {
                  if (angle !== undefined) apply(angle);
                }}
              />
              <span aria-hidden="true">°</span>
            </div>
          </label>
        </div>
        <div className="studio-rotation-actions">
          <button
            type="button"
            disabled={disabled || value <= -360}
            aria-label="Rotate left 90 degrees"
            onClick={() => apply(value - 90)}
          >
            <RotateCcw size={14} /> −90°
          </button>
          <button
            type="button"
            disabled={disabled || value >= 360}
            aria-label="Rotate right 90 degrees"
            onClick={() => apply(value + 90)}
          >
            <RotateCw size={14} /> +90°
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
