'use client';
import { useEffect, useRef, useState } from 'react';
import { ImagePlus, FileUp, Copy } from 'lucide-react';
import { uploadMedia } from './upload-media';
import { insertHtmlImage } from './html-image';
import { insertHtmlPdf } from './html-pdf';
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
  const pdfPicker = useRef<HTMLInputElement>(null);
  const [pdfURL, setPdfURL] = useState('');
  const [pdfTitle, setPdfTitle] = useState('');
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
  async function uploadImage(file: File, pdf = false) {
    if (disabled || uploading) return;
    if (
      pdf
        ? !(file.type === 'application/pdf' || /\.pdf$/i.test(file.name))
        : !file.type.startsWith('image/')
    ) {
      setError(
        pdf
          ? 'Choose a PDF file.'
          : 'Choose an image file (PNG, JPEG, WebP, GIF or SVG).',
      );
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
      if (
        pdf
          ? result.type !== 'application/pdf'
          : !result.type.startsWith('image/')
      )
        throw Error(
          pdf
            ? 'The uploaded file is not a PDF.'
            : 'The uploaded file is not an image.',
        );
      setAsset(result.url);
      const current = latest.current;
      if (current.disabled) {
        setMessage(
          'File uploaded. Editing is currently paused; copy its URL when you resume.',
        );
        return;
      }
      const html = current.node.html || '';
      // Preserve any code typed while the upload was in progress.
      const changed = html !== original;
      const next = (pdf ? insertHtmlPdf : insertHtmlImage)(
        html,
        result.url,
        pdf ? pdfTitle || file.name : alt,
        changed ? html.length : start,
        changed ? html.length : end,
      );
      current.onEnd();
      current.onChange({ html: next.html }, pdf ? 'html-pdf' : 'html-image');
      current.onEnd();
      setTab('html');
      setMessage(
        changed
          ? 'File reference added at the end because the HTML changed during upload.'
          : 'File reference inserted into the HTML. Save the page to keep it.',
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
          {uploading ? `Uploading… ${progress}%` : 'Upload & insert image'}
        </button>
        <p>
          Stores the image separately and inserts an img tag at the HTML cursor.
          Images do not count toward your code size. No new section is created.
        </p>
        <label htmlFor="studio-html-pdf-title">PDF link text</label>
        <input
          id="studio-html-pdf-title"
          value={pdfTitle}
          onChange={(event) => setPdfTitle(event.target.value)}
          disabled={disabled || uploading}
          placeholder="Read the handbook"
        />
        <input
          ref={pdfPicker}
          type="file"
          accept="application/pdf,.pdf"
          hidden
          aria-label="Choose a PDF for this HTML block"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) void uploadImage(file, true);
          }}
        />
        <button
          type="button"
          disabled={disabled || uploading}
          onClick={() => pdfPicker.current?.click()}
        >
          <FileUp size={15} />
          Upload & insert PDF link
        </button>
        <label htmlFor="studio-html-pdf-url">
          Or reuse an uploaded PDF URL
        </label>
        <input
          id="studio-html-pdf-url"
          value={pdfURL}
          onChange={(event) => setPdfURL(event.target.value)}
          disabled={disabled || uploading}
          placeholder="/api/media/… .pdf"
        />
        <button
          type="button"
          disabled={disabled || uploading || !pdfURL.trim()}
          onClick={() => {
            try {
              const html = node.html || '';
              const start =
                tab === 'html'
                  ? (source.current?.selectionStart ?? html.length)
                  : html.length;
              const end =
                tab === 'html'
                  ? (source.current?.selectionEnd ?? start)
                  : start;
              const next = insertHtmlPdf(
                html,
                pdfURL.trim(),
                pdfTitle,
                start,
                end,
              );
              onEnd();
              onChange({ html: next.html }, 'html-pdf');
              onEnd();
              setTab('html');
              setError('');
              setMessage('PDF link inserted. Open Preview to read it.');
            } catch (cause) {
              setError(
                cause instanceof Error
                  ? cause.message
                  : 'Could not insert PDF link.',
              );
            }
          }}
        >
          Insert PDF link
        </button>
        <p>
          PDFs stay in the media library. Only their URL is saved in your HTML.
          Click the link in Preview to open the reader and download the complete
          document. No PDF section is added.
        </p>
        {asset && (
          <div className="studio-html-asset-url">
            <label htmlFor="studio-html-image-url">Reusable media URL</label>
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
                    'Media URL copied. Use it in HTML, CSS or another block.',
                  );
                } catch {
                  setError(
                    'Could not copy automatically. Select and copy the media URL above.',
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
          HTML, CSS animations, inline SVG and JavaScript. Upload PDFs above and
          use a normal anchor link; PDF iframe, embed and object tags are
          blocked. Upload images above and use their URLs in img tags or CSS
          backgrounds instead of embedding base64 data. Code runs inside this
          element. HTTPS video/audio and iGEM Video Universe, YouTube or Vimeo
          iframe players are supported, including their URL settings. Add
          <code>{'allow="autoplay; fullscreen; picture-in-picture"'}</code> to a
          player iframe for those features. External scripts, fetch requests and
          access to the surrounding page are blocked. Use self-contained code
          and respect reduced-motion preferences.
        </p>
        <p>
          Blocks load near the viewport. CSS, SVG, Web Animations and
          requestAnimationFrame loops pause off screen and resume when visible.
          For animation loops using timers, listen for the studio:visibility
          event and use event.detail.visible to stop or restart your animation
          work. Application timers and media playback are not stopped for you.
        </p>
      </details>
    </div>
  );
}
