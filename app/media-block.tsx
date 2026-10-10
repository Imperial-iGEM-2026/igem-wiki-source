'use client';
import { useEffect, useRef, useState, createElement } from 'react';
import { ReferenceList } from './references';
import { EquationBlock, MathText } from './equation-block';
import { PdfReader } from './pdf-reader';
import { Download, Box } from 'lucide-react';
import { embedURL, type CanvasNode } from './canvas-schema';
function Model({ src, alt }: { src: string; alt: string }) {
  const [ready, setReady] = useState(false),
    [error, setError] = useState('');
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    let alive = true;
    import('@google/model-viewer')
      .then(() => {
        if (alive) setReady(true);
      })
      .catch(() => setError('The 3D viewer could not load.'));
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    if (!ready || !ref.current) return;
    setError('');
    const element = ref.current;
    const fail = () =>
      setError(
        'Could not display this model. Use a self-contained GLB file with supported textures.',
      );
    element.addEventListener('error', fail);
    return () => element.removeEventListener('error', fail);
  }, [ready, src]);
  if (error)
    return (
      <div className="media-error">
        {error}
        <a href={src} target="_blank" rel="noreferrer">
          Download model
        </a>
      </div>
    );
  return ready ? (
    createElement('model-viewer', {
      ref,
      src,
      alt: alt || 'Interactive 3D model',
      'camera-controls': true,
      'touch-action': 'pan-y',
      'interaction-prompt': 'auto',
      style: {
        width: '100%',
        height: '440px',
        background: '#edf2e6',
        borderRadius: 8,
      },
    })
  ) : (
    <div className="media-loading">
      <Box />
      Loading 3D viewer…
    </div>
  );
}
export function MediaBlock({
  node,
  publication = false,
}: {
  node: CanvasNode;
  publication?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [node.src]);
  return (
    <div className={'media-block media-' + node.kind}>
      {node.title &&
        !['button', 'section'].includes(node.kind) &&
        createElement(
          node.headingLevel === 3 ? 'h3' : 'h2',
          { 'data-node-text': 'title' },
          <MathText text={node.title} />,
        )}
      {node.kind === 'button' || node.kind === 'section' ? (
        node.kind === 'button' && !node.linkTo ? (
          <span className="canvas-button" data-node-text="linkLabel">
            {node.linkLabel || node.title || 'Button'}
          </span>
        ) : null
      ) : node.kind === 'accordion' ? (
        // Native details/summary: each section opens on its own, needs no
        // script (static export) and works with keyboards and screen readers.
        <div className="accordion">
          {(node.items || []).map((item) => (
            <details
              key={item.id}
              className="accordion-item"
              data-item-id={item.id}
              open={item.open || undefined}
            >
              {/* Plain text: templates style summary spans as icons. */}
              <summary>
                <MathText text={item.title || 'Untitled section'} />
              </summary>
              <div className="accordion-body">
                <MathText text={item.body} />
              </div>
            </details>
          ))}
        </div>
      ) : node.kind === 'references' ? (
        <ReferenceList nodeId={node.id} entries={node.references || []} />
      ) : node.kind === 'equation' ? (
        <EquationBlock source={node.body} />
      ) : node.kind === 'text' ? (
        <div className="custom-text" data-node-text="body">
          <MathText text={node.body} />
        </div>
      ) : !node.src ? (
        <div className="media-loading">
          Choose a file or media URL in Block settings.
        </div>
      ) : failed ? (
        <div className="media-error">
          This media could not load. Check the URL, file format, and access
          permissions.
        </div>
      ) : (
        <>
          {node.kind === 'image' && (
            <div className="media-image-frame">
              <img
                src={node.src}
                alt={node.alt || node.title}
                loading="lazy"
                onError={() => setFailed(true)}
              />
              <a
                className="media-image-original"
                href={node.src}
                target="_blank"
                rel="noreferrer"
                aria-label="Open original image"
                title="Open original image"
              >
                <Download size={16} />
              </a>
            </div>
          )}
          {node.kind === 'video' && (
            <video
              src={node.src}
              controls
              preload="metadata"
              playsInline
              onError={() => setFailed(true)}
              aria-label={node.alt || node.title || 'Video'}
            />
          )}
          {node.kind === 'audio' && (
            <audio
              src={node.src}
              controls
              preload="metadata"
              onError={() => setFailed(true)}
              aria-label={node.alt || node.title || 'Audio'}
            />
          )}
          {node.kind === 'pdf' && (
            <PdfReader
              src={node.src || ''}
              title={node.alt || node.title || 'PDF document'}
            />
          )}
          {node.kind === 'model' &&
            (publication ? (
              createElement('model-viewer', {
                src: node.src,
                alt: node.alt || node.title || 'Interactive 3D model',
                'camera-controls': true,
                'touch-action': 'pan-y',
                style: { width: '100%', height: 440 },
              })
            ) : (
              <Model src={node.src} alt={node.alt || node.title} />
            ))}
          {node.kind === 'embed' && embedURL(node.src) && (
            <iframe
              title={node.alt || node.title || 'Embedded video'}
              src={embedURL(node.src)!}
              className="video-embed"
              loading="lazy"
              allow="fullscreen; picture-in-picture"
              sandbox="allow-scripts allow-same-origin allow-presentation"
              allowFullScreen
            />
          )}
        </>
      )}
      {node.caption && (
        <p className="media-caption">
          <MathText text={node.caption} />
        </p>
      )}
      {node.body && !['text', 'equation', 'references'].includes(node.kind) && (
        <details className="media-transcript">
          <summary>Transcript / description</summary>
          <p>{node.body}</p>
        </details>
      )}
      {node.src &&
        node.kind !== 'embed' &&
        (node.kind !== 'image' || failed) && (
          <a
            className="media-download"
            href={node.src}
            target="_blank"
            rel="noreferrer"
          >
            <Download size={14} />
            Open original{' '}
            {node.kind === 'model'
              ? 'GLB'
              : node.kind === 'pdf'
                ? 'PDF'
                : 'file'}
          </a>
        )}
    </div>
  );
}
