'use client';
import {
  Children,
  Fragment,
  isValidElement,
  createContext,
  useContext,
  useMemo,
  lazy,
  Suspense,
  type ReactNode,
  type ReactElement,
} from 'react';
import { templateFor } from './templates';
import { validateLayout } from './canvas-schema';
import { CanvasSurface, type Builtin } from './canvas-surface';
import { EditorLoading } from './editor-loading';
const StudioEditor = lazy(() =>
  import('./studio-editor').then((m) => ({ default: m.StudioEditor })),
);
import type { Blocks } from './content';
import type { LivePeer, LiveSelection } from './live-sync';
export type CanvasContextValue = {
  data: Blocks;
  projectId?: string;
  userId?: string;
  switchProject?: (id: string) => void;
  openWorkspace?: () => void;
  publication?: boolean;
  editing: boolean;
  busy: boolean;
  locked: boolean;
  beginText?: (id: string) => void;
  save: (
    id: string,
    value: string,
    version: number,
    options?: { quiet?: boolean },
  ) => Promise<boolean>;
  dirty: (value: boolean) => void;
  exit?: () => void;
  navigate?: (page: string, resolved?: boolean) => void;
  resolveText?: (save: boolean) => Promise<boolean>;
  createPage?: (title: string, slug: string) => Promise<void>;
  deletePage?: (slug: string) => Promise<void>;
  restorePage?: (slug: string) => Promise<void>;
  people?: { id: string; name: string }[];
  peers?: LivePeer[];
  live?: boolean;
  setSelection?: (page: string, selection: LiveSelection) => void;
  error?: string;
};
export const CanvasContext = createContext<CanvasContextValue | null>(null);
function flatten(children: ReactNode): ReactElement[] {
  return Children.toArray(children).flatMap((child) =>
    !isValidElement(child)
      ? []
      : child.type === Fragment
        ? flatten((child.props as { children: ReactNode }).children)
        : [child],
  );
}
export function PageCanvas({
  page,
  children,
}: {
  page: string;
  children: ReactNode;
}) {
  const ctx = useContext(CanvasContext)!;
  const builtins = flatten(children).map((node, i) => ({
    id: (node.props as { id?: string }).id || 'template-' + i,
    node,
    ...(
      node.props as {
        'data-builtin-info'?: Pick<
          Builtin,
          'defaults' | 'sponsorGrid' | 'sponsorSlot' | 'linkPath'
        >;
      }
    )['data-builtin-info'],
    region: (node.props as { 'data-region'?: string })['data-region'],
    label:
      (node.props as { 'data-label'?: string })['data-label'] ||
      ((node.props as { className?: string }).className || 'Section ' + (i + 1))
        .split(' ')[0]
        .replaceAll('-', ' '),
  }));
  // Defaults must arrive from the server. Missing data may be a failed load,
  // not a new page, and must never become an editable empty replacement.
  const row = ctx.data['layout:' + page];
  const savedValue = row?.value;
  const layout = useMemo(() => {
    try {
      if (savedValue === undefined) return null;
      const parsed = JSON.parse(savedValue);
      return validateLayout(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }, [savedValue]);
  // A rejected saved layout is not an empty page. Mounting StudioEditor with
  // emptyLayout would let its next autosave replace the original content and
  // propagate empty header/footer styles to other pages.
  if (!row || !layout)
    return (
      <div className="canvas-shell" role="alert" style={{ padding: 32 }}>
        <h2>
          {row
            ? 'Saved page layout could not be loaded'
            : 'Page layout was not received'}
        </h2>
        <p>
          Editing is paused to protect this page.{' '}
          {row
            ? 'The saved layout has been kept unchanged. You can download it for recovery.'
            : 'The server must provide this page’s layout before editing can begin. No replacement has been created.'}
        </p>
        {row && (
          <a
            href={
              'data:application/json;charset=utf-8,' +
              encodeURIComponent(row.value)
            }
            download={`${page}-saved-layout.json`}
          >
            Download saved layout
          </a>
        )}
      </div>
    );
  if (ctx.editing)
    return (
      <Suspense fallback={<EditorLoading />}>
        <StudioEditor
          key={page}
          page={page}
          ctx={ctx}
          layout={layout}
          version={row.version}
          builtins={builtins}
        />
      </Suspense>
    );
  return (
    <div className="canvas-shell">
      <CanvasSurface
        key={page}
        templateId={templateFor(ctx.data)?.id}
        appearanceId={ctx.data['site:appearance']?.value}
        layout={layout}
        page={page}
        builtins={builtins}
        publication={ctx.publication}
      />
    </div>
  );
}
