import { useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Check, Type } from 'lucide-react';

export function TextEditDialog({
  open,
  value,
  onChange,
  onSave,
  onCancel,
  busy = false,
  error,
  maxLength = 12000,
  conflict,
}: {
  open: boolean;
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
  busy?: boolean;
  error?: string;
  maxLength?: number;
  conflict?: { latest: string; onRebase: () => void };
}) {
  const input = useRef<HTMLTextAreaElement>(null);
  return (
    <Dialog
      open={open}
      onOpenChange={(next, details) => {
        if (!next && !busy && details.reason !== 'outside-press') onCancel();
      }}
    >
      <DialogContent
        className="studio-dialog studio-text-dialog"
        initialFocus={input}
        showCloseButton={!busy}
      >
        <DialogTitle>
          <Type size={20} /> Edit text
        </DialogTitle>
        <DialogDescription>
          Change this text without changing its link or styling.
        </DialogDescription>
        <textarea
          ref={input}
          aria-label="Text content"
          value={value}
          maxLength={maxLength}
          disabled={busy}
          spellCheck
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && !busy && !e.nativeEvent.isComposing) {
              e.preventDefault();
              onCancel();
            }
            if (
              (e.ctrlKey || e.metaKey) &&
              e.key === 'Enter' &&
              !busy &&
              !e.nativeEvent.isComposing
            ) {
              e.preventDefault();
              onSave();
            }
            e.stopPropagation();
          }}
        />
        <div className="studio-text-meta">
          <span>Ctrl / ⌘ + Enter to save</span>
          <span>
            {value.length.toLocaleString()} / {maxLength.toLocaleString()}
          </span>
        </div>
        {error && (
          <p className="studio-text-error" role="alert">
            {error}
          </p>
        )}
        {conflict && (
          <div className="studio-text-conflict">
            <strong>This text was updated by a teammate.</strong>
            <p>{conflict.latest}</p>
            <button disabled={busy} onClick={conflict.onRebase}>
              Keep my text and use latest revision
            </button>
          </div>
        )}
        <div className="studio-dialog-actions">
          <button disabled={busy} onClick={onCancel}>
            Cancel
          </button>
          <button className="studio-primary" disabled={busy} onClick={onSave}>
            <Check size={15} /> {busy ? 'Saving…' : 'Save text'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
