/** Lightweight, CSS-only loading artwork: no timers or render loop. */
export function EditorLoading({ workspace = false }: { workspace?: boolean }) {
  return (
    <output
      className="editor-loading-screen"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="editor-loading-content">
        <div className="editor-loading-brand" aria-hidden="true">
          reGELerate <span>STUDIO</span>
        </div>
        <div className="editor-loading-molecule" aria-hidden="true">
          <div className="editor-loading-frame" />
          <div className="editor-loading-fibre">
            {Array.from({ length: 12 }, (_, i) => (
              <i key={i} />
            ))}
          </div>
          <span className="editor-loading-label">assembling possibilities</span>
        </div>
        <h1>{workspace ? 'Opening your workspace' : 'Opening editor'}</h1>
        <p>
          {workspace
            ? 'Getting your projects ready.'
            : 'Preparing your canvas and tools.'}
        </p>
        <div className="editor-loading-pulse" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
      </div>
    </output>
  );
}
