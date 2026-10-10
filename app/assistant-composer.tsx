'use client';
/* oxlint-disable jsx-a11y/no-noninteractive-element-interactions -- Form drop zone supplements the keyboard-accessible attachment button. */
/* oxlint-disable next/no-img-element -- Private attachments use authenticated media URLs, without an image proxy. */
import { useLayoutEffect, useRef, useState } from 'react';
import {
  ArrowUp,
  ChevronDown,
  Plus,
  RotateCcw,
  Square,
  Zap,
  Type,
  Space,
  Palette,
  ImagePlus,
  X,
  LoaderCircle,
} from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverTitle,
} from '@/components/ui/popover';

export const reasoningEfforts = ['none', 'low', 'medium', 'high'];
export function ReasoningControl({
  effort,
  onChange,
  disabled,
  codex = false,
  modelLabel = 'Server model',
}: {
  modelLabel?: string;
  codex?: boolean;
  effort: string;
  onChange: (effort: string) => void;
  disabled: boolean;
}) {
  const levels = codex ? reasoningEfforts.slice(1) : reasoningEfforts;
  return (
    <div className="studio-reasoning">
      <div className="studio-effort-heading">
        <Zap size={17} aria-hidden="true" />
        <div>
          <strong>{effort}</strong>
          <span>{modelLabel}</span>
        </div>
        <button
          type="button"
          aria-label="Reset reasoning to Medium"
          title="Reset to Medium"
          disabled={disabled || effort === 'medium'}
          onClick={() => onChange('medium')}
        >
          <RotateCcw size={16} />
        </button>
      </div>
      <div className="studio-reasoning-track">
        <Slider
          className="studio-reasoning-slider"
          aria-label="Reasoning effort"
          min={0}
          max={levels.length - 1}
          step={1}
          value={[levels.indexOf(effort)]}
          onValueChange={(value) =>
            onChange(levels[Array.isArray(value) ? value[0] : value])
          }
          aria-valuetext={effort}
          disabled={disabled}
        />
        <div className="studio-reasoning-dots" aria-hidden="true">
          {levels.map((item, index) => (
            <i key={item} data-filled={index <= levels.indexOf(effort)} />
          ))}
        </div>
      </div>
      <div className="studio-reasoning-stops">
        {levels.map((item) => (
          <span key={item} data-active={item === effort}>
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

const ideas = [
  {
    label: 'Typography',
    icon: Type,
    text: 'Improve this typography with a clearer hierarchy and comfortable line spacing.',
  },
  {
    label: 'Spacing',
    icon: Space,
    text: 'Refine the spacing and alignment for a cleaner layout on desktop and mobile.',
  },
  {
    label: 'Colour',
    icon: Palette,
    text: 'Refine the colours while keeping the text readable and the existing visual style.',
  },
];
export type ChatImage = { url: string; name: string; size: number };
export function AssistantComposer({
  model,
  images = [],
  onAttach,
  onRemoveImage,
  attaching = false,
  codex = false,
  prompt,
  onPromptChange,
  effort,
  onEffortChange,
  working,
  disabled,
  available,
  onSend,
  onCancel,
}: {
  model?: string;
  images?: ChatImage[];
  onAttach?: (files: File[]) => void;
  onRemoveImage?: (url: string) => void;
  attaching?: boolean;
  codex?: boolean;
  prompt: string;
  onPromptChange: (prompt: string) => void;
  effort: string;
  onEffortChange: (effort: string) => void;
  working: boolean;
  disabled: boolean;
  available: boolean | null;
  onSend: () => void;
  onCancel: () => void;
}) {
  const input = useRef<HTMLTextAreaElement>(null);
  const modelLabel = model
    ? model.replace(/^gpt-(\d+(?:\.\d+)?)-luna$/, 'GPT-$1 Luna')
    : 'Server model';
  const fileInput = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const canAttach = codex && !disabled && !working && !attaching;
  const [ideasOpen, setIdeasOpen] = useState(false);
  useLayoutEffect(() => {
    if (!input.current) return;
    input.current.style.height = 'auto';
    input.current.style.height =
      Math.max(88, Math.min(180, input.current.scrollHeight)) + 'px';
  }, [prompt]);
  const canSend =
    !disabled &&
    !working &&
    !attaching &&
    available === true &&
    Boolean(prompt.trim() || images.length);
  return (
    <form
      className={
        'studio-assistant-composer' + (dragging ? ' studio-image-drop' : '')
      }
      onDragOver={(event) => {
        if (canAttach && event.dataTransfer.types.includes('Files')) {
          event.preventDefault();
          setDragging(true);
        }
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          setDragging(false);
      }}
      onDrop={(event) => {
        setDragging(false);
        if (event.dataTransfer.files.length) {
          event.preventDefault();
          if (canAttach) onAttach?.(Array.from(event.dataTransfer.files));
        }
      }}
      aria-label="Message Assistant"
      onSubmit={(event) => {
        event.preventDefault();
        if (canSend) onSend();
      }}
    >
      <input
        ref={fileInput}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        multiple
        hidden
        aria-label="Attach images"
        onChange={(event) => {
          if (canAttach) onAttach?.(Array.from(event.target.files || []));
          event.target.value = '';
        }}
      />
      {images.length > 0 && (
        <div className="studio-image-attachments">
          {images.map((image) => (
            <div key={image.url}>
              <img src={image.url} alt={image.name} />
              <span title={image.name}>{image.name}</span>
              <button
                type="button"
                aria-label={'Remove ' + image.name}
                disabled={working || attaching}
                onClick={() => onRemoveImage?.(image.url)}
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
      {attaching && (
        <output className="studio-upload-status">
          <LoaderCircle size={14} /> Uploading image…
        </output>
      )}
      <Textarea
        onPaste={(event) => {
          const files = Array.from(event.clipboardData.files);
          if (files.length && canAttach) {
            event.preventDefault();
            onAttach?.(files);
          }
        }}
        ref={input}
        id="studio-css-request"
        aria-label="Message Assistant"
        disabled={working}
        maxLength={4000}
        rows={3}
        value={prompt}
        onChange={(event) => onPromptChange(event.target.value)}
        placeholder={
          codex ? 'Ask anything, or describe a change…' : 'Describe a change…'
        }
        onKeyDown={(event) => {
          if (
            event.key === 'Enter' &&
            !event.shiftKey &&
            !event.nativeEvent.isComposing
          ) {
            event.preventDefault();
            if (canSend) onSend();
          }
        }}
      />
      <div className="studio-composer-toolbar">
        <Popover open={ideasOpen} onOpenChange={setIdeasOpen}>
          <PopoverTrigger
            type="button"
            className="studio-composer-add"
            aria-label="Add images or prompt ideas"
            title="Add images or prompt ideas"
          >
            <Plus size={18} />
          </PopoverTrigger>
          <PopoverContent
            className="studio-prompt-popover"
            side="top"
            align="start"
            sideOffset={10}
          >
            {codex && (
              <button
                type="button"
                disabled={!canAttach}
                onClick={() => {
                  setIdeasOpen(false);
                  fileInput.current?.click();
                }}
              >
                <ImagePlus size={16} />
                <span>Attach images</span>
              </button>
            )}
            <PopoverTitle className="sr-only">
              Attachments and suggestions
            </PopoverTitle>
            {ideas.map(({ label, text, icon: Icon }) => (
              <button
                type="button"
                key={label}
                onClick={() => {
                  onPromptChange(
                    (prompt.trim()
                      ? prompt.trimEnd() + '\n' + text
                      : text
                    ).slice(0, 4000),
                  );
                  setIdeasOpen(false);
                  requestAnimationFrame(() => input.current?.focus());
                }}
              >
                <Icon size={16} aria-hidden="true" />
                <span>{label}</span>
              </button>
            ))}
          </PopoverContent>
        </Popover>
        <Popover>
          <PopoverTrigger
            type="button"
            className="studio-composer-model"
            aria-label={`Model and reasoning: ${modelLabel}, ${effort}`}
            title="Adjust reasoning effort"
          >
            <span>{codex ? `Codex · ${modelLabel}` : modelLabel}</span>
            <small>{effort}</small>
            <ChevronDown size={13} />
          </PopoverTrigger>
          <PopoverContent
            className="studio-effort-popover"
            side="top"
            align="end"
            sideOffset={10}
          >
            <PopoverTitle className="sr-only">Reasoning effort</PopoverTitle>
            <ReasoningControl
              modelLabel={modelLabel}
              effort={effort}
              codex={codex}
              onChange={onEffortChange}
              disabled={working}
            />
          </PopoverContent>
        </Popover>
        {working ? (
          <button
            type="button"
            className="studio-composer-send"
            aria-label="Stop generating"
            title="Stop generating"
            onClick={onCancel}
          >
            <Square size={13} fill="currentColor" />
          </button>
        ) : (
          <button
            type="submit"
            className="studio-composer-send"
            aria-label="Send request"
            title={
              available === null
                ? 'Checking AI connection…'
                : available === false
                  ? 'AI is not connected'
                  : 'Send request (Enter)'
            }
            disabled={!canSend}
          >
            <ArrowUp size={19} />
          </button>
        )}
      </div>
    </form>
  );
}
