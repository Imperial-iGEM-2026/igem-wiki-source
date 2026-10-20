import { sectionAnchor } from './section-links';
'use client';
import { useEffect, useRef, useState, createElement } from 'react';
import type { ReactNode } from 'react';
import { ReferenceList } from './references';
import { EquationBlock, MathText } from './equation-block';
import { CustomHtmlBlock } from './custom-html-block';
import { PdfReader } from './pdf-reader';
import { Download, Box } from 'lucide-react';
import { imageDisplayAttributes, imageDisplayRetry, watchImageDisplay } from './image-display';
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
  editing = false,
  htmlInteracting = false,
  renderItem,
  openItems = [],
}: {
  node: CanvasNode;
  publication?: boolean;
  editing?: boolean;
  htmlInteracting?: boolean;
  renderItem?: (id: string) => ReactNode;
  openItems?: string[];
}) {
  const [failed, setFailed] = useState(false);
  const image = useRef<HTMLImageElement>(null);
  useEffect(() => {
    if (image.current) return watchImageDisplay(image.current);
  }, [node.src, editing, failed]);
  useEffect(() => setFailed(false), [node.src, editing]);
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
              id={sectionAnchor(node.id, item.id)}
              className="accordion-item"
              data-item-id={item.id}
              open={item.open || openItems.includes(item.id) || undefined}
            >
              {/* Plain text: templates style summary spans as icons. */}
              <summary>
                <MathText text={item.title || 'Untitled section'} />
              </summary>
              <div className="accordion-body">
                <MathText text={item.body} />
                {renderItem?.(item.id)}
              </div>
            </details>
          ))}
        </div>
      ) : node.kind === 'shape' ? (
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          // eslint-disable-next-line jsx-a11y/prefer-tag-over-role -- An inline vector image needs SVG semantics.
          role="img"
          aria-label={node.alt || node.shape || 'Shape'}
          style={{
            display: 'block',
            width: '100%',
            height: '100%',
            overflow: 'visible',
          }}
        >
          <g
            fill={node.background || '#3478f6'}
            stroke={node.borderColor || node.background || '#3478f6'}
            strokeWidth={node.borderWidth ?? 0}
          >
            {node.shape === 'ellipse' ? (
              <ellipse cx="50" cy="50" rx="49" ry="49" />
            ) : node.shape === 'triangle' ? (
              <polygon points="50,1 99,99 1,99" />
            ) : node.shape === 'diamond' ? (
              <polygon points="50,1 99,50 50,99 1,50" />
            ) : node.shape === 'line' ? (
              <path
                d="M 1 50 H 99"
                fill="none"
                strokeWidth={node.borderWidth || 3}
                vectorEffect="non-scaling-stroke"
              />
            ) : node.shape === 'arrow' ? (
              <polygon points="1,35 65,35 65,5 99,50 65,95 65,65 1,65" />
            ) : (
              <rect
                x="1"
                y="1"
                width="98"
                height="98"
                rx={Math.min(49, node.radius || 0)}
              />
            )}
          </g>
        </svg>
      ) : node.kind === 'html' ? (
        <CustomHtmlBlock
          node={node}
          editing={editing}
          interacting={htmlInteracting}
        />
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
          {editing && node.kind === 'image'
            ? 'Editor image preview could not load. The original is unchanged. Try refreshing after the previews finish, or upload a smaller editing copy.'
            : 'This media could not load. Check the URL, file format, and access permissions.'}
          {editing && node.kind === 'image' && (
            <a href={node.src} target="_blank" rel="noreferrer">
              Open original image
            </a>
          )}
        </div>
      ) : (
        <>
          {node.kind === 'image' && (
            <div className="media-image-frame">
              <img
                ref={image}
                style={
                  node.minHeight
                    ? {
                        height: node.minHeight,
                        maxHeight: 'none',
                        objectFit: node.objectFit || 'contain',
                      }
                    : undefined
                }
                src={node.src}
                {...imageDisplayAttributes(node.src, editing)}
                alt={node.alt || node.title}
                loading="lazy"
                decoding="async"
                onError={(event) => {
                  // The display watcher retries a failed small copy with the
                  // large copy, or uses the original outside editing mode.
                  if (!imageDisplayRetry(event.nativeEvent)) setFailed(true);
                }}
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
              allow="autoplay; fullscreen; picture-in-picture"
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
      {node.body &&
        !['text', 'equation', 'references', 'html'].includes(node.kind) && (
          <details className="media-transcript">
            <summary>Transcript / description</summary>
            <p>{node.body}</p>
          </details>
        )}
      {node.src &&
        node.kind !== 'embed' &&
        node.kind !== 'pdf' &&
        node.kind !== 'html' &&
        (node.kind !== 'image' || failed) && (
          <a
            className="media-download"
            href={node.src}
            target="_blank"
            rel="noreferrer"
          >
            <Download size={14} />
            Open original {node.kind === 'model' ? 'GLB' : 'file'}
          </a>
        )}
    </div>
  );
}
