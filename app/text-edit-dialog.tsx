import { LinkEditor } from './link-editor';
import { insertTextLink } from './text-links';
import type { SectionLinkTarget } from './section-link-targets';
import { useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Check, Type, Maximize2, Minimize2 } from 'lucide-react';

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
  pages = [],
  sections,
}: {
  open: boolean;
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
  busy?: boolean;
  error?: string;
  maxLength?: number;
  pages?: [string,string][];
  sections?: (href:string) => SectionLinkTarget[];
  conflict?: { latest: string; onRebase: () => void };
}) {
  const [expanded, setExpanded] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const selection = useRef({start:0,end:0});
  const [linkOpen,setLinkOpen]=useState(false), [link,setLink]=useState(''), [linkError,setLinkError]=useState('');
  const [previousOpen,setPreviousOpen]=useState(open);
  if(previousOpen!==open){setPreviousOpen(open);setLinkOpen(false);setLink('');setLinkError('');}
  return (
    <Dialog
      open={open}
      onOpenChange={(next, details) => {
        if (!next && !busy && details.reason !== 'outside-press') onCancel();
      }}
    >
      <DialogContent
        className={
          'studio-dialog studio-text-dialog' +
          (expanded ? ' studio-text-expanded' : '') + (linkOpen ? ' studio-text-link-open' : '')
        }
        initialFocus={input}
        showCloseButton={!busy}
      >
        <DialogTitle>
          <Type size={20} /> Edit text
        </DialogTitle>
        <DialogDescription>
          Edit text, or select words and choose Link selected text to link to a page or section.
        </DialogDescription>
        <button
          className="studio-text-expand"
          aria-label={
            expanded ? 'Restore text editor size' : 'Expand text editor'
          }
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}{' '}
          {expanded ? 'Restore size' : 'Expand editor'}
        </button>
        <textarea
          ref={input}
          aria-label="Text content"
          value={value}
          maxLength={maxLength}
          disabled={busy}
          spellCheck
          onSelect={event => { if(document.activeElement===event.currentTarget) selection.current={start:event.currentTarget.selectionStart,end:event.currentTarget.selectionEnd}; }}
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
        <button type="button" disabled={busy} onClick={()=>{ if(!linkOpen && input.current) selection.current={start:input.current.selectionStart,end:input.current.selectionEnd}; setLinkOpen(v=>!v); setLinkError(''); }}>Link selected text</button>
        {linkOpen && <div className="studio-text-link-panel">
          <LinkEditor value={link} onChange={setLink} pages={pages} sections={sections} disabled={busy} optional={false}/>
          <button type="button" disabled={busy || !link} onClick={()=>{
            const {start,end}=selection.current;
            if(end<=start){setLinkError('Select the words you want to link in the text above.');return;}
            const next=insertTextLink(value,start,end,link);
            if(next===value){setLinkError('Select text within one paragraph and choose a valid destination.');return;}
            if(next.length>maxLength){setLinkError('This link would exceed the text length limit.');return;}
            onChange(next);setLinkOpen(false);setLinkError('');requestAnimationFrame(()=>input.current?.focus());
          }}>Insert link</button>
          {linkError && <p role="alert">{linkError}</p>}
        </div>}
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
