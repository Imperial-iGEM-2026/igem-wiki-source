'use client';
import { useState } from 'react';
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
}: {
  node: CanvasNode;
  onChange: (patch: Partial<CanvasNode>, key: string) => void;
  onEnd: () => void;
}) {
  const [tab, setTab] = useState<(typeof tabs)[number][0]>('html');
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
        id="studio-html-source"
        value={node[tab] || ''}
        onChange={(event) => onChange({ [tab]: event.target.value }, tab)}
        onBlur={onEnd}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        rows={14}
      />
      <p>
        Preview updates after you stop typing. Save the page to keep your code.
        Set its width and height in Layout.
      </p>
      <details>
        <summary>What can I use?</summary>
        <p>
          HTML, CSS animations, inline SVG and JavaScript. Code runs inside this
          element. External scripts, fetch requests and access to the
          surrounding page are blocked. Use self-contained code and respect
          reduced-motion preferences.
        </p>
      </details>
    </div>
  );
}
