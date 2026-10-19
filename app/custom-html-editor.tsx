'use client';
import { useEffect, useRef, useState } from 'react';
import { ImagePlus, Copy } from 'lucide-react';
import { uploadMedia } from './upload-media';
import { insertHtmlImage } from './html-image';
import type { CanvasNode } from './canvas-schema';

const tabs = [
  ['html', 'HTML'],
  ['css', 'CSS'],
  ['javascript', 'JavaScript'],
] as const;
export function CustomHtmlEditor({
  node,
  onChange,
  onEnd,
  disabled = false,
}: {
  node: CanvasNode;
  onChange: (patch: Partial<CanvasNode>, key: string) => void;
  onEnd: () => void;
  disabled?: boolean;
}) {
  const [tab, setTab] = useState<(typeof tabs)[number][0]>('html');
  const source = useRef<HTMLTextAreaElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const mounted = useRef(false);
  const latest = useRef({ node, onChange, onEnd, disabled });
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [asset, setAsset] = useState('');
  const [alt, setAlt] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    latest.current = { node, onChange, onEnd, disabled };
  }, [node, onChange, onEnd, disabled]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  async function uploadImage(file: File) {
    if (disabled || uploading) return;
    if (!file.type.startsWith('image/')) {
      setError('Choose an image file (PNG, JPEG, WebP, GIF or SVG).');
      return;
    }
    const original = node.html || '';
    const start =
      tab === 'html'
        ? (source.current?.selectionStart ?? original.length)
        : original.length;
    const end =
      tab === 'html' ? (source.current?.selectionEnd ?? start) : start;
    setUploading(true);
    setProgress(0);
    setError('');
    setMessage('');
    onEnd();
    try {
      const result = await uploadMedia(file, (value) => {
        if (mounted.current) setProgress(value);
      });
      if (!mounted.current) return;
      if (!result.type.startsWith('image/'))
        throw Error('The uploaded file is not an image.');
      setAsset(result.url);
      const current = latest.current;
      if (current.disabled) {
        setMessage(
          'Image uploaded. Editing is currently paused; copy its URL when you resume.',
        );
        return;
      }
      const html = current.node.html || '';
      // Preserve any code typed while the upload was in progress.
      const changed = html !== original;
      const next = insertHtmlImage(
        html,
        result.url,
        alt,
        changed ? html.length : start,
        changed ? html.length : end,
      );
      current.onEnd();
      current.onChange({ html: next.html }, 'html-image');
      current.onEnd();
      setTab('html');
      setMessage(
        changed
          ? 'Image added at the end because the HTML changed during upload.'
          : 'Image inserted into the HTML. Save the page to keep it.',
      );
    } catch (cause) {
      if (mounted.current)
        setError(
          cause instanceof Error ? cause.message : 'Image upload failed.',
        );
    } finally {
      if (mounted.current) setUploading(false);
    }
  }
  return (
    <div className="studio-html-editor">
      <div className="studio-html-tabs" aria-label="Code language">
        {tabs.map(([key, label]) => (
          <button
            key={key}
            type="button"
            aria-pressed={tab === key}
            onClick={() => {
              onEnd();
              setTab(key);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <label htmlFor="studio-html-source">
        {tabs.find(([key]) => key === tab)![1]} source
      </label>
      <textarea
        ref={source}
        id="studio-html-source"
        disabled={disabled}
        value={node[tab] || ''}
        onChange={(event) => onChange({ [tab]: event.target.value }, tab)}
        onBlur={onEnd}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        rows={14}
      />
      <div className="studio-html-assets">
        <label htmlFor="studio-html-image-alt">
          Image description (alt text)
        </label>
        <input
          id="studio-html-image-alt"
          value={alt}
          onChange={(event) => setAlt(event.target.value)}
          disabled={disabled || uploading}
          placeholder="Describe the image for readers"
        />
        <input
          ref={picker}
          type="file"
          accept="image/*"
          hidden
          aria-label="Choose an image for this HTML block"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) void uploadImage(file);
          }}
        />
        <button
          type="button"
          disabled={disabled || uploading}
          onClick={() => picker.current?.click()}
        >
          <ImagePlus size={15} />
          {uploading
            ? `Uploading image… ${progress}%`
            : 'Upload & insert image'}
        </button>
        <p>
          Stores the image separately and inserts an img tag at the HTML cursor.
          Images do not count toward your code size. No new section is created.
        </p>
        {asset && (
          <div className="studio-html-asset-url">
            <label htmlFor="studio-html-image-url">Reusable image URL</label>
            <input
              id="studio-html-image-url"
              value={asset}
              readOnly
              onFocus={(event) => event.target.select()}
            />
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(asset);
                  setMessage(
                    'Image URL copied. Use it in HTML, CSS or another block.',
                  );
                } catch {
                  setError(
                    'Could not copy automatically. Select and copy the image URL above.',
                  );
                }
              }}
            >
              <Copy size={14} />
              Copy URL
            </button>
          </div>
        )}
        {message && <output>{message}</output>}
        {error && (
          <p role="alert" className="studio-html-upload-error">
            {error}
          </p>
        )}
      </div>
      <p>
        Preview updates after you stop typing. Save the page to keep your code.
        Set its width and height in Layout.
      </p>
      <details>
        <summary>What can I use?</summary>
        <p>
          HTML, CSS animations, inline SVG and JavaScript. Upload images above
          and use their URLs in img tags or CSS backgrounds instead of embedding
          base64 data. Code runs inside this element. HTTPS video/audio and iGEM
          Video Universe, YouTube or Vimeo iframe players are supported,
          including their URL settings. Add
          <code>{'allow="autoplay; fullscreen; picture-in-picture"'}</code> to a
          player iframe for those features. External scripts, fetch requests and
          access to the surrounding page are blocked. Use self-contained code
          and respect reduced-motion preferences.
        </p>
      </details>
    </div>
  );
}
