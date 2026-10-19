/* eslint-disable next/no-img-element -- The standalone Node/static renderer has no Next image optimizer. */
'use client';
import { copiedPage } from './custom-pages';
import { SelectionOutline } from './selection-outline';
import { InlineTextEditor } from './inline-text-editor';
import { filterLayerIds, layerBreadcrumb } from './studio-view';
import { TextEditDialog } from './text-edit-dialog';
import { LinkEditor } from './link-editor';
import { templateFor } from './templates';
import { StudioPreview } from './studio-preview';
import { SiteHeader } from './site-header';
import { StudioProjects } from './studio-projects';
import { pageDiffFiles } from './assistant-diff';
import {
  HeaderControls,
  parseHeader,
  HEADER_FIELD,
  type HeaderDesign,
} from './header-design';
import { aiRequest } from './ai-request';
import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import {
  ArrowLeft,
  ArrowDown,
  ArrowUp,
  Copy,
  Eye,
  EyeOff,
  GripVertical,
  Layers,
  LockKeyhole,
  UnlockKeyhole,
  Monitor,
  Tablet,
  Smartphone,
  Undo2,
  Redo2,
  Save,
  Trash2,
  Upload,
  MousePointer2,
  Sparkles,
  Code2,
  SlidersHorizontal,
  Pencil,
  Link,
  FilePenLine,
  ArrowRight,
  LoaderCircle,
  ChevronRight,
  ChevronDown,
  ListTree,
  Plus,
  Bot,
  PanelLeft,
  PanelRight,
  Scan,
} from 'lucide-react';
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from '@/components/ui/resizable';
import { useDefaultLayout, usePanelRef } from 'react-resizable-panels';
import { useLayerDrag } from './use-layer-drag';
import { preparePageSwitch } from './studio-navigation';
import { pageCatalog, parseRemovedPages, REMOVED_PAGES } from './custom-pages';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { StudioPages, StudioPageTabs } from './studio-pages';
import { pickDesignTarget, type DesignTarget } from './studio-target';
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSub,
  ContextMenuSubTrigger,
  ContextMenuSubContent,
  ContextMenuSeparator,
} from '@/components/ui/context-menu';
import { HexColorPicker } from './hex-color-picker';
import { previewFields, type PageProposal } from './page-proposal';
import { CssPanel, type AssistantRequest } from './css-panel';
import { cssError } from './custom-css';
import { SelectionDock } from './selection-dock';
import { useCanvasObjectMove } from './selection-move';
import { SelectionResize } from './selection-resize';
import { HtmlPositionControls } from './html-position-controls';
import { StudioInsertMenu } from './studio-insert-menu';
import { AiLinkDialog } from './ai-link-dialog';
import { isChromeId } from './chrome-sync';
import { projectFetch } from './project-api';
import { ReferencesEditor, newReference } from './references-editor';
import { CustomHtmlEditor } from './custom-html-editor';
import { htmlExample } from './html-document';
import { EquationBlock } from './equation-block';
import { AccordionEditor, newAccordionItem } from './accordion-editor';
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  parseMenu,
  resolveMenu,
  validMenu,
  SITE_MENU,
  type SiteMenu,
} from './site-menu';
import { sectionIndexLabel, sectionIndexTargets } from './section-navigator';
import type { LivePeer } from './live-sync';
import {
  applySelectionStyle,
  normalizePdfPlacementCss,
} from './selection-style';
import { StudioNumber } from './studio-number';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { CanvasSurface, type Builtin } from './canvas-surface';
import { layerTreeRows } from './studio-layer-tree';
import {
  CUSTOM_CONTENT,
  newNode,
  hierarchyOrder,
  descendants,
  nodeLocked,
  validateLayout,
  type CanvasLayout,
  type CanvasNode,
  type BlockKind,
} from './canvas-schema';
import {
  duplicateNodes,
  insertNode,
  stackNode,
  freePlacement,
  historyReducer,
  materialize,
  mergeLayouts,
  moveBefore,
  patchNodes,
  removeNodes,
  same,
  snapSpan,
} from './studio-engine';
import { uploadMedia } from './upload-media';
import type { CanvasContextValue } from './page-canvas';

function Choice({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: [string, string][];
  onChange: (v: string) => void;
}) {
  return (
    <label className="studio-field">
      <span>{label}</span>
      <Select
        value={value}
        onValueChange={(v) => v !== null && onChange(String(v))}
      >
        <SelectTrigger aria-label={label}>
          <SelectValue>
            {options.find((o) => o[0] === value)?.[1] || value}
          </SelectValue>
        </SelectTrigger>
        <SelectContent
          className="studio-select-menu"
          align="start"
          alignItemWithTrigger={false}
        >
          {options.map(([v, t]) => (
            <SelectItem value={v} key={v}>
              {t}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}
/** Teammates' current selections, drawn in canvas coordinates so they scroll with the page. */
function PeerSelections({
  peers,
  artboard,
  revision,
  zoom,
  viewport,
}: {
  peers: LivePeer[];
  artboard: RefObject<HTMLDivElement | null>;
  revision: unknown;
  zoom: number;
  viewport: number;
}) {
  const [boxes, setBoxes] = useState<
    {
      peer: LivePeer;
      left: number;
      top: number;
      width: number;
      height: number;
    }[]
  >([]);
  useLayoutEffect(() => {
    const board = artboard.current;
    if (!board) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const space = board.parentElement!.getBoundingClientRect();
      setBoxes(
        peers.flatMap((peer) => {
          if (!peer.selection) return [];
          let element: Element | null = null;
          try {
            element = board.querySelector(peer.selection.selector);
          } catch {}
          element ||= board.querySelector(
            `[data-layer-id="${CSS.escape(peer.selection.layerId)}"]`,
          );
          const box = element?.getBoundingClientRect();
          return box && box.width && box.height
            ? [
                {
                  peer,
                  left: box.left - space.left,
                  top: box.top - space.top,
                  width: box.width,
                  height: box.height,
                },
              ]
            : [];
        }),
      );
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(board);
    schedule();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [peers, artboard, revision, zoom, viewport]);
  return (
    <div className="studio-peer-layer" aria-hidden="true">
      {boxes.map(({ peer, ...box }) => (
        <div
          key={peer.id}
          className="studio-peer-selection"
          style={{ ...box, '--peer': peer.color } as CSSProperties}
        >
          <span>
            {peer.name}
            {peer.selection?.label ? ' · ' + peer.selection.label : ''}
          </span>
        </div>
      ))}
    </div>
  );
}
// Set when jumping to a teammate on another page; read after it opens.
const PEER_FOCUS = 'prion-peer-focus';
const studioStorage = {
  getItem(key: string) {
    try {
      return typeof window === 'undefined'
        ? null
        : window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem(key: string, value: string) {
    try {
      if (typeof window !== 'undefined')
        window.localStorage.setItem(key, value);
    } catch {
      /* Workspace sizing remains usable when storage is disabled. */
    }
  },
};
const mediaKinds: string[] = [
  'image',
  'video',
  'audio',
  'pdf',
  'model',
  'embed',
];
const kindHints: Record<BlockKind, string> = {
  shape: 'Shape — choose geometry, fill, border and dimensions.',
  text: 'Text section — a heading and paragraph. The heading appears in the page index.',
  section: 'Frame — a container you can place other elements inside.',
  button: 'Button — links to a website page or an external URL.',
  template:
    'Template section — double-click its text on the canvas to edit it.',
  image: 'Image — upload a file or paste an HTTPS URL.',
  video: 'Video — upload MP4/WebM or paste an HTTPS URL.',
  audio: 'Audio — upload a file or paste an HTTPS URL.',
  references: 'References — add sources and copy citations into your text.',
  html: 'Custom HTML — create an isolated HTML, CSS and JavaScript animation.',
  equation: 'LaTeX equation — type math notation and preview it live.',
  pdf: 'PDF document — upload a file or paste an HTTPS URL.',
  model: '3D model — upload a self-contained GLB file.',
  embed: 'Embedded video — paste a YouTube, Vimeo or iGEM video link.',
  accordion:
    'Collapsible sections — readers open each one independently; the page never jumps.',
};
const kinds: [string, string][] = [
  ['shape', 'Shape'],
  ['section', 'Section / frame'],
  ['button', 'Button'],
  ['text', 'Text'],
  ['equation', 'LaTeX equation'],
  ['references', 'References'],
  ['html', 'Custom HTML'],
  ['image', 'Image'],
  ['video', 'Video'],
  ['audio', 'Audio'],
  ['pdf', 'PDF document'],
  ['model', '3D model (GLB)'],
  ['embed', 'Embedded video'],
  ['accordion', 'Collapsible sections'],
];
export function StudioEditor({
  page,
  ctx,
  layout,
  version,
  builtins,
}: {
  page: string;
  ctx: CanvasContextValue;
  layout: CanvasLayout;
  version: number;
  builtins: Builtin[];
}) {
  const studioPages = [
    { slug: 'home', title: 'Home', group: 'Overview' },
    ...pageCatalog(ctx.data),
  ];
  const [pendingPage, setPendingPage] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const [newPageOpen, setNewPageOpen] = useState(false);
  const [duplicateSource, setDuplicateSource] = useState<string | undefined>();
  const [newTitle, setNewTitle] = useState('');
  const [newSlug, setNewSlug] = useState('');
  const [pageError, setPageError] = useState('');
  const [base, setBase] = useState(() => ({
    layout: materialize(layout, builtins),
    version,
  }));
  const [diffBaseline] = useState(() =>
    pageDiffFiles(page, base.layout, ctx.data),
  );
  const [history, dispatch] = useReducer(historyReducer, {
    current: base.layout,
    past: [],
    future: [],
  });
  const current = history.current,
    currentRef = useRef(current);
  useLayoutEffect(() => {
    currentRef.current = current;
  }, [current]);
  const [layerQuery, setLayerQuery] = useState('');
  const [layerKind, setLayerKind] = useState('all');
  const layersPanel = usePanelRef(),
    inspectorPanel = usePanelRef();
  const [layersHidden, setLayersHidden] = useState(false),
    [inspectorHidden, setInspectorHidden] = useState(false);
  const [previewAnchor, setPreviewAnchor] = useState<{
    id: string;
    visit: number;
  } | null>(null);
  const [inlineText, setInlineText] = useState(false);
  const [htmlInteraction, setHtmlInteraction] = useState<{
    id: string;
    selection: string[];
  } | null>(null);
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const layerListRef = useRef<HTMLDivElement>(null);
  const [accordionSelection, setAccordionSelection] = useState<{
    layerId: string;
    itemId: string;
  } | null>(null);
  const [accordionFocus, setAccordionFocus] = useState<{ id: string }>();
  const [insertInside, setInsertInside] = useState(true);
  const revealInserted = useRef<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]),
    [panel, updatePanel] = useState<'design' | 'css' | 'header'>('design');
  const [viewport, setViewport] = useState(1440),
    [zoom, setZoom] = useState(0.6),
    [preview, setPreview] = useState(false),
    [previewOpened, setPreviewOpened] = useState(false),
    [height, setHeight] = useState(1000);
  const [notice, setNotice] = useState(''),
    [error, setError] = useState(''),
    [uploading, setUploading] = useState(false),
    [progress, setProgress] = useState(0);
  const [conflict, setConflict] = useState<{
    remote: CanvasLayout;
    version: number;
    merged: CanvasLayout;
    fields: string[];
  } | null>(null);
  const [textEdit, setTextEdit] = useState<{
    id: string;
    value: string;
    original: string;
    version: number;
  } | null>(null);
  const headerDesign = parseHeader(
    textEdit?.id === HEADER_FIELD
      ? textEdit.value
      : ctx.data[HEADER_FIELD]?.value,
  );
  function changeHeader(design: HeaderDesign) {
    const row = ctx.data[HEADER_FIELD] || { value: '{}', version: 0 };
    setTextEdit((previous) => ({
      id: HEADER_FIELD,
      value: JSON.stringify(design),
      original: previous?.id === HEADER_FIELD ? previous.original : row.value,
      version: previous?.id === HEADER_FIELD ? previous.version : row.version,
    }));
  }
  function openHeader() {
    if (textDirty && textEdit?.id !== HEADER_FIELD) {
      setError(
        'Save or cancel the current text edit before editing the header.',
      );
      return;
    }
    setSelected([]);
    setTarget(null);
    setPanel('header');
  }
  const artboard = useRef<HTMLDivElement>(null),
    ownSave = useRef<{ layout: CanvasLayout; version: number } | null>(null);
  const [target, setTarget] = useState<DesignTarget | null>(null);
  // Elements picked with Shift/Ctrl/Cmd-click; styled together by the dock.
  const [multiTargets, setMultiTargets] = useState<DesignTarget[]>([]);
  const selectionAnchor = useRef<string | null>(null);
  const [marquee, setMarquee] = useState<{
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  } | null>(null);
  const [contextMenuOpen, setContextMenuOpen] = useState(false);
  const [aiLinkOpen, setAiLinkOpen] = useState(false);
  const [deletePageOpen, setDeletePageOpen] = useState(false);
  const [deletingPage, setDeletingPage] = useState(false);
  const [elementText, setElementText] = useState<{
    id: string;
    property: 'title' | 'body' | 'linkLabel';
    value: string;
  } | null>(null);
  function editElementText(picked: DesignTarget | null, inline = false) {
    setInlineText(inline);
    if (
      !picked ||
      ctx.locked ||
      ctx.busy ||
      nodeLocked(currentRef.current, picked.layerId)
    )
      return;
    if (picked.fieldId) ctx.beginText?.(picked.fieldId);
    else if (picked.textProperty) {
      const item = currentRef.current.nodes.find(
        (n) => n.id === picked.layerId,
      );
      if (item)
        setElementText({
          id: item.id,
          property: picked.textProperty,
          value:
            item[picked.textProperty] ||
            (picked.textProperty === 'linkLabel' ? item.title || 'Button' : ''),
        });
    }
  }

  function saveElementText() {
    if (
      !elementText ||
      disabled ||
      nodeLocked(currentRef.current, elementText.id)
    )
      return;
    edit(
      patchNodes(currentRef.current, [elementText.id], {
        [elementText.property]: elementText.value,
      }),
    );
    setElementText(null);
  }
  function editSelectedLink() {
    setPanel('design');
    requestAnimationFrame(() => {
      const section = document.getElementById(
        'studio-page-link',
      ) as HTMLDetailsElement | null;
      if (section) {
        section.open = true;
        section.scrollIntoView({ block: 'nearest' });
        section
          .querySelector<HTMLInputElement>('input')
          ?.focus({ preventScroll: true });
      }
    });
  }
  const [showCode, setShowCode] = useState(false);
  const [assistantActions, setAssistantActions] =
    useState<HTMLDivElement | null>(null);
  const [incomingRequest, setIncomingRequest] =
    useState<AssistantRequest | null>(null);
  function setPanel(next: 'design' | 'css' | 'header') {
    if (next !== 'css') setIncomingRequest(null);
    updatePanel(next);
  }
  const [pageQuery, setPageQuery] = useState('');
  const [sidebarTab, setSidebarTab] = useState<'layers' | 'pages'>('layers');
  useLayoutEffect(() => {
    const id = target?.layerId || selected.at(-1);
    if (!id || preview) return;
    const layout = currentRef.current;
    const ancestors = new Set<string>();
    let parent = layout.nodes.find((item) => item.id === id)?.parentId;
    while (parent && !ancestors.has(parent)) {
      ancestors.add(parent);
      parent = layout.nodes.find((item) => item.id === parent)?.parentId;
    }
    if (accordionSelection?.layerId === id) ancestors.add(id);
    let scrollFrame = 0;
    const frame = requestAnimationFrame(() => {
      setSidebarTab('layers');
      setCollapsed((previous) =>
        previous.some((item) => ancestors.has(item))
          ? previous.filter((item) => !ancestors.has(item))
          : previous,
      );
      // Let the expanded rows mount before measuring the scroll region.
      scrollFrame = requestAnimationFrame(() => {
        const list = layerListRef.current;
        const row =
          (accordionSelection?.layerId === id
            ? list?.querySelector<HTMLElement>(
                `[data-studio-parent="${CSS.escape(id)}"][data-studio-item="${CSS.escape(accordionSelection.itemId)}"]`,
              )
            : null) ||
          list?.querySelector<HTMLElement>(
            `[data-studio-layer="${CSS.escape(id)}"]`,
          );
        if (!list || !row) return;
        // Scroll only Layers. scrollIntoView would also move the page canvas.
        const bounds = list.getBoundingClientRect(),
          item = row.getBoundingClientRect();
        if (item.top < bounds.top) list.scrollTop += item.top - bounds.top - 8;
        else if (item.bottom > bounds.bottom)
          list.scrollTop += item.bottom - bounds.bottom + 8;
      });
    });
    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(scrollFrame);
    };
  }, [selected, target, accordionSelection, preview]);

  const [openPages, setOpenPages] = useState<string[]>(() => {
    try {
      const ids = JSON.parse(studioStorage.getItem('prion-open-pages') || '[]');
      return Array.isArray(ids)
        ? [
            ...new Set([
              ...ids.filter((id: unknown) =>
                studioPages.some((entry) => entry.slug === id),
              ),
              page,
            ]),
          ].slice(0, 80)
        : [page];
    } catch {
      return [page];
    }
  });
  useEffect(() => {
    studioStorage.setItem('prion-open-pages', JSON.stringify(openPages));
  }, [openPages]);
  const [cssEnabled, setCssEnabled] = useState(true),
    [cssPreview, updateCssPreview] = useState<string | undefined>(),
    [autoFit, setAutoFit] = useState(true);
  const [pagePreview, setPagePreview] = useState<PageProposal | null>(null);
  const setCssPreview = useCallback((value: string | undefined) => {
    updateCssPreview(value);
    if (value === undefined) setPagePreview(null);
  }, []);
  const stageRef = useRef<HTMLDivElement>(null);
  const panelLayout = useDefaultLayout({
    id: 'prion-studio-panels-v2',
    storage: studioStorage,
    panelIds: ['layers', 'canvas', 'inspector'],
  });
  const disabled = ctx.busy || ctx.locked || uploading || Boolean(conflict);
  const changed = useMemo(
      () => !same(current, base.layout),
      [current, base.layout],
    ),
    textDirty = Boolean(textEdit && textEdit.value !== textEdit.original),
    dirty =
      changed ||
      textDirty ||
      uploading ||
      Boolean(
        elementText &&
        elementText.value !==
          (current.nodes.find((n) => n.id === elementText.id)?.[
            elementText.property
          ] || ''),
      );
  const node =
    selected.length === 1
      ? current.nodes.find((n) => n.id === selected[0])
      : undefined;
  const interactingHtmlId =
    !preview && htmlInteraction?.selection === selected
      ? htmlInteraction.id
      : undefined;
  const dockTarget = node
    ? target?.layerId === node.id
      ? target
      : {
          layerId: node.id,
          selector: `[data-layer-id="${node.id}"]`,
          label: node.name || node.title || node.kind,
        }
    : null;
  const layerTargets: DesignTarget[] =
    selected.length > 1 && !multiTargets.length
      ? selected.map((id) => {
          const n = current.nodes.find((item) => item.id === id);
          return {
            layerId: id,
            selector: `[data-layer-id="${id}"]`,
            label: n?.name || n?.title || n?.kind || id,
          };
        })
      : [];
  const styleTargets: DesignTarget[] =
    multiTargets.length > 1
      ? multiTargets
      : layerTargets.length
        ? layerTargets
        : dockTarget
          ? [dockTarget]
          : [];
  const dockAnchor =
    styleTargets.length > 1
      ? (target && styleTargets.find((t) => t.selector === target.selector)) ||
        styleTargets.at(-1)!
      : dockTarget;
  const styleLocked = styleTargets.some((t) => nodeLocked(current, t.layerId));
  const filteredLayers = useMemo(
    () => filterLayerIds(current, layerQuery, layerKind),
    [current, layerQuery, layerKind],
  );
  const layerNodes = useMemo(
    () => new Map(current.nodes.map((n) => [n.id, n])),
    [current.nodes],
  );
  const visibleLayerRows = useMemo(
    () =>
      layerTreeRows(current, filteredLayers ? [] : collapsed).filter(
        (row) => !filteredLayers || filteredLayers.has(row.id),
      ),
    [current, filteredLayers, collapsed],
  );
  const breadcrumbs = layerBreadcrumb(current, selected.at(-1));
  const zoomRef = useRef(zoom);
  useLayoutEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);
  const zoomAnchor = useRef<{
    selector?: string;
    x: number;
    y: number;
    screenX: number;
    screenY: number;
  } | null>(null);
  const selectionElement = useCallback(() => {
    return artboard.current?.querySelector<HTMLElement>(
      target?.selector || `[data-layer-id="${selected.at(-1)}"]`,
    );
  }, [target, selected]);
  const changeZoom = useCallback(
    (next: number, fitSelection = false) => {
      const area = stageRef.current,
        board = artboard.current;
      if (area && board && next !== zoomRef.current) {
        const bounds = area.getBoundingClientRect(),
          element = selectionElement();
        const r = (element || board).getBoundingClientRect();
        const centerX = bounds.left + area.clientWidth / 2,
          centerY = bounds.top + area.clientHeight / 2;
        const x = fitSelection
          ? r.left + r.width / 2
          : Math.max(r.left, Math.min(r.right, centerX));
        const y = fitSelection
          ? r.top + Math.min(r.height, area.clientHeight) / 2
          : Math.max(r.top, Math.min(r.bottom, centerY));
        zoomAnchor.current = {
          selector: element
            ? target?.selector || `[data-layer-id="${selected.at(-1)}"]`
            : undefined,
          x: (x - r.left) / zoomRef.current,
          y: (y - r.top) / zoomRef.current,
          screenX: fitSelection
            ? centerX
            : Math.max(bounds.left + 24, Math.min(bounds.right - 24, x)),
          screenY: fitSelection
            ? centerY
            : Math.max(bounds.top + 24, Math.min(bounds.bottom - 24, y)),
        };
      }
      setZoom(next);
    },
    [selectionElement, target, selected],
  );
  useLayoutEffect(() => {
    const anchor = zoomAnchor.current,
      area = stageRef.current,
      board = artboard.current;
    if (!anchor || !area || !board) return;
    zoomAnchor.current = null;
    const element = anchor.selector
      ? board.querySelector(anchor.selector)
      : board;
    if (!element) return;
    const r = element.getBoundingClientRect();
    area.scrollLeft += r.left + anchor.x * zoom - anchor.screenX;
    area.scrollTop += r.top + anchor.y * zoom - anchor.screenY;
  }, [zoom]);
  function fitSelected() {
    const element = selectionElement(),
      area = stageRef.current;
    if (!element || !area) return;
    const r = element.getBoundingClientRect();
    const next = Math.max(
      0.1,
      Math.min(
        1.5,
        (area.clientWidth - 56) / (r.width / zoom),
        (area.clientHeight - 80) / Math.min(r.height / zoom, 500),
      ),
    );
    setAutoFit(false);
    changeZoom(next, true);
    if (next === zoom)
      element.scrollIntoView({ block: 'center', inline: 'center' });
  }
  function openPreview() {
    if (preview) {
      setPreview(false);
      return;
    }
    const area = stageRef.current?.getBoundingClientRect();
    const visible =
      area &&
      Array.from(
        artboard.current?.querySelectorAll<HTMLElement>('[data-layer-id]') ||
          [],
      )
        .map((element) => ({ element, rect: element.getBoundingClientRect() }))
        .filter(
          ({ rect }) =>
            rect.bottom > area.top + 30 &&
            rect.top < area.bottom &&
            rect.height > 0,
        )
        .sort(
          (a, b) =>
            Math.abs(a.rect.top - area.top) - Math.abs(b.rect.top - area.top),
        )[0]?.element;
    const id = selected.at(-1) || visible?.dataset.layerId;
    setPreviewAnchor(id ? { id, visit: Date.now() } : null);
    setPreviewOpened(true);
    setPreview(true);
  }

  const moveObject = (picked: DesignTarget, x: number, y: number) => {
    if (disabled || nodeLocked(currentRef.current, picked.layerId)) return;
    try {
      const scope =
        viewport <= 760 ? 'mobile' : viewport <= 1000 ? 'tablet' : 'all';
      const element = artboard.current?.querySelector(picked.selector);
      let customCss = normalizePdfPlacementCss(
        currentRef.current.customCss || '',
        currentRef.current.nodes
          .filter((node) => node.kind === 'pdf')
          .map((node) => node.id),
      );
      if (element && getComputedStyle(element).display === 'inline')
        customCss = applySelectionStyle(
          customCss,
          picked.selector,
          'display',
          'inline-block',
          scope,
        );
      customCss = applySelectionStyle(
        customCss,
        picked.selector,
        'translate',
        `${x}px ${y}px`,
        scope,
      );
      setCssEnabled(true);
      edit({ ...currentRef.current, customCss });
      dispatch({ type: 'end' });
    } catch (error) {
      setError(
        error instanceof Error ? error.message : 'Could not move this element.',
      );
    }
  };
  const [objectResizing, setObjectResizing] = useState(false);
  const objectDragging = useCanvasObjectMove({
    artboard,
    target: dockTarget,
    zoom,
    disabled:
      disabled ||
      preview ||
      cssPreview !== undefined ||
      Boolean(elementText) ||
      Boolean(pagePreview),
    canMove: (id) => !nodeLocked(currentRef.current, id),
    onSelect: (picked) => {
      setSelected([picked.layerId]);
      setTarget(picked);
    },
    onMove: moveObject,
  });
  const spanKey =
    viewport <= 760 ? 'mobileSpan' : viewport <= 1000 ? 'tabletSpan' : 'span';
  const effectiveSpan = (n: CanvasNode) =>
    spanKey === 'mobileSpan'
      ? (n.mobileSpan ?? 12)
      : spanKey === 'tabletSpan'
        ? (n.tabletSpan ?? n.span)
        : n.span;
  const container =
    node &&
    (['section', 'template', 'accordion', 'text'].includes(node.kind)
      ? node
      : current.nodes.find((n) => n.id === node.parentId));
  const insertItem =
    container?.kind === 'accordion'
      ? container.items?.find(
          (item) =>
            item.id ===
            (accordionSelection?.layerId === container.id
              ? accordionSelection.itemId
              : node?.parentItemId),
        )
      : undefined;
  const insertContainer =
    container?.kind === 'accordion' && !insertItem ? undefined : container;
  const sponsorNode =
    node?.kind === 'image' &&
    Boolean(builtins.find((b) => b.id === node.parentId)?.sponsorGrid);
  const editable = selected.some((id) => !nodeLocked(current, id));

  const allowUnload = useRef(false);
  const reportDirty = ctx.dirty;
  useEffect(() => {
    reportDirty(dirty);
    return () => reportDirty(false);
  }, [dirty, reportDirty]);
  useEffect(() => {
    document.body.classList.add('studio-open');
    return () => document.body.classList.remove('studio-open');
  }, []);
  useEffect(() => {
    const guard = (e: BeforeUnloadEvent) => {
      if (allowUnload.current) return;
      e.preventDefault();
    };
    if (dirty) window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [dirty]);
  useEffect(() => {
    if (!artboard.current) return;
    const observer = new ResizeObserver((entries) =>
      setHeight(entries[0].contentRect.height),
    );
    observer.observe(artboard.current);
    return () => observer.disconnect();
  }, []);
  const builtinSpec = JSON.stringify(
    builtins.map(({ id, label, defaults, linkPath }) => ({
      id,
      label,
      defaults,
      linkPath,
    })),
  );
  const builtinInfo = useMemo(
    () =>
      JSON.parse(builtinSpec) as {
        id: string;
        label: string;
        defaults?: Partial<CanvasNode>;
        linkPath?: string;
      }[],
    [builtinSpec],
  );
  useEffect(() => {
    if (version <= base.version) return;
    const remote = materialize(layout, builtinInfo);
    if (
      ownSave.current?.version === version &&
      same(ownSave.current.layout, remote)
    ) {
      setBase({ layout: remote, version });
      ownSave.current = null;
      return;
    }
    if (same(currentRef.current, base.layout)) {
      dispatch({ type: 'rebase', base: base.layout, remote });
      setBase({ layout: remote, version });
      setConflict(null);
      return;
    }
    const result = mergeLayouts(base.layout, currentRef.current, remote);
    if (result.conflicts.length) {
      setConflict({
        remote,
        version,
        merged: result.layout,
        fields: result.conflicts,
      });
      return;
    }
    dispatch({ type: 'rebase', base: base.layout, remote });
    setBase({ layout: remote, version });
    setConflict(null);
  }, [version, layout, base.version, base.layout, builtinInfo]); // A revision is the synchronization boundary.
  const previewData = useMemo(
    () => ({
      ...ctx.data,
      ...Object.fromEntries(
        (pagePreview?.fields || []).map((f) => [
          f.id,
          { value: f.value, version: 0, author: '' },
        ]),
      ),
      ...(textEdit
        ? {
            [textEdit.id]: {
              value: textEdit.value,
              version: textEdit.version,
              author: '',
            },
          }
        : {}),
      ['layout:' + page]: {
        value: JSON.stringify({
          ...(pagePreview?.layout || current),
          ...(cssPreview !== undefined ? { customCss: cssPreview } : {}),
        }),
        version: 0,
        author: '',
      },
    }),
    [ctx.data, pagePreview, textEdit, page, current, cssPreview],
  );
  function edit(value: CanvasLayout, group?: string) {
    if (disabled) return;
    dispatch({ type: 'edit', value, group });
    setError('');
    setNotice('');
  }
  const drag = useLayerDrag(current, selected, disabled, edit);
  useEffect(() => {
    if (!stageRef.current || !autoFit) return;
    const stage = stageRef.current;
    const fit = () =>
      changeZoom(
        Math.max(0.1, Math.min(1.5, (stage.clientWidth - 70) / viewport)),
      );
    const observer = new ResizeObserver(fit);
    observer.observe(stage);
    fit();
    return () => observer.disconnect();
  }, [viewport, autoFit, changeZoom]);
  function patch(changes: Partial<CanvasNode>, group?: string) {
    edit(patchNodes(currentRef.current, selected, changes), group);
  }
  // multiple: true/'toggle' adds or removes a layer; 'range' selects every
  // layer between the last clicked one and this one (Layers panel order).
  function select(id: string, multiple: boolean | 'toggle' | 'range' = false) {
    if (ctx.locked) return;
    setPanel('design');
    const image =
      !multiple &&
      currentRef.current.nodes.find((n) => n.id === id)?.kind === 'image'
        ? artboard.current?.querySelector(
            `[data-layer-id="${CSS.escape(id)}"] .media-image-frame > img`,
          )
        : null;
    setTarget(image ? pickDesignTarget(image) : null);
    setAccordionSelection(null);
    setAccordionFocus(undefined);
    setMultiTargets([]);
    if (multiple === 'range' && selectionAnchor.current) {
      const order = hierarchyOrder(currentRef.current);
      const from = order.indexOf(selectionAnchor.current),
        to = order.indexOf(id);
      if (from >= 0 && to >= 0) {
        setSelected(order.slice(Math.min(from, to), Math.max(from, to) + 1));
        return;
      }
    }
    selectionAnchor.current = id;
    setSelected((ids) =>
      multiple
        ? ids.includes(id)
          ? ids.filter((x) => x !== id)
          : [...ids, id]
        : [id],
    );
  }
  // Shift/Ctrl/Cmd-click on the canvas collects exact elements, even across
  // sections; the layers they belong to become the layer selection.
  function toggleElement(element: Element) {
    const picked = pickDesignTarget(element);
    if (!picked || ctx.locked) return;
    const base = multiTargets.length ? multiTargets : target ? [target] : [];
    const exists = base.some((t) => t.selector === picked.selector);
    const next = exists
      ? base.filter((t) => t.selector !== picked.selector)
      : [...base, picked];
    setPanel('design');
    setMultiTargets(next.length > 1 ? next : []);
    setTarget(next.at(-1) || null);
    setSelected([...new Set(next.map((t) => t.layerId))]);
  }
  // Drag on empty canvas space: select the sections fully inside the box
  // (outermost ones). A plain click there clears the selection.
  function startMarquee(e: PointerEvent<HTMLDivElement>) {
    const x0 = e.clientX,
      y0 = e.clientY,
      adding = e.shiftKey || e.ctrlKey || e.metaKey;
    let moved = false;
    const move = (event: globalThis.PointerEvent) => {
      if (!moved && Math.hypot(event.clientX - x0, event.clientY - y0) < 5)
        return;
      moved = true;
      setMarquee({ x0, y0, x1: event.clientX, y1: event.clientY });
    };
    const up = (event: globalThis.PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setMarquee(null);
      if (!moved) {
        if (!adding) {
          setSelected([]);
          setTarget(null);
          setMultiTargets([]);
        }
        return;
      }
      const box = {
        left: Math.min(x0, event.clientX),
        right: Math.max(x0, event.clientX),
        top: Math.min(y0, event.clientY),
        bottom: Math.max(y0, event.clientY),
      };
      const layout = currentRef.current;
      const inside = Array.from(
        artboard.current?.querySelectorAll<HTMLElement>('[data-layer-id]') ||
          [],
      )
        .filter((element) => {
          const r = element.getBoundingClientRect();
          return (
            r.width > 0 &&
            r.left >= box.left &&
            r.right <= box.right &&
            r.top >= box.top &&
            r.bottom <= box.bottom
          );
        })
        .map((element) => element.dataset.layerId!);
      const outermost = inside.filter((id) => {
        let parent = layout.nodes.find((n) => n.id === id)?.parentId;
        while (parent) {
          if (inside.includes(parent)) return false;
          parent = layout.nodes.find((n) => n.id === parent)?.parentId;
        }
        return !nodeLocked(layout, id);
      });
      setTarget(null);
      setMultiTargets([]);
      setPanel('design');
      setSelected((previous) =>
        adding ? [...new Set([...previous, ...outermost])] : outermost,
      );
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }
  function selectAll() {
    const layout = currentRef.current;
    setTarget(null);
    setMultiTargets([]);
    setSelected(
      layout.order.filter((id) => {
        const n = layout.nodes.find((item) => item.id === id);
        return n && !n.deleted && !n.parentId && !nodeLocked(layout, id);
      }),
    );
  }
  function switchProject(id: string) {
    // Reload after the save/discard guard to reset draft, AI and polling state together.
    allowUnload.current = true;
    if (ctx.switchProject) ctx.switchProject(id);
    else window.location.assign('/?studio=1&project=' + encodeURIComponent(id));
  }
  function navigatePage(slug: string) {
    if (slug === page) return;
    if (dirty || disabled || cssPreview !== undefined) {
      setPendingPage(slug);
      setPageError('');
      return;
    }
    if (slug === '__new__') setNewPageOpen(true);
    else if (slug === '__workspace__') {
      allowUnload.current = true;
      ctx.openWorkspace?.();
    } else if (slug.startsWith('__project__')) switchProject(slug.slice(11));
    else ctx.navigate?.(slug);
  }
  async function resolveNavigation(keep: boolean) {
    if (!pendingPage || resolving || ctx.busy || uploading) return;
    setResolving(true);
    setPageError('');
    try {
      await preparePageSwitch(keep, {
        inlineText: (keep) => ctx.resolveText?.(keep) || Promise.resolve(true),
        textDraft: async () => {
          if (!textDirty || !textEdit) return true;
          if (!(await ctx.save(textEdit.id, textEdit.value, textEdit.version)))
            return false;
          setTextEdit(null);
          return true;
        },
        layout: () => save(true),
      });
      setCssPreview(undefined);
      setTextEdit(null);
      ctx.dirty(false);
      const next = pendingPage;
      setPendingPage(null);
      if (next === '__new__') {
        if (!keep) {
          dispatch({ type: 'reset', value: conflict?.remote || base.layout });
          if (conflict)
            setBase({ layout: conflict.remote, version: conflict.version });
          setConflict(null);
          setError('');
        }
        setNewPageOpen(true);
      } else if (next === '__workspace__') {
        allowUnload.current = true;
        ctx.openWorkspace?.();
      } else if (next.startsWith('__project__')) switchProject(next.slice(11));
      else ctx.navigate?.(next, true);
    } catch (error) {
      setPageError(
        error instanceof Error ? error.message : 'Could not switch pages.',
      );
    } finally {
      setResolving(false);
    }
  }
  function openAssistant(code = false) {
    setShowCode(code);
    setPanel('css');
  }
  useLayoutEffect(() => {
    const picked = multiTargets.length ? multiTargets : target ? [target] : [];
    if (!picked.length || preview) return;
    const elements = picked.flatMap((t) => {
      const element = artboard.current?.querySelector(t.selector);
      return element ? [element] : [];
    });
    elements.forEach((e) => e.classList.add('studio-target-element'));
    return () =>
      elements.forEach((e) => e.classList.remove('studio-target-element'));
  }, [target, multiTargets, current, preview]);
  function duplicate() {
    try {
      const next = duplicateNodes(currentRef.current, selected, () =>
        crypto.randomUUID(),
      );
      edit(next.layout);
      setSelected(next.ids);
      setTarget(null);
      setPanel('design');
    } catch (e) {
      setError(String(e));
    }
  }
  function removeLayers(ids: string[]) {
    if (disabled || preview || cssPreview !== undefined) return;
    const layout = currentRef.current;
    const locked = descendants(layout, ids)
      .map((id) => layout.nodes.find((n) => n.id === id))
      .find((n) => n && nodeLocked(layout, n.id));
    if (locked) {
      setError(
        `Cannot delete this section while “${locked.name || locked.title || locked.kind}” is locked. Unlock it in Layers, then delete the section again.`,
      );
      return;
    }
    const next = removeNodes(layout, ids);
    if (same(next, layout)) {
      setError(
        'Nothing was deleted. Select the section in Layers and try again.',
      );
      return;
    }
    edit(next);
    setSelected([]);
    setTarget(null);
    setMultiTargets([]);
    setNotice('Section deleted. Undo restores it.');
  }
  function remove() {
    removeLayers(selected);
  }
  function removeSelection() {
    if (disabled || preview || cssPreview !== undefined || !selected.length)
      return;
    const layout = currentRef.current;
    if (selected.some((id) => nodeLocked(layout, id))) return;
    const layerSelector = target ? `[data-layer-id="${target.layerId}"]` : '';
    if (multiTargets.length > 1) {
      // Elements are hidden with page CSS; whole layers are deleted/hidden.
      try {
        let next = layout;
        let css = layout.customCss || '';
        const layers: string[] = [];
        for (const t of multiTargets) {
          if (t.selector === `[data-layer-id="${t.layerId}"]`)
            layers.push(t.layerId);
          else css = applySelectionStyle(css, t.selector, 'display', 'none');
        }
        next = removeNodes({ ...next, customCss: css }, layers);
        setCssEnabled(true);
        edit(next);
        setSelected([]);
        setTarget(null);
        setMultiTargets([]);
      } catch (error) {
        setError(
          error instanceof Error
            ? error.message
            : 'Could not delete these elements.',
        );
      }
      return;
    }
    if (
      selected.length === 1 &&
      target &&
      target.layerId === selected[0] &&
      target.selector !== layerSelector
    ) {
      try {
        const customCss = applySelectionStyle(
          layout.customCss || '',
          target.selector,
          'display',
          'none',
        );
        setCssEnabled(true);
        edit({ ...layout, customCss });
        setSelected([]);
        setTarget(null);
      } catch (error) {
        setError(
          error instanceof Error
            ? error.message
            : 'Could not delete this element.',
        );
      }
    } else remove();
  }
  function reorder(direction: number) {
    const order = currentRef.current.order;
    const index =
      direction < 0
        ? Math.min(...selected.map((id) => order.indexOf(id)))
        : Math.max(...selected.map((id) => order.indexOf(id)));
    if (
      index < 0 ||
      (direction < 0 && index === 0) ||
      (direction > 0 && index === order.length - 1)
    )
      return;
    edit(
      moveBefore(
        currentRef.current,
        selected,
        direction < 0 ? order[index - 1] : order[index + 2] || null,
      ),
    );
  }
  function add(
    insertKind: BlockKind,
    inside: boolean,
    destination?: { layerId: string; itemId: string },
  ) {
    const n = {
      ...newNode(
        crypto.randomUUID(),
        insertKind as BlockKind,
        insertKind === 'button' ? 'Button' : '',
      ),
      name:
        inside &&
        insertKind === 'image' &&
        builtins.find((b) => b.id === container?.id)?.sponsorGrid
          ? 'Sponsor logo'
          : kinds.find((k) => k[0] === insertKind)![1],
      padding: insertKind === 'section' ? 24 : 8,
      ...(insertKind === 'references'
        ? { title: 'References', references: [newReference()] }
        : {}),
      ...(insertKind === 'html' ? { ...htmlExample, minHeight: 360 } : {}),
      ...(insertKind === 'equation' ? { body: 'E = mc^2' } : {}),
      ...(insertKind === 'text' ? { body: 'Your text here' } : {}),
      ...(insertKind === 'accordion'
        ? {
            title: 'Questions',
            items: [
              newAccordionItem('First section', 'Add text here.'),
              newAccordionItem('Second section', 'Add text here.'),
            ],
          }
        : {}),
      ...(insertKind === 'button'
        ? { linkTo: '/', linkLabel: 'Learn more' }
        : {}),
      ...(insertKind === 'section'
        ? { layoutMode: 'free' as const, minHeight: 360 }
        : {}),
    };
    let next: CanvasLayout;
    try {
      next = insertNode(current, n, {
        inside:
          destination?.layerId || (inside ? insertContainer?.id : undefined),
        insideItem:
          destination?.itemId || (inside ? insertItem?.id : undefined),
        after: selected.at(-1),
        renderedHeights: insertionHeights(),
      });
    } catch (error) {
      setError(
        error instanceof Error ? error.message : 'Could not add element.',
      );
      return;
    }
    const inserted = next.nodes.find((item) => item.id === n.id)!;
    revealInserted.current = n.id;
    setAccordionSelection(null);
    setAccordionFocus(undefined);
    edit(next);
    if (inserted.parentId)
      setCollapsed((previous) =>
        previous.filter((id) => id !== inserted.parentId),
      );
    setSelected([n.id]);
    setTarget(null);
    setPanel('design');
    setPreview(false);
  }
  function insertionHeights(): Record<string, number> {
    // offsetHeight is in layout pixels, unaffected by the editor's zoom.
    return Object.fromEntries(
      Array.from(
        artboard.current?.querySelectorAll<HTMLElement>('[data-layer-id]') ||
          [],
      ).map((element) => [element.dataset.layerId!, element.offsetHeight]),
    );
  }
  function editAccordionItem(layerId: string, itemId: string) {
    select(layerId);
    setAccordionSelection({ layerId, itemId });
    setAccordionFocus({ id: itemId });
    setInsertInside(true);
    setPreview(false);
  }
  function addAccordionItem(layerId: string) {
    const layout = currentRef.current;
    const accordion = layout.nodes.find((item) => item.id === layerId);
    if (disabled || !accordion || nodeLocked(layout, layerId)) return;
    if ((accordion.items?.length || 0) >= 30) {
      setError(
        'This collapsible element already has 30 subsections. Add another collapsible element for more.',
      );
      return;
    }
    const item = newAccordionItem('New subsection', 'Add text here.');
    edit(
      patchNodes(layout, [layerId], {
        items: [...(accordion.items || []), item],
      }),
    );
    editAccordionItem(layerId, item.id);
  }
  // A subsection is an H3 text block: inside a frame when the anchor is one,
  // otherwise directly after the anchor's top-level section.
  function addSection(subsection = false, anchorId?: string) {
    const anchor = current.nodes.find(
      (n) => n.id === (anchorId ?? selected.at(-1)),
    );
    if (subsection && anchor?.kind === 'accordion') {
      addAccordionItem(anchor.id);
      return;
    }
    const frame =
      subsection &&
      anchor?.kind === 'section' &&
      !nodeLocked(current, anchor.id)
        ? anchor
        : undefined;
    const n: CanvasNode = {
      ...newNode(
        crypto.randomUUID(),
        'text',
        subsection ? 'New subsection' : 'New section',
      ),
      name: subsection ? 'Subsection' : 'Section',
      padding: subsection ? 8 : 24,
      body: subsection
        ? 'Write this subsection’s content here.'
        : 'Write this section’s content here.',
      ...(subsection ? { headingLevel: 3 as const } : {}),
    };
    let next: CanvasLayout;
    try {
      next = insertNode(current, n, {
        inside: frame?.id,
        after: anchorId ?? selected.at(-1),
        renderedHeights: insertionHeights(),
      });
    } catch (error) {
      setError(
        error instanceof Error ? error.message : 'Could not add section.',
      );
      return;
    }
    revealInserted.current = n.id;
    edit(next);
    if (frame)
      setCollapsed((previous) => previous.filter((id) => id !== frame.id));
    setSelected([n.id]);
    setTarget(null);
    setPanel('design');
    setPreview(false);
    setNotice(
      (subsection ? 'Subsection' : 'Section') +
        ' added. Rename its heading; it appears in the page index.',
    );
  }
  const pageDeletable = Boolean(ctx.deletePage) && page !== 'home';
  // The header menu saves immediately (like a teammate's live edit).
  async function saveMenu(next: SiteMenu) {
    if (!validMenu(next)) {
      setError('That menu change is not valid.');
      return;
    }
    const row = ctx.data[SITE_MENU];
    const ok = await ctx.save(
      SITE_MENU,
      JSON.stringify(next),
      row?.version || 0,
      {
        quiet: true,
      },
    );
    if (!ok)
      setError(
        'The menu changed elsewhere and your change was not saved. Try again.',
      );
    else setError('');
  }
  const pageIsCustom =
    studioPages.find((p) => p.slug === page)?.group === 'Custom pages';
  const removedTemplatePages = (() => {
    const template = templateFor(ctx.data);
    if (!template) return [];
    const removed = parseRemovedPages(ctx.data[REMOVED_PAGES]?.value);
    return template.pages
      .filter((p) => removed.includes(p.slug))
      .map((p) => ({ slug: p.slug, title: p.title }));
  })();
  async function deleteCurrentPage() {
    setDeletingPage(true);
    try {
      await ctx.deletePage!(page);
      setDeletePageOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete page.');
      setDeletePageOpen(false);
    } finally {
      setDeletingPage(false);
    }
  }
  // Header/footer changes spread to every page when saved; this also brings
  // pages that drifted apart before that back in line.
  async function shareChrome() {
    if (changed && !(await save())) return;
    try {
      const response = await projectFetch('/api/pages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sync-chrome', page }),
      });
      const result = (await response.json()) as {
        pages?: number;
        error?: string;
      };
      if (!response.ok) throw Error(result.error);
      setNotice(
        result.pages
          ? `Header and footer copied to ${result.pages} other pages.`
          : 'Every page already uses this header and footer.',
      );
    } catch (e) {
      setError(
        e instanceof Error && e.message
          ? e.message
          : 'Could not copy the header.',
      );
    }
  }
  const [pageIndex, setPageIndex] = useState<
    { key: string; label: string; layerId?: string; sub?: boolean }[]
  >([]);
  useEffect(() => {
    // Mirrors the published right-side index, which is not drawn inside the editor.
    const frame = requestAnimationFrame(() => {
      const board = artboard.current;
      const main = board?.querySelector('main') || board;
      if (!main) return;
      setPageIndex(
        sectionIndexTargets(main).map((element: HTMLElement, i: number) => ({
          key: i + ':' + sectionIndexLabel(element),
          label: sectionIndexLabel(element),
          sub: element.tagName === 'H3',
          layerId:
            element.closest<HTMLElement>('[data-layer-id]')?.dataset.layerId,
        })),
      );
    });
    return () => cancelAnimationFrame(frame);
  }, [current, page, preview, viewport, ctx.data]);
  useLayoutEffect(() => {
    const id = revealInserted.current;
    if (!id) return;
    const frame = requestAnimationFrame(() => {
      artboard.current
        ?.querySelector(`[data-layer-id="${id}"]`)
        ?.scrollIntoView({ block: 'center', inline: 'nearest' });
      revealInserted.current = null;
    });
    return () => cancelAnimationFrame(frame);
  }, [current]);
  async function save(forNavigation = false): Promise<boolean> {
    if (
      autoSaving.current ||
      ctx.busy ||
      uploading ||
      conflict ||
      (!forNavigation && (ctx.locked || cssPreview !== undefined))
    )
      return false;
    if (!changed) return true;
    const styleError = cssError(current.customCss || '');
    if (styleError) {
      setPanel('css');
      setShowCode(true);
      setError(styleError);
      return false;
    }
    if (!validateLayout(current)) {
      setError(
        'Check the media URL and property values. Embeds must use an iGEM, YouTube, or Vimeo embed URL.',
      );
      return false;
    }
    const value = current;
    ownSave.current = { layout: value, version: base.version + 1 };
    if (await ctx.save('layout:' + page, JSON.stringify(value), base.version)) {
      setBase({ layout: value, version: base.version + 1 });
      setNotice('Layout saved.');
      return true;
    } else {
      ownSave.current = null;
      setError(
        'Layout was not saved. Check the message above; your draft is retained.',
      );
    }
    return false;
  }
  // Live sync: layout drafts save themselves shortly after editing stops, and
  // the server tells teammates at once. "Save now" remains for impatience.
  const autoSaving = useRef(false);
  const [syncState, setSyncState] = useState<
    'idle' | 'saving' | 'invalid' | 'retry'
  >('idle');
  async function autoSave() {
    if (autoSaving.current || !changed) return;
    if (cssError(current.customCss || '') || !validateLayout(current)) {
      setSyncState('invalid');
      return;
    }
    autoSaving.current = true;
    setSyncState('saving');
    const value = current,
      version = base.version;
    ownSave.current = { layout: value, version: version + 1 };
    const ok = await ctx.save(
      'layout:' + page,
      JSON.stringify(value),
      version,
      {
        quiet: true,
      },
    );
    autoSaving.current = false;
    if (ok) {
      setBase({ layout: value, version: version + 1 });
      setSyncState('idle');
    } else {
      ownSave.current = null;
      setSyncState('retry');
    }
  }
  const autoSaveRef = useRef(autoSave);
  useLayoutEffect(() => {
    autoSaveRef.current = autoSave;
  });
  useEffect(() => {
    if (
      !changed ||
      conflict ||
      ctx.locked ||
      ctx.busy ||
      uploading ||
      cssPreview !== undefined ||
      pagePreview ||
      drag.visual ||
      objectDragging
    )
      return;
    const timer = setTimeout(
      () => void autoSaveRef.current(),
      syncState === 'retry' ? 3000 : 600,
    );
    return () => clearTimeout(timer);
  }, [
    changed,
    current,
    base.version,
    conflict,
    ctx.locked,
    ctx.busy,
    uploading,
    cssPreview,
    pagePreview,
    drag.visual,
    objectDragging,
    syncState,
  ]);
  const setLiveSelection = ctx.setSelection;
  const liveSelector = preview ? '' : dockTarget?.selector || '';
  const liveLabel = dockTarget?.label || '';
  const liveLayer = dockTarget?.layerId || '';
  useEffect(() => {
    setLiveSelection?.(
      page,
      liveSelector
        ? {
            layerId: liveLayer,
            selector: liveSelector,
            label: liveLabel.slice(0, 120),
          }
        : null,
    );
  }, [setLiveSelection, page, liveSelector, liveLabel, liveLayer]);
  useEffect(
    () => () => setLiveSelection?.(page, null),
    [setLiveSelection, page],
  );
  const pagePeers = (ctx.peers || []).filter((peer) => peer.page === page);
  // Everyone editing this project, people on this page first.
  const projectPeers = [...(ctx.peers || [])]
    .filter((peer) => peer.page)
    .sort((a, b) => Number(b.page === page) - Number(a.page === page));
  const pageName = (slug: string) =>
    studioPages.find((p) => p.slug === slug)?.title || slug;
  const peerLabel = (peer: LivePeer) =>
    peer.name +
    (peer.page === page ? ' — on this page' : ' — on ' + pageName(peer.page)) +
    (peer.selection?.label ? ', selected ' + peer.selection.label : '');
  function revealLayer(layerId: string) {
    const element = artboard.current?.querySelector(
      `[data-layer-id="${CSS.escape(layerId)}"]`,
    );
    element?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    return Boolean(element);
  }
  function goToPeer(peer: LivePeer) {
    if (peer.page === page) {
      if (peer.selection) revealLayer(peer.selection.layerId);
      return;
    }
    try {
      sessionStorage.setItem(
        PEER_FOCUS,
        JSON.stringify({ page: peer.page, layerId: peer.selection?.layerId }),
      );
    } catch {
      /* Without storage the jump still opens their page. */
    }
    navigatePage(peer.page);
  }
  // After jumping to a teammate's page, scroll to what they have selected.
  useEffect(() => {
    let focus: { page?: string; layerId?: string } | null = null;
    try {
      focus = JSON.parse(sessionStorage.getItem(PEER_FOCUS) || 'null');
      if (focus?.page === page) sessionStorage.removeItem(PEER_FOCUS);
    } catch {
      /* Storage unavailable: nothing to reveal. */
    }
    if (!focus || focus.page !== page) return;
    if (!focus.layerId) return;
    let tries = 0;
    const timer = setInterval(() => {
      const element = artboard.current?.querySelector(
        `[data-layer-id="${CSS.escape(focus.layerId!)}"]`,
      );
      element?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      if (element || ++tries > 20) clearInterval(timer);
    }, 150);
    return () => clearInterval(timer);
  }, [page]);
  async function upload(file: File) {
    if (!node || disabled) return;
    const id = node.id,
      kind = node.kind;
    setUploading(true);
    setProgress(0);
    setError('');
    try {
      const result = await uploadMedia(file, setProgress);
      const nextKind =
        kind === 'template'
          ? 'template'
          : result.type.startsWith('image/')
            ? 'image'
            : result.type.startsWith('video/')
              ? 'video'
              : result.type.startsWith('audio/')
                ? 'audio'
                : result.type === 'application/pdf'
                  ? 'pdf'
                  : 'model';
      if (!currentRef.current.nodes.some((n) => n.id === id)) {
        setError(
          'The section was removed while uploading. Add a new section to use this file.',
        );
        return;
      }
      dispatch({
        type: 'edit',
        value: patchNodes(currentRef.current, [id], {
          src: result.url,
          kind: nextKind,
        }),
      });
      setNotice('File uploaded. Save the layout to share its placement.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed.');
    } finally {
      setUploading(false);
    }
  }
  async function addImages(files: File[]) {
    if (disabled || !files.length) return;
    const destination = insertContainer?.id;
    const insideItem = insertItem?.id;
    const after = selected.at(-1);
    setUploading(true);
    setError('');
    const uploaded: CanvasNode[] = [];
    const failures: string[] = [];
    try {
      for (const file of files) {
        try {
          if (!file.type.startsWith('image/'))
            throw Error('Choose an image file.');
          setProgress(0);
          const result = await uploadMedia(file, setProgress);
          uploaded.push({
            ...newNode(crypto.randomUUID(), 'image'),
            name: file.name.slice(0, 100),
            src: result.url,
            alt: '',
            span: files.length > 1 ? 6 : 12,
            padding: 8,
          });
        } catch (error) {
          failures.push(
            `${file.name}: ${error instanceof Error ? error.message : 'Upload failed.'}`,
          );
        }
      }
      if (uploaded.length) {
        let next = currentRef.current;
        let anchor = after;
        for (const image of uploaded) {
          next = insertNode(next, image, {
            inside: destination,
            insideItem,
            after: anchor,
            renderedHeights: insertionHeights(),
          });
          anchor = image.id;
        }
        edit(next);
        setSelected([uploaded[uploaded.length - 1].id]);
        setTarget(null);
        if (destination)
          setCollapsed((prev) => prev.filter((id) => id !== destination));
        setNotice(
          `${uploaded.length} image${uploaded.length === 1 ? '' : 's'} added as separate layers. Existing text and pictures are kept. Save to share.`,
        );
      }
      if (failures.length) setError(failures.join(' '));
    } catch (error) {
      setError(
        error instanceof Error ? error.message : 'Could not add images.',
      );
    } finally {
      setUploading(false);
    }
  }
  function arrange(direction: 'front' | 'back') {
    if (!node || disabled) return;
    try {
      edit(stackNode(currentRef.current, node.id, direction));
    } catch (error) {
      setError(
        error instanceof Error ? error.message : 'Could not arrange layer.',
      );
    }
  }
  function freeGesture(
    event: PointerEvent<HTMLElement>,
    id: string,
    resizing: boolean,
  ) {
    if (disabled || nodeLocked(currentRef.current, id)) return;
    const item = currentRef.current.nodes.find((n) => n.id === id)!;
    const region =
      event.currentTarget.closest('[data-layer-id]')?.parentElement;
    if (!region?.classList.contains('canvas-children-free')) return;
    event.preventDefault();
    event.stopPropagation();
    setSelected([id]);
    setTarget(null);
    setPanel('design');
    const element = event.currentTarget,
      pointer = event.pointerId,
      startX = event.clientX,
      startY = event.clientY,
      width = region.getBoundingClientRect().width;
    const group = 'free-' + event.timeStamp;
    element.setPointerCapture(pointer);
    const move = (e: globalThis.PointerEvent) => {
      if (e.pointerId !== pointer) return;
      const dx = ((e.clientX - startX) / width) * 100,
        dy = (e.clientY - startY) / zoom;
      const axis = element.dataset.resizeAxis;
      const changes = freePlacement(
        item,
        resizing && axis === 'height' ? 0 : dx,
        resizing && axis === 'width' ? 0 : dy,
        resizing,
      );
      dispatch({
        type: 'edit',
        value: patchNodes(currentRef.current, [id], changes),
        group,
      });
    };
    const end = () => {
      element.removeEventListener('pointermove', move);
      element.removeEventListener('pointerup', end);
      element.removeEventListener('pointercancel', end);
      element.removeEventListener('lostpointercapture', end);
      dispatch({ type: 'end' });
    };
    element.addEventListener('pointermove', move);
    element.addEventListener('pointerup', end);
    element.addEventListener('pointercancel', end);
    element.addEventListener('lostpointercapture', end);
  }
  function resize(event: PointerEvent<HTMLButtonElement>, id: string) {
    if (disabled || nodeLocked(currentRef.current, id)) return;
    const resizing = currentRef.current.nodes.find((n) => n.id === id);
    if (
      viewport > 760 &&
      resizing?.parentId &&
      currentRef.current.nodes.find((n) => n.id === resizing.parentId)
        ?.layoutMode === 'free'
    ) {
      freeGesture(event, id, true);
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    setSelected([id]);
    setTarget(null);
    setPanel('design');
    const element = event.currentTarget,
      start = event.clientX,
      startY = event.clientY,
      n = currentRef.current.nodes.find((n) => n.id === id)!;
    const startHeight =
      element.closest('[data-layer-id]')!.getBoundingClientRect().height / zoom;
    const region = element.closest('[data-layer-id]')!.parentElement!;
    const css = getComputedStyle(region);
    const width =
      region.getBoundingClientRect().width / zoom -
      (parseFloat(css.paddingLeft) || 0) -
      (parseFloat(css.paddingRight) || 0);
    const group = 'resize-' + event.timeStamp;
    const pointer = event.pointerId;
    const axis = element.dataset.resizeAxis || 'both';
    element.setPointerCapture(pointer);
    const move = (e: globalThis.PointerEvent) => {
      if (e.pointerId !== pointer) return;
      dispatch({
        type: 'edit',
        group,
        value: patchNodes(currentRef.current, [id], {
          ...(axis !== 'width'
            ? {
                minHeight: Math.max(
                  20,
                  Math.min(
                    2000,
                    Math.round(startHeight + (e.clientY - startY) / zoom),
                  ),
                ),
              }
            : {}),
          ...(axis !== 'height'
            ? {
                [spanKey]: snapSpan(
                  effectiveSpan(n),
                  (e.clientX - start) / zoom,
                  width,
                  parseFloat(css.columnGap) || 0,
                ),
              }
            : {}),
        }),
      });
    };
    const end = () => {
      element.removeEventListener('pointermove', move);
      element.removeEventListener('pointerup', end);
      element.removeEventListener('pointercancel', end);
      element.removeEventListener('lostpointercapture', end);
      dispatch({ type: 'end' });
    };
    element.addEventListener('pointermove', move);
    element.addEventListener('pointerup', end);
    element.addEventListener('pointercancel', end);
    element.addEventListener('lostpointercapture', end);
  }
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement).closest(
        'input,textarea,select,[contenteditable=true],[role=combobox]',
      );
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (!typing) void save();
        return;
      }
      if (typing || disabled || preview) return;
      if (e.ctrlKey || e.metaKey) {
        if (e.key.toLowerCase() === 'z') {
          e.preventDefault();
          dispatch({ type: e.shiftKey ? 'redo' : 'undo' });
        } else if (e.key.toLowerCase() === 'y') {
          e.preventDefault();
          dispatch({ type: 'redo' });
        } else if (e.key.toLowerCase() === 'd') {
          e.preventDefault();
          duplicate();
        } else if (e.key.toLowerCase() === 'a') {
          e.preventDefault();
          selectAll();
        }
      } else if (e.key === 'Delete' && selected.length) {
        e.preventDefault();
        removeSelection();
      } else if (e.key === 'Escape') {
        setSelected([]);
        setTarget(null);
        setMultiTargets([]);
      } else if (
        e.altKey &&
        ['ArrowUp', 'ArrowDown'].includes(e.key) &&
        selected.length
      ) {
        e.preventDefault();
        reorder(e.key === 'ArrowUp' ? -1 : 1);
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });
  function number(
    label: string,
    key: keyof CanvasNode,
    min: number,
    max: number,
    fallback: number,
    step = 1,
  ) {
    return (
      <label htmlFor={'studio-property-' + key} className="studio-field">
        <span>{label}</span>
        <StudioNumber
          id={'studio-property-' + key}
          label={label}
          min={min}
          max={max}
          step={step}
          value={node?.[key] as number | undefined}
          placeholder={String(fallback)}
          onCommit={(value) =>
            patch(
              { [key]: value ?? (key === 'span' ? 12 : undefined) },
              'property-' + key,
            )
          }
          onEnd={() => dispatch({ type: 'end' })}
        />
      </label>
    );
  }
  function group(id: string, title: ReactNode, open: boolean, body: ReactNode) {
    return (
      <details
        className="studio-group studio-design-group"
        data-design-group={id}
        open={open}
      >
        <summary>{title}</summary>
        <div className="studio-design-group-body">{body}</div>
      </details>
    );
  }
  function color(
    label: string,
    key: 'background' | 'textColor' | 'borderColor',
    fallback: string,
  ) {
    return (
      <label className="studio-field">
        <span>{label}</span>
        <div className="studio-color">
          <HexColorPicker
            label={label}
            value={node?.[key] || fallback}
            disabled={disabled || Boolean(node && nodeLocked(current, node.id))}
            onChange={(value) => patch({ [key]: value }, 'color-' + key)}
            onEnd={() => dispatch({ type: 'end' })}
          />
          <button
            title={'Reset ' + label}
            onClick={() =>
              patch({ [key]: key === 'background' ? '' : undefined })
            }
          >
            ↺
          </button>
        </div>
      </label>
    );
  }

  return (
    <div
      className="studio"
      aria-label="Responsive page editor"
      onClickCapture={(e) => {
        if (drag.suppressClick()) {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
    >
      <div className="studio-topbar" inert={Boolean(elementText && inlineText)}>
        <button
          className="studio-icon"
          onClick={ctx.exit}
          disabled={dirty || ctx.locked || ctx.busy}
          title="Close studio (save or discard drafts first)"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="studio-brand">
          <Layers size={20} />
          <div>
            <strong>Website Studio</strong>
            <small>
              {page === 'home' ? 'Home' : page.replaceAll('-', ' ')}{' '}
              <span>
                {' / '}
                {syncState === 'invalid' && changed
                  ? 'Not synced — fix the highlighted values'
                  : syncState === 'retry' && changed
                    ? 'Offline — retrying'
                    : changed
                      ? 'Syncing…'
                      : ctx.live
                        ? 'Live · all changes saved'
                        : 'Saved layout'}
              </span>
            </small>
          </div>
        </div>
        <div className="studio-panel-toggles">
          <button
            title={layersHidden ? 'Show Layers panel' : 'Hide Layers panel'}
            aria-label={
              layersHidden ? 'Show Layers panel' : 'Hide Layers panel'
            }
            aria-pressed={!layersHidden}
            onClick={() =>
              layersHidden
                ? layersPanel.current?.expand()
                : layersPanel.current?.collapse()
            }
          >
            <PanelLeft size={17} />
          </button>
          <button
            title={
              inspectorHidden
                ? 'Show properties panel'
                : 'Hide properties panel'
            }
            aria-label={
              inspectorHidden
                ? 'Show properties panel'
                : 'Hide properties panel'
            }
            aria-pressed={!inspectorHidden}
            onClick={() =>
              inspectorHidden
                ? inspectorPanel.current?.expand()
                : inspectorPanel.current?.collapse()
            }
          >
            <PanelRight size={17} />
          </button>
        </div>
        <div className="studio-history">
          <button
            title="Undo (Ctrl/⌘ Z)"
            disabled={disabled || !history.past.length}
            onClick={() => dispatch({ type: 'undo' })}
          >
            <Undo2 size={17} />
          </button>
          <button
            title="Redo (Ctrl/⌘ Shift Z)"
            disabled={disabled || !history.future.length}
            onClick={() => dispatch({ type: 'redo' })}
          >
            <Redo2 size={17} />
          </button>
        </div>
        <div className="studio-presence">
          {ctx.live ? (
            <>
              {projectPeers.slice(0, 5).map((peer) => (
                <button
                  key={peer.id}
                  className={
                    'studio-peer-chip' + (peer.page === page ? '' : ' is-away')
                  }
                  style={{ background: peer.color }}
                  title={peerLabel(peer) + ' — click to go there'}
                  aria-label={'Go to ' + peerLabel(peer)}
                  onClick={() => goToPeer(peer)}
                >
                  {peer.name.slice(0, 1).toUpperCase()}
                </button>
              ))}
              <Popover>
                <PopoverTrigger
                  className="studio-presence-count"
                  disabled={!projectPeers.length}
                >
                  {projectPeers.length
                    ? `${projectPeers.length} editing` +
                      (pagePeers.length ? ` · ${pagePeers.length} here` : '')
                    : 'Only you editing'}
                </PopoverTrigger>
                <PopoverContent
                  className="studio-presence-list"
                  align="end"
                  sideOffset={8}
                >
                  <PopoverTitle>Editing now</PopoverTitle>
                  <ul>
                    {projectPeers.map((peer) => (
                      <li key={peer.id}>
                        <button type="button" onClick={() => goToPeer(peer)}>
                          <i style={{ background: peer.color }}>
                            {peer.name.slice(0, 1).toUpperCase()}
                          </i>
                          <span>
                            <strong>{peer.name}</strong>
                            <small>
                              {peer.page === page
                                ? 'On this page'
                                : 'On ' + pageName(peer.page)}
                              {peer.selection?.label
                                ? ' · ' + peer.selection.label
                                : ''}
                            </small>
                          </span>
                          <em>{peer.page === page ? 'Show' : 'Go'}</em>
                        </button>
                      </li>
                    ))}
                  </ul>
                </PopoverContent>
              </Popover>
            </>
          ) : (
            <>
              {(ctx.people || []).slice(0, 4).map((p) => (
                <span key={p.id} title={p.name}>
                  {p.name.slice(0, 1).toUpperCase()}
                </span>
              ))}
              {(ctx.people?.length || 0) > 0 && (
                <small>{ctx.people!.length} editing</small>
              )}
            </>
          )}
        </div>
        <button
          onClick={() => setAiLinkOpen(true)}
          title="Create a link that lets an AI assistant edit this wiki"
        >
          <Bot size={16} />
          Connect AI
        </button>
        <Dialog open={deletePageOpen} onOpenChange={setDeletePageOpen}>
          <DialogContent className="studio-confirm-dialog">
            <DialogTitle>Delete this page?</DialogTitle>
            <DialogDescription>
              {pageIsCustom
                ? `“${studioPages.find((p) => p.slug === page)?.title}” and its content are deleted for the whole team. Links to it from other pages and the header are removed. This cannot be undone.`
                : `The template page “${studioPages.find((p) => p.slug === page)?.title}” is removed from this project for everyone. Your edits to it are discarded and links to it are removed. You can restore the original template page from Pages.`}
            </DialogDescription>
            <div className="studio-dialog-actions">
              <button
                className="studio-danger"
                disabled={deletingPage}
                onClick={() => void deleteCurrentPage()}
              >
                {deletingPage ? 'Deleting…' : 'Delete page'}
              </button>
              <button
                disabled={deletingPage}
                onClick={() => setDeletePageOpen(false)}
              >
                Cancel
              </button>
            </div>
          </DialogContent>
        </Dialog>
        <AiLinkDialog
          open={aiLinkOpen}
          onOpenChange={setAiLinkOpen}
          page={page}
          pageTitle={
            studioPages.find((p) => p.slug === page)?.title || 'this page'
          }
        />
        <button
          onClick={() => {
            openPreview();
          }}
          disabled={ctx.locked}
        >
          <Eye size={16} />
          {preview ? 'Design' : 'Preview'}
        </button>
        <button
          className="studio-primary"
          onClick={() => void save()}
          disabled={disabled || !changed || cssPreview !== undefined}
        >
          <Save size={15} />
          {ctx.busy ? 'Saving…' : changed ? 'Save now' : 'Saved'}
        </button>
      </div>
      {(ctx.error || error || notice || ctx.locked) && (
        <div
          className={
            'studio-notice' + (error || ctx.error ? ' studio-warning' : '')
          }
          role={error || ctx.error ? 'alert' : 'status'}
        >
          {ctx.error ||
            error ||
            (ctx.locked
              ? 'Save or cancel the open text field before changing the layout.'
              : notice)}
        </div>
      )}
      {conflict && (
        <div className="studio-conflict" role="alert">
          <strong>A teammate changed the same properties.</strong>
          <span>{conflict.fields.join(', ')}</span>
          <button
            onClick={() => {
              dispatch({ type: 'reset', value: conflict.remote });
              setBase({ layout: conflict.remote, version: conflict.version });
              setConflict(null);
            }}
          >
            Discard my layout draft
          </button>
          <button
            onClick={() => {
              dispatch({
                type: 'reset',
                value: conflict.merged,
                previous: conflict.remote,
              });
              setBase({ layout: conflict.remote, version: conflict.version });
              setConflict(null);
              setNotice(
                'Your conflicting values are kept in the draft. Review, then save.',
              );
            }}
          >
            Keep my conflicting values
          </button>
        </div>
      )}
      {cssPreview !== undefined && (
        <div className="studio-notice">
          Previewing an AI proposal. Use or discard it before saving the layout.
        </div>
      )}
      {previewOpened && (
        <StudioPreview
          active={preview}
          page={page}
          onClose={() => setPreview(false)}
          data={previewData}
          dirty={
            changed ||
            textDirty ||
            cssPreview !== undefined ||
            Boolean(pagePreview)
          }
          anchor={previewAnchor}
        />
      )}
      <ResizablePanelGroup
        inert={Boolean(elementText && inlineText)}
        orientation="horizontal"
        defaultLayout={panelLayout.defaultLayout}
        onLayoutChanged={panelLayout.onLayoutChanged}
        className={
          'studio-workspace' + (preview ? ' studio-workspace-hidden' : '')
        }
      >
        <ResizablePanel
          id="layers"
          panelRef={layersPanel}
          collapsible
          collapsedSize={0}
          onResize={(size) => setLayersHidden(size.inPixels < 1)}
          defaultSize="220px"
          minSize="160px"
          maxSize="420px"
          className="studio-panel"
        >
          <aside className="studio-layers" inert={layersHidden}>
            <button
              className="studio-all-projects"
              onClick={() => navigatePage('__workspace__')}
            >
              <ArrowLeft size={14} />
              All projects & templates
            </button>
            <div
              className="studio-sidebar-tabs"
              aria-label="Workspace navigation"
            >
              <button
                aria-pressed={sidebarTab === 'layers'}
                onClick={() => setSidebarTab('layers')}
              >
                <Layers size={14} /> Layers
              </button>
              <button
                aria-pressed={sidebarTab === 'pages'}
                onClick={() => setSidebarTab('pages')}
              >
                Pages <span>{studioPages.length}</span>
              </button>
            </div>
            {sidebarTab === 'pages' ? (
              <>
                {ctx.projectId && (
                  <StudioProjects
                    current={ctx.projectId}
                    onSwitch={(id) =>
                      navigatePage(
                        id === '__library__'
                          ? '__workspace__'
                          : '__project__' + id,
                      )
                    }
                  />
                )}
                <StudioPages
                  onHeader={
                    templateFor(ctx.data)
                      ? builtins.some((b) => b.region === 'header')
                        ? () => {
                            const header = builtins.find(
                              (b) => b.region === 'header',
                            );
                            if (header) {
                              setSidebarTab('layers');
                              select(header.id);
                            }
                          }
                        : undefined
                      : openHeader
                  }
                  pages={studioPages}
                  onCreate={() => {
                    setDuplicateSource(undefined);
                    navigatePage('__new__');
                  }}
                  onDuplicate={(slug) => {
                    setDuplicateSource(slug);
                    navigatePage('__new__');
                  }}
                  removed={removedTemplatePages}
                  {...(templateFor(ctx.data)
                    ? {
                        menu: resolveMenu(ctx.data),
                        menuSource: parseMenu(ctx.data).menu,
                        onMenu: saveMenu,
                      }
                    : {})}
                  onRestore={
                    ctx.restorePage
                      ? async (slug) => {
                          try {
                            await ctx.restorePage!(slug);
                            setNotice('Template page restored.');
                          } catch (error) {
                            setError(
                              error instanceof Error
                                ? error.message
                                : 'Could not restore page.',
                            );
                          }
                        }
                      : undefined
                  }
                  onDelete={
                    ctx.deletePage
                      ? async (slug) => {
                          try {
                            await ctx.deletePage!(slug);
                            setNotice(
                              'Page deleted. Links to it were removed.',
                            );
                          } catch (error) {
                            setError(
                              error instanceof Error
                                ? error.message
                                : 'Could not delete page.',
                            );
                          }
                        }
                      : undefined
                  }
                  page={page}
                  query={pageQuery}
                  onQuery={setPageQuery}
                  onNavigate={navigatePage}
                />
              </>
            ) : (
              <>
                <div className="studio-panel-title">
                  <strong>Layers</strong>
                  <span className="studio-layer-tree-tools">
                    <span>{hierarchyOrder(current).length}</span>
                    <button
                      type="button"
                      title="Expand all layers"
                      aria-label="Expand all layers"
                      onClick={() => setCollapsed([])}
                    >
                      <ChevronDown size={15} />
                    </button>
                    <button
                      type="button"
                      title="Collapse all layers"
                      aria-label="Collapse all layers"
                      onClick={() =>
                        setCollapsed(
                          current.nodes
                            .filter(
                              (n) =>
                                n.kind === 'accordion' ||
                                current.nodes.some(
                                  (child) => child.parentId === n.id,
                                ),
                            )
                            .map((n) => n.id),
                        )
                      }
                    >
                      <ChevronRight size={15} />
                    </button>
                  </span>
                </div>
                <div className="studio-layer-search">
                  <input
                    aria-label="Search layers"
                    placeholder="Search layers…"
                    value={layerQuery}
                    onChange={(e) => setLayerQuery(e.target.value)}
                  />
                  <select
                    aria-label="Filter layer type"
                    value={layerKind}
                    onChange={(e) => setLayerKind(e.target.value)}
                  >
                    <option value="all">All types</option>
                    {kinds.map(([kind, label]) => (
                      <option key={kind} value={kind}>
                        {label}
                      </option>
                    ))}
                  </select>
                  {(layerQuery || layerKind !== 'all') && (
                    <button
                      onClick={() => {
                        setLayerQuery('');
                        setLayerKind('all');
                      }}
                    >
                      Clear filters
                    </button>
                  )}
                </div>
                <StudioInsertMenu
                  container={
                    insertContainer
                      ? insertItem?.title ||
                        insertContainer.name ||
                        insertContainer.title ||
                        'section'
                      : undefined
                  }
                  locked={Boolean(
                    insertContainer && nodeLocked(current, insertContainer.id),
                  )}
                  inside={insertInside}
                  onInside={setInsertInside}
                  disabled={disabled}
                  onInsert={add}
                />
                <button
                  className="studio-add-section"
                  disabled={disabled}
                  onClick={() => addSection()}
                  title="Adds a titled section after the selected one; its heading appears in the page indexes"
                >
                  <Plus size={16} />
                  <span>Add section</span>
                  <small>Heading + text, indexed</small>
                </button>
                <button
                  className={
                    'studio-page-row' +
                    (!selected.length && panel === 'design' ? ' active' : '')
                  }
                  onClick={() => {
                    setSelected([]);
                    setTarget(null);
                    setPanel('design');
                  }}
                >
                  <Layers size={15} /> Page settings
                </button>
                <ContextMenu
                  disabled={ctx.locked}
                  onOpenChange={(open, details) => {
                    if (!open || !(details.event.target instanceof Element))
                      return;
                    const id = details.event.target.closest<HTMLElement>(
                      '[data-studio-layer], [data-studio-parent]',
                    );
                    const layerId =
                      id?.dataset.studioLayer || id?.dataset.studioParent;
                    if (layerId) select(layerId);
                    else {
                      setTarget(null);
                      setPanel('design');
                      setSelected([]);
                    }
                    const itemId =
                      details.event.target.closest<HTMLElement>(
                        '[data-studio-item]',
                      )?.dataset.studioItem;
                    setAccordionSelection(
                      layerId && itemId ? { layerId, itemId } : null,
                    );
                    if (itemId) setInsertInside(true);
                  }}
                >
                  <ContextMenuTrigger className="studio-layer-menu-area">
                    <div className="studio-layer-list" ref={layerListRef}>
                      {filteredLayers && !filteredLayers.size && (
                        <output className="studio-help">
                          No matching layers. Try another name or type.
                        </output>
                      )}
                      {visibleLayerRows.map((row) => {
                        const { id, depth } = row;
                        const n = layerNodes.get(id)!;
                        if (row.type === 'item')
                          return (
                            <div
                              key={id + ':' + row.item.id}
                              className="studio-layer-item-row"
                              data-studio-parent={id}
                              data-studio-item={row.item.id}
                              style={{ marginLeft: depth * 14 }}
                            >
                              <button
                                type="button"
                                className="studio-layer-subsection"
                                aria-label={`Edit subsection ${row.index + 1}: ${row.item.title || 'Untitled subsection'}`}
                                aria-pressed={
                                  selected.includes(id) &&
                                  accordionSelection?.itemId === row.item.id
                                }
                                onClick={() =>
                                  editAccordionItem(id, row.item.id)
                                }
                              >
                                <span className="studio-subsection-number">
                                  {row.index + 1}
                                </span>
                                <span>
                                  {row.item.title || 'Untitled subsection'}
                                </span>
                              </button>
                              <StudioInsertMenu
                                compact
                                container={
                                  row.item.title || 'Untitled subsection'
                                }
                                locked={nodeLocked(current, id)}
                                disabled={disabled}
                                inside
                                onInside={() => {}}
                                onInsert={(kind) =>
                                  add(kind, true, {
                                    layerId: id,
                                    itemId: row.item.id,
                                  })
                                }
                              />
                            </div>
                          );
                        if (row.type === 'add-item')
                          return (
                            <button
                              key={id + ':add'}
                              type="button"
                              data-studio-parent={id}
                              className="studio-layer-add-subsection"
                              style={{
                                marginLeft: depth * 14,
                                width: `calc(100% - ${depth * 14}px)`,
                              }}
                              disabled={
                                disabled ||
                                nodeLocked(current, id) ||
                                (n.items?.length || 0) >= 30
                              }
                              onClick={() => addAccordionItem(id)}
                            >
                              <Plus size={13} /> Add subsection
                            </button>
                          );
                        return (
                          <Fragment key={id}>
                            <div
                              key={id}
                              data-studio-layer={id}
                              style={{
                                marginLeft: depth * 14,
                              }}
                              className={
                                'studio-layer' +
                                (selected.includes(id) ? ' active' : '') +
                                (n.hidden ? ' is-hidden' : '') +
                                (drag.visual?.ids.includes(id)
                                  ? ' is-dragging'
                                  : '')
                              }
                            >
                              {n.kind === 'accordion' ||
                              current.nodes.some(
                                (child) => child.parentId === id,
                              ) ? (
                                <button
                                  className="studio-layer-expand"
                                  aria-label={
                                    (collapsed.includes(id)
                                      ? 'Expand '
                                      : 'Collapse ') +
                                    (n.name || n.title || 'section')
                                  }
                                  aria-expanded={!collapsed.includes(id)}
                                  onClick={() =>
                                    setCollapsed((previous) =>
                                      previous.includes(id)
                                        ? previous.filter((item) => item !== id)
                                        : [...previous, id],
                                    )
                                  }
                                >
                                  {collapsed.includes(id) ? (
                                    <ChevronRight size={12} />
                                  ) : (
                                    <ChevronDown size={12} />
                                  )}
                                </button>
                              ) : (
                                <span />
                              )}
                              <button
                                className="studio-grip"
                                disabled={disabled || nodeLocked(current, n.id)}
                                title="Drag layer; Alt + Up/Down also reorders"
                                onPointerDown={(e) => drag.start(e, id)}
                                onDragStart={(e) => e.preventDefault()}
                              >
                                <GripVertical size={14} />
                              </button>
                              <button
                                className="studio-layer-name"
                                aria-pressed={selected.includes(id)}
                                title={layerBreadcrumb(current, n.id)
                                  .map((n) => n.name || n.title || n.kind)
                                  .join(' › ')}
                                onPointerDown={(e) => drag.start(e, id)}
                                onDragStart={(e) => e.preventDefault()}
                                onClick={(e) =>
                                  select(
                                    id,
                                    e.ctrlKey || e.metaKey
                                      ? 'toggle'
                                      : e.shiftKey
                                        ? 'range'
                                        : false,
                                  )
                                }
                              >
                                {n.kind === 'image' && n.src && (
                                  <img
                                    className="studio-layer-thumb"
                                    src={n.src}
                                    alt=""
                                    loading="lazy"
                                    decoding="async"
                                  />
                                )}
                                <span>{n.name || n.title || n.kind}</span>
                                <small>
                                  {n.kind === 'accordion'
                                    ? `Collapsible · ${n.items?.length || 0} subsections`
                                    : `${n.kind === 'template' ? 'Section' : kinds.find((kind) => kind[0] === n.kind)?.[1] || n.kind} · ${effectiveSpan(n)}/12`}
                                </small>
                              </button>
                              {pagePeers
                                .filter(
                                  (peer) => peer.selection?.layerId === id,
                                )
                                .slice(0, 3)
                                .map((peer) => (
                                  <i
                                    key={peer.id}
                                    className="studio-layer-peer"
                                    style={{ background: peer.color }}
                                    title={peer.name + ' has this selected'}
                                  >
                                    {peer.name.slice(0, 1).toUpperCase()}
                                  </i>
                                ))}
                              <button
                                title={n.hidden ? 'Show layer' : 'Hide layer'}
                                aria-label={
                                  (n.hidden ? 'Show ' : 'Hide ') +
                                  (n.name || n.title || n.kind)
                                }
                                aria-pressed={n.hidden}
                                disabled={disabled || nodeLocked(current, n.id)}
                                onClick={() =>
                                  edit(
                                    patchNodes(current, [id], {
                                      hidden: !n.hidden,
                                    }),
                                  )
                                }
                              >
                                {n.hidden ? (
                                  <EyeOff size={13} />
                                ) : (
                                  <Eye size={13} />
                                )}
                              </button>
                              <button
                                title={n.locked ? 'Unlock layer' : 'Lock layer'}
                                aria-label={
                                  (n.locked ? 'Unlock ' : 'Lock ') +
                                  (n.name || n.title || n.kind)
                                }
                                aria-pressed={Boolean(n.locked)}
                                disabled={disabled}
                                onClick={() =>
                                  edit(
                                    patchNodes(
                                      current,
                                      [id],
                                      { locked: !n.locked },
                                      true,
                                    ),
                                  )
                                }
                              >
                                {n.locked ? (
                                  <LockKeyhole size={13} />
                                ) : (
                                  <UnlockKeyhole size={13} />
                                )}
                              </button>
                            </div>
                          </Fragment>
                        );
                      })}
                      <div className="studio-drop-space">
                        Drag here to place a layer at the end
                      </div>
                    </div>
                  </ContextMenuTrigger>
                  <ContextMenuContent className="studio-context-menu">
                    {node ? (
                      <>
                        <div className="studio-context-label">
                          {node.name || node.title || node.kind}
                        </div>
                        <ContextMenuItem
                          disabled={disabled}
                          onClick={() => addSection(false, node.id)}
                        >
                          <Plus size={15} /> Add section below
                        </ContextMenuItem>
                        <ContextMenuItem
                          disabled={
                            disabled ||
                            nodeLocked(current, node.id) ||
                            (node.kind === 'accordion' &&
                              (node.items?.length || 0) >= 30)
                          }
                          onClick={() => addSection(true, node.id)}
                        >
                          <ListTree size={15} />{' '}
                          {['section', 'accordion'].includes(node.kind)
                            ? 'Add subsection inside'
                            : 'Add subsection below'}
                        </ContextMenuItem>
                        <ContextMenuSeparator />
                        <ContextMenuItem
                          disabled={disabled || nodeLocked(current, node.id)}
                          onClick={() => patch({ hidden: !node.hidden })}
                        >
                          <Eye size={15} />{' '}
                          {node.hidden ? 'Show layer' : 'Hide layer'}
                        </ContextMenuItem>
                        <ContextMenuItem
                          disabled={
                            disabled ||
                            Boolean(
                              node.parentId &&
                              nodeLocked(current, node.parentId),
                            )
                          }
                          onClick={() =>
                            edit(
                              patchNodes(
                                current,
                                [node.id],
                                { locked: !node.locked },
                                true,
                              ),
                            )
                          }
                        >
                          <LockKeyhole size={15} />{' '}
                          {node.locked ? 'Unlock layer' : 'Lock layer'}
                        </ContextMenuItem>
                        <ContextMenuItem
                          disabled={disabled || nodeLocked(current, node.id)}
                          onClick={() => arrange('front')}
                        >
                          <Layers size={15} /> Bring to front
                        </ContextMenuItem>
                        <ContextMenuItem
                          disabled={disabled || nodeLocked(current, node.id)}
                          onClick={() => arrange('back')}
                        >
                          <Layers size={15} /> Send to back
                        </ContextMenuItem>
                        {node.kind !== 'template' && (
                          <ContextMenuItem
                            disabled={disabled || nodeLocked(current, node.id)}
                            onClick={duplicate}
                          >
                            <Copy size={15} /> Duplicate
                          </ContextMenuItem>
                        )}
                        {isChromeId(node.id) && (
                          <ContextMenuItem
                            disabled={disabled}
                            onClick={() => void shareChrome()}
                          >
                            <Layers size={15} /> Use this header &amp; footer on
                            every page
                          </ContextMenuItem>
                        )}
                        <ContextMenuSeparator />
                        <ContextMenuItem
                          variant="destructive"
                          disabled={disabled || nodeLocked(current, node.id)}
                          onClick={remove}
                        >
                          <Trash2 size={15} /> Delete section
                        </ContextMenuItem>
                      </>
                    ) : (
                      <>
                        <div className="studio-context-label">Page</div>
                        <ContextMenuItem
                          disabled={disabled}
                          onClick={() => addSection()}
                        >
                          <Plus size={15} /> Add section
                        </ContextMenuItem>
                        {pageDeletable && (
                          <ContextMenuItem
                            variant="destructive"
                            onClick={() => setDeletePageOpen(true)}
                          >
                            <Trash2 size={15} /> Delete this page…
                          </ContextMenuItem>
                        )}
                      </>
                    )}
                  </ContextMenuContent>
                </ContextMenu>
                <div className="studio-layer-footer">
                  <p>
                    Drag an object or its blue outline to move it. Arrow keys
                    nudge; Shift moves 10 px. Double-click text to edit.
                  </p>
                </div>
              </>
            )}
          </aside>
        </ResizablePanel>
        <ResizableHandle
          withHandle
          className="studio-panel-divider"
          aria-label="Resize layers panel"
        />
        <ResizablePanel id="canvas" minSize="220px" className="studio-panel">
          <section className="studio-stage-area" aria-label="Page canvas">
            <StudioPageTabs
              pages={studioPages}
              page={page}
              ids={openPages}
              onNavigate={navigatePage}
              onClose={(id) =>
                setOpenPages((ids) => ids.filter((p) => p !== id))
              }
              onBrowse={() => setSidebarTab('pages')}
            />
            {breadcrumbs.length > 0 && (
              <nav
                className="studio-breadcrumb"
                aria-label="Selected element path"
              >
                {breadcrumbs.map((item, index) => (
                  <Fragment key={item.id}>
                    {index > 0 && <span aria-hidden="true">›</span>}
                    <button
                      title={item.name || item.title || item.kind}
                      onClick={() => select(item.id)}
                    >
                      {item.name || item.title || item.kind}
                    </button>
                  </Fragment>
                ))}
                {target?.textProperty && (
                  <span>
                    ›{' '}
                    {target.textProperty === 'body'
                      ? 'Paragraph'
                      : target.textProperty === 'title'
                        ? 'Heading'
                        : 'Link text'}
                  </span>
                )}
              </nav>
            )}
            <div className="studio-canvas-toolbar">
              <span>
                <MousePointer2 size={14} />
                {preview ? 'Preview' : 'Design'}
              </span>
              <div className="studio-devices">
                {(
                  [
                    [1440, Monitor, 'Desktop'],
                    [768, Tablet, 'Tablet'],
                    [390, Smartphone, 'Mobile'],
                  ] as const
                ).map(([w, Icon, label]) => (
                  <button
                    title={label}
                    aria-label={label}
                    aria-pressed={viewport === w}
                    key={w}
                    onClick={() => setViewport(w)}
                  >
                    <Icon size={16} />
                  </button>
                ))}
              </div>
              <label
                htmlFor="studio-viewport-size"
                className="studio-viewport-width"
              >
                W{' '}
                <StudioNumber
                  id="studio-viewport-size"
                  label="Canvas width in pixels"
                  min={280}
                  max={2560}
                  value={viewport}
                  onCommit={(value) => setViewport(value ?? 1440)}
                />{' '}
                px
              </label>
              {node?.kind === 'html' && (
                <button
                  className="studio-html-mode"
                  aria-pressed={interactingHtmlId === node.id}
                  disabled={disabled || nodeLocked(current, node.id)}
                  title="Use the embedded block’s controls. Finish to move or resize it again."
                  onClick={() =>
                    setHtmlInteraction(
                      interactingHtmlId === node.id
                        ? null
                        : { id: node.id, selection: selected },
                    )
                  }
                >
                  {interactingHtmlId === node.id
                    ? 'Done interacting'
                    : 'Interact with HTML'}
                </button>
              )}
              <button
                className="studio-fit"
                onClick={() => setAutoFit(true)}
                aria-pressed={autoFit}
              >
                Fit
              </button>
              <button
                disabled={!selected.length}
                title="Fit selection"
                aria-label="Fit selection"
                onClick={fitSelected}
              >
                <Scan size={16} />
              </button>
              <label htmlFor="studio-zoom-size" className="studio-zoom">
                Zoom{' '}
                <StudioNumber
                  id="studio-zoom-size"
                  label="Canvas zoom percent"
                  min={10}
                  max={200}
                  step={5}
                  value={Math.round(zoom * 100)}
                  onFocus={() => setAutoFit(false)}
                  onCommit={(value) => {
                    setAutoFit(false);
                    changeZoom((value ?? 100) / 100);
                  }}
                />
                %
              </label>
            </div>
            <div
              className="studio-stage"
              ref={stageRef}
              onPointerDown={(e) => {
                const bounds = e.currentTarget.getBoundingClientRect();
                if (
                  e.button !== 0 ||
                  e.clientX >= bounds.left + e.currentTarget.clientWidth ||
                  e.clientY >= bounds.top + e.currentTarget.clientHeight
                )
                  return;
                if (
                  e.currentTarget.contains(e.target as Node) &&
                  !(e.target as Element).closest('[data-layer-id]')
                )
                  startMarquee(e);
              }}
            >
              <div className="studio-artboard-label">
                {page}{' '}
                <span>
                  {viewport} × {Math.round(height)}
                </span>
              </div>
              <div
                className="studio-zoom-space"
                style={{ width: viewport * zoom, height: height * zoom }}
              >
                {!preview && (
                  <PeerSelections
                    peers={pagePeers}
                    artboard={artboard}
                    revision={current}
                    zoom={zoom}
                    viewport={viewport}
                  />
                )}
                <div
                  ref={artboard}
                  tabIndex={-1}
                  onClickCapture={(e) => {
                    const link = (e.target as Element).closest('a');
                    const href = link?.getAttribute('href');
                    const linkedPage = studioPages.find(
                      (p) => (p.slug === 'home' ? '/' : '/' + p.slug) === href,
                    );
                    if (preview && linkedPage) {
                      e.preventDefault();
                      e.stopPropagation();
                      navigatePage(linkedPage.slug);
                      return;
                    }
                    if (
                      preview &&
                      (e.target as HTMLElement).closest('.editable')
                    ) {
                      e.preventDefault();
                      e.stopPropagation();
                    }
                  }}
                  className={
                    'studio-artboard' +
                    (objectDragging ? ' studio-object-dragging' : '')
                  }
                  style={{ width: viewport, transform: `scale(${zoom})` }}
                >
                  {!templateFor(ctx.data) && (
                    <div
                      className="studio-site-header"
                      onClickCapture={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        openHeader();
                        const part = (e.target as Element)
                          .closest('[data-header-part]')
                          ?.getAttribute('data-header-part');
                        requestAnimationFrame(() => {
                          const section = document.getElementById(
                            part === 'navigation'
                              ? 'header-navigation-controls'
                              : 'header-brand-controls',
                          ) as HTMLDetailsElement | null;
                          if (section) {
                            section.open = true;
                            section.scrollIntoView({ block: 'nearest' });
                          }
                        });
                      }}
                      title="Edit the project header"
                    >
                      <SiteHeader
                        data={{
                          ...ctx.data,
                          [HEADER_FIELD]: {
                            value: JSON.stringify(headerDesign),
                            version: 0,
                            author: '',
                          },
                        }}
                        publication
                      />
                    </div>
                  )}
                  <ContextMenu
                    disabled={preview || ctx.locked}
                    onOpenChange={(open, details) => {
                      setContextMenuOpen(open);
                      if (!open || !(details.event.target instanceof Element))
                        return;
                      const picked = pickDesignTarget(details.event.target);
                      setTarget(picked);
                      setSelected(picked ? [picked.layerId] : []);
                    }}
                  >
                    <ContextMenuTrigger
                      onContextMenuCapture={(event) => {
                        if (!(event.target instanceof Element)) return;
                        const picked = pickDesignTarget(event.target);
                        setTarget(picked);
                        setSelected(picked ? [picked.layerId] : []);
                      }}
                    >
                      <CanvasSurface
                        sourcePage={copiedPage(ctx.data, page)?.sourcePage}
                        templateId={templateFor(ctx.data)?.id}
                        appearanceId={ctx.data['site:appearance']?.value}
                        layout={pagePreview?.layout || current}
                        page={page}
                        editorViewport
                        interactingHtmlId={interactingHtmlId}
                        viewport={viewport}
                        cssOverride={cssPreview}
                        disableCss={!cssEnabled}
                        builtins={
                          pagePreview
                            ? builtins.map((b) => ({
                                ...b,
                                node: previewFields(
                                  b.node,
                                  Object.fromEntries(
                                    pagePreview.fields.map((f) => [
                                      f.id,
                                      f.value,
                                    ]),
                                  ),
                                ),
                              }))
                            : builtins
                        }
                        editing={!preview && !pagePreview}
                        selected={selected}
                        selectedItem={accordionSelection}
                        onSelect={(id, multiple) => {
                          // Modifier clicks are handled per element below.
                          if (!multiple) select(id);
                        }}
                        onTextEdit={(element) =>
                          editElementText(pickDesignTarget(element))
                        }
                        onElementSelect={(element, multiple) => {
                          if (ctx.locked) return;
                          if (multiple) toggleElement(element);
                          else {
                            setMultiTargets([]);
                            const picked = pickDesignTarget(element);
                            setTarget(picked);
                            const itemId = element
                              .closest('[data-item-id]')
                              ?.getAttribute('data-item-id');
                            setAccordionSelection(
                              picked &&
                                itemId &&
                                current.nodes.find(
                                  (n) => n.id === picked.layerId,
                                )?.kind === 'accordion'
                                ? { layerId: picked.layerId, itemId }
                                : null,
                            );
                            setAccordionFocus(undefined);
                          }
                        }}
                        onLayerPointerDown={drag.start}
                        onFreeMove={(event, id) =>
                          freeGesture(event, id, false)
                        }
                        onResize={resize}
                        onResizeKey={(id, delta) =>
                          edit(
                            patchNodes(current, [id], {
                              [spanKey]: Math.max(
                                1,
                                Math.min(
                                  12,
                                  effectiveSpan(
                                    current.nodes.find((n) => n.id === id)!,
                                  ) + delta,
                                ),
                              ),
                            }),
                          )
                        }
                      />
                    </ContextMenuTrigger>
                    <ContextMenuContent className="studio-context-menu">
                      <div className="studio-context-label">
                        {target?.label.replace(/^[^·]+·\s*/, '') || 'Page'}
                      </div>
                      {(target?.fieldId || target?.textProperty) && (
                        <ContextMenuItem
                          disabled={
                            disabled ||
                            Boolean(node && nodeLocked(current, node.id))
                          }
                          onClick={() => editElementText(target)}
                        >
                          <Pencil size={15} /> Text…
                        </ContextMenuItem>
                      )}
                      {(target?.linkKey ||
                        node?.kind === 'button' ||
                        node?.linkTo) && (
                        <ContextMenuItem
                          disabled={
                            disabled ||
                            Boolean(node && nodeLocked(current, node.id))
                          }
                          onClick={editSelectedLink}
                        >
                          <Link size={15} /> Link…
                        </ContextMenuItem>
                      )}
                      <ContextMenuItem
                        disabled={
                          disabled ||
                          Boolean(node && nodeLocked(current, node.id))
                        }
                        onClick={() => openAssistant()}
                      >
                        <Sparkles size={15} /> Ask AI
                      </ContextMenuItem>
                      <ContextMenuSeparator />
                      <ContextMenuItem
                        disabled={disabled}
                        onClick={() => addSection(false, node?.id)}
                      >
                        <Plus size={15} /> Add section below
                      </ContextMenuItem>
                      <ContextMenuItem
                        disabled={
                          disabled ||
                          Boolean(node && nodeLocked(current, node.id)) ||
                          (node?.kind === 'accordion' &&
                            (node.items?.length || 0) >= 30)
                        }
                        onClick={() => addSection(true, node?.id)}
                      >
                        <ListTree size={15} />{' '}
                        {node && ['section', 'accordion'].includes(node.kind)
                          ? 'Add subsection inside'
                          : 'Add subsection below'}
                      </ContextMenuItem>
                      {node && (
                        <>
                          <ContextMenuSeparator />
                          <ContextMenuItem
                            disabled={disabled || nodeLocked(current, node.id)}
                            onClick={() => arrange('front')}
                          >
                            <Layers size={15} /> Bring to front
                          </ContextMenuItem>
                          <ContextMenuItem
                            disabled={disabled || nodeLocked(current, node.id)}
                            onClick={() => arrange('back')}
                          >
                            <Layers size={15} /> Send to back
                          </ContextMenuItem>
                        </>
                      )}
                      <ContextMenuSub>
                        <ContextMenuSubTrigger>
                          <SlidersHorizontal size={15} /> More
                        </ContextMenuSubTrigger>
                        <ContextMenuSubContent className="studio-context-menu">
                          <ContextMenuItem
                            disabled={
                              disabled ||
                              Boolean(node && nodeLocked(current, node.id))
                            }
                            onClick={() => openAssistant(true)}
                          >
                            <Code2 size={15} /> CSS…
                          </ContextMenuItem>
                          <ContextMenuItem onClick={() => setPanel('design')}>
                            <SlidersHorizontal size={15} /> Properties
                          </ContextMenuItem>
                          {node && (
                            <>
                              <ContextMenuSeparator />
                              <ContextMenuItem
                                disabled={
                                  disabled || nodeLocked(current, node.id)
                                }
                                onClick={() => patch({ hidden: !node.hidden })}
                              >
                                <Eye size={15} />{' '}
                                {node.hidden ? 'Show layer' : 'Hide layer'}
                              </ContextMenuItem>
                              <ContextMenuItem
                                disabled={
                                  disabled ||
                                  Boolean(
                                    node.parentId &&
                                    nodeLocked(current, node.parentId),
                                  )
                                }
                                onClick={() =>
                                  edit(
                                    patchNodes(
                                      current,
                                      [node.id],
                                      { locked: !node.locked },
                                      true,
                                    ),
                                  )
                                }
                              >
                                <LockKeyhole size={15} />{' '}
                                {node.locked ? 'Unlock layer' : 'Lock layer'}
                              </ContextMenuItem>
                              {node.kind !== 'template' && (
                                <ContextMenuItem
                                  disabled={
                                    disabled || nodeLocked(current, node.id)
                                  }
                                  onClick={duplicate}
                                >
                                  <Copy size={15} /> Duplicate layer
                                </ContextMenuItem>
                              )}
                              {isChromeId(node.id) && (
                                <ContextMenuItem
                                  disabled={disabled}
                                  onClick={() => void shareChrome()}
                                >
                                  <Layers size={15} /> Use this header &amp;
                                  footer on every page
                                </ContextMenuItem>
                              )}
                            </>
                          )}
                        </ContextMenuSubContent>
                      </ContextMenuSub>
                      {!node && pageDeletable && (
                        <>
                          <ContextMenuSeparator />
                          <ContextMenuItem
                            variant="destructive"
                            onClick={() => setDeletePageOpen(true)}
                          >
                            <Trash2 size={15} /> Delete this page…
                          </ContextMenuItem>
                        </>
                      )}
                      {node && (
                        <>
                          <ContextMenuSeparator />
                          <ContextMenuItem
                            variant="destructive"
                            disabled={
                              disabled ||
                              nodeLocked(current, node.id) ||
                              cssPreview !== undefined
                            }
                            onClick={removeSelection}
                          >
                            <Trash2 size={15} /> Delete selected element
                            <span className="studio-context-shortcut">Del</span>
                          </ContextMenuItem>
                          {selected.length === 1 &&
                            (node.kind === 'template' ||
                              node.kind === 'section' ||
                              node.parentId) && (
                              <ContextMenuItem
                                variant="destructive"
                                disabled={disabled || cssPreview !== undefined}
                                onClick={() => {
                                  let section = node;
                                  while (
                                    section.parentId &&
                                    section.parentId !== CUSTOM_CONTENT
                                  ) {
                                    const parent = current.nodes.find(
                                      (n) => n.id === section.parentId,
                                    );
                                    if (!parent) break;
                                    section = parent;
                                  }
                                  removeLayers([section.id]);
                                }}
                              >
                                <Trash2 size={15} /> Delete entire section
                              </ContextMenuItem>
                            )}
                        </>
                      )}
                    </ContextMenuContent>
                  </ContextMenu>
                </div>
              </div>
            </div>
            <div className="studio-status">
              <span>
                {selected.length
                  ? `${selected.length} selected`
                  : 'Select a section to begin'}{' '}
                · 12-column responsive layout
              </span>
              <span>
                Shift/Ctrl-click to select several · Drag on empty space to
                box-select · Double-click text to edit
              </span>
            </div>
          </section>
        </ResizablePanel>
        <ResizableHandle
          withHandle
          className="studio-panel-divider"
          aria-label="Resize properties panel"
        />
        <ResizablePanel
          id="inspector"
          panelRef={inspectorPanel}
          collapsible
          collapsedSize={0}
          onResize={(size) => setInspectorHidden(size.inPixels < 1)}
          defaultSize="300px"
          minSize="240px"
          maxSize="680px"
          className="studio-panel"
        >
          <aside
            inert={inspectorHidden}
            className={
              'studio-inspector' +
              (panel === 'css' ? ' studio-inspector-assistant' : '')
            }
          >
            <div className="studio-sidebar-tabs" aria-label="Inspector tools">
              <button
                aria-pressed={panel === 'design'}
                onClick={() => setPanel('design')}
              >
                <SlidersHorizontal size={14} /> Design
              </button>
              <button
                aria-pressed={panel === 'css'}
                onClick={() => openAssistant()}
              >
                <Sparkles size={14} /> Assistant
              </button>
            </div>
            <div className="studio-panel-title">
              <strong>
                {panel === 'css'
                  ? showCode
                    ? 'Advanced CSS'
                    : 'Design assistant'
                  : panel === 'header'
                    ? 'Header & logo'
                    : node?.name ||
                      (selected.length
                        ? `${selected.length} layers`
                        : 'Page settings')}
              </strong>
              {panel === 'css' && showCode && (
                <button
                  className="studio-header-code"
                  onClick={() => setShowCode(!showCode)}
                  aria-label={
                    showCode ? 'Back to Assistant' : 'Open Advanced CSS'
                  }
                  title={showCode ? 'Back to Assistant' : 'Advanced CSS'}
                >
                  {showCode ? <ArrowLeft size={16} /> : <Code2 size={16} />}{' '}
                  {showCode ? 'Assistant' : 'CSS'}
                </button>
              )}
              {panel === 'css' && (
                <div
                  className="studio-assistant-header-actions"
                  ref={setAssistantActions}
                />
              )}
              {panel !== 'css' && <span>Design</span>}
            </div>
            <div className="studio-properties">
              {panel === 'css' ? (
                <CssPanel
                  actionsHost={assistantActions}
                  diffBefore={diffBaseline}
                  diffAfter={pageDiffFiles(page, current, ctx.data)}
                  identityKey={JSON.stringify([
                    ctx.userId || 'anonymous',
                    ctx.projectId || 'main',
                  ])}
                  key={JSON.stringify([
                    ctx.userId,
                    ctx.projectId,
                    page,
                    target?.selector || selected.join(',') || 'page',
                  ])}
                  target={
                    target ||
                    (node
                      ? {
                          layerId: node.id,
                          selector: `[data-layer-id="${node.id}"]`,
                          label: node.name || node.title || node.kind,
                        }
                      : null)
                  }
                  incomingRequest={incomingRequest}
                  onRequestConsumed={() => setIncomingRequest(null)}
                  showCode={showCode}
                  onShowCode={setShowCode}
                  pageRevision={JSON.stringify({
                    current,
                    versions: Object.fromEntries(
                      Object.entries(ctx.data).map(([id, row]) => [
                        id,
                        row.version,
                      ]),
                    ),
                  })}
                  getPageContext={() => {
                    const selectedLayer = target?.layerId || node?.id;
                    const root = selectedLayer
                      ? artboard.current?.querySelector(
                          target?.selector ||
                            `[data-layer-id="${selectedLayer}"]`,
                        )
                      : artboard.current;
                    const fields: Record<
                      string,
                      { value: string; version: number }
                    > = {};
                    [
                      ...(root instanceof HTMLElement &&
                      root.matches('[data-field-id]')
                        ? [root]
                        : []),
                      ...Array.from(
                        root?.querySelectorAll<HTMLElement>(
                          '[data-field-id]',
                        ) || [],
                      ),
                    ].forEach((element) => {
                      const id = element.dataset.fieldId!;
                      const row = ctx.data[id];
                      if (
                        currentRef.current.nodes.find(
                          (n) =>
                            n.id ===
                            element.closest<HTMLElement>('[data-layer-id]')
                              ?.dataset.layerId,
                        )?.locked
                      )
                        return;
                      if (row)
                        fields[id] = { value: row.value, version: row.version };
                    });
                    return {
                      layout: currentRef.current,
                      layoutVersion: base.version,
                      fields,
                    };
                  }}
                  onPagePreview={setPagePreview}
                  onPageApply={async (proposal, context) => {
                    const result = await aiRequest<{ version: number }>(
                      '/api/ai/apply',
                      {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          ...context,
                          page,
                          proposal,
                        }),
                      },
                    );
                    if (
                      !Number.isSafeInteger(result.version) ||
                      result.version < 1
                    )
                      throw Error(
                        'The AI save endpoint returned an invalid version. Refresh to check whether the page was saved before retrying.',
                      );
                    ownSave.current = {
                      layout: proposal.layout,
                      version: result.version,
                    };
                    dispatch({ type: 'reset', value: proposal.layout });
                    setBase({
                      layout: proposal.layout,
                      version: result.version,
                    });
                  }}
                  value={current.customCss || ''}
                  page={page}
                  disabled={
                    disabled ||
                    textDirty ||
                    Boolean(node && nodeLocked(current, node.id))
                  }
                  enabled={cssEnabled}
                  onEnabled={setCssEnabled}
                  onPreview={setCssPreview}
                  previewCss={cssPreview}
                  onChange={(css) =>
                    edit({ ...currentRef.current, customCss: css }, 'css')
                  }
                  onEnd={() => dispatch({ type: 'end' })}
                  layers={current.order.map((id) => {
                    const n = current.nodes.find((n) => n.id === id)!;
                    const props = builtins.find((b) => b.id === id)?.node
                      .props as { className?: string } | undefined;
                    return {
                      id,
                      name: (n.name || n.title || n.kind).slice(0, 100),
                      kind: n.kind,
                      selectors: [
                        `[data-layer-id="${id}"]`,
                        ...(props?.className || '')
                          .split(/\s+/)
                          .filter(Boolean)
                          .map((name) => '.' + name)
                          .slice(0, 5),
                      ],
                    };
                  })}
                />
              ) : panel === 'header' ? (
                <>
                  <div className="studio-actions studio-header-savebar">
                    <button
                      className="studio-primary"
                      disabled={disabled || !textDirty}
                      onClick={async () => {
                        if (
                          textEdit &&
                          (await ctx.save(
                            textEdit.id,
                            textEdit.value,
                            textEdit.version,
                          ))
                        ) {
                          setTextEdit(null);
                          setNotice(
                            'Header saved across this project’s pages.',
                          );
                        }
                      }}
                    >
                      Save header
                    </button>
                    <button
                      disabled={uploading}
                      onClick={() => setTextEdit(null)}
                    >
                      Cancel
                    </button>
                  </div>
                  <HeaderControls
                    pages={studioPages}
                    uploading={uploading}
                    progress={progress}
                    design={headerDesign}
                    disabled={disabled}
                    onChange={changeHeader}
                    onUpload={async (file) => {
                      setUploading(true);
                      setError('');
                      try {
                        const result = await uploadMedia(file, setProgress);
                        changeHeader({ ...headerDesign, logo: result.url });
                      } catch (error) {
                        setError(
                          error instanceof Error
                            ? error.message
                            : 'Logo upload failed.',
                        );
                      } finally {
                        setUploading(false);
                      }
                    }}
                  />
                </>
              ) : !selected.length ? (
                <>
                  <p className="studio-help">
                    Sections flow into rows and stack on smaller screens.
                  </p>
                  <label htmlFor="studio-control-2" className="studio-field">
                    <span>Section gap (px)</span>
                    <Input
                      id="studio-control-2"
                      type="number"
                      min={0}
                      max={80}
                      value={current.gap}
                      disabled={disabled}
                      onChange={(e) => {
                        const n = Number(e.target.value);
                        if (Number.isInteger(n) && n >= 0 && n <= 80)
                          edit({ ...current, gap: n }, 'gap');
                      }}
                      onBlur={() => dispatch({ type: 'end' })}
                    />
                  </label>
                  <Choice
                    label="Content width"
                    value={current.width}
                    options={[
                      ['full', 'Full width'],
                      ['reading', 'Reading width'],
                    ]}
                    onChange={(v) =>
                      edit({ ...current, width: v as CanvasLayout['width'] })
                    }
                  />
                  <label htmlFor="studio-control-3" className="studio-toggle">
                    Left contents sidebar
                    <Switch
                      id="studio-control-3"
                      checked={current.sidebar}
                      disabled={disabled}
                      onCheckedChange={(v) => edit({ ...current, sidebar: v })}
                    />
                  </label>
                  <section
                    className="studio-page-index"
                    aria-labelledby="studio-page-index-title"
                  >
                    <div className="studio-page-index-head">
                      <strong id="studio-page-index-title">
                        <ListTree size={14} /> Page index
                      </strong>
                      <span>{pageIndex.length}</span>
                    </div>
                    <p className="studio-help">
                      Headings used by the page navigation. Content pages show a
                      left index that folds into compact markers. Select a
                      section to rename, relabel or hide its entry.
                    </p>
                    {pageIndex.length ? (
                      <ol>
                        {pageIndex.map((entry) => (
                          <li
                            key={entry.key}
                            className={entry.sub ? 'is-subsection' : undefined}
                          >
                            <button
                              disabled={!entry.layerId}
                              onClick={() => {
                                if (!entry.layerId) return;
                                select(entry.layerId);
                                artboard.current
                                  ?.querySelector(
                                    `[data-layer-id="${entry.layerId}"]`,
                                  )
                                  ?.scrollIntoView({ block: 'center' });
                              }}
                            >
                              {entry.label}
                            </button>
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <p className="studio-help">No indexed sections yet.</p>
                    )}
                    <button
                      className="studio-add-section"
                      disabled={disabled}
                      onClick={() => addSection()}
                    >
                      <Plus size={16} />
                      <span>Add section</span>
                    </button>
                    {templateFor(ctx.data)?.id !== 'regelerate' && (
                      <p className="studio-help">
                        Hide the left index to use compact section markers.
                      </p>
                    )}
                  </section>
                </>
              ) : (
                <>
                  <fieldset
                    key={node?.kind || 'multiple'}
                    disabled={disabled || !editable}
                    className="studio-fieldset"
                  >
                    {node && (
                      <p className="studio-kind-hint">
                        {sponsorNode
                          ? 'Sponsor logo — fits the responsive grid. Drag logos in Layers to reorder.'
                          : kindHints[node.kind]}
                      </p>
                    )}
                    {node && (
                      <label
                        htmlFor="studio-control-4"
                        className="studio-field"
                      >
                        <span>Layer name</span>
                        <Input
                          id="studio-control-4"
                          value={node.name ?? node.title}
                          maxLength={100}
                          onChange={(e) =>
                            patch({ name: e.target.value }, 'name')
                          }
                          onBlur={() => dispatch({ type: 'end' })}
                        />
                      </label>
                    )}
                    {selected.length > 1 && (
                      <p className="studio-help">
                        Changes apply to all selected unlocked layers. Blank
                        inputs leave each layer’s current value intact.
                      </p>
                    )}
                    {node?.kind === 'text' &&
                      group(
                        'content',
                        'Content',
                        true,
                        <>
                          <label
                            htmlFor="studio-control-5"
                            className="studio-field"
                          >
                            <span>Heading</span>
                            <Input
                              id="studio-control-5"
                              value={node.title}
                              maxLength={300}
                              onChange={(e) =>
                                patch({ title: e.target.value }, 'title')
                              }
                              onBlur={() => dispatch({ type: 'end' })}
                            />
                          </label>
                          <label
                            htmlFor="studio-control-6"
                            className="studio-field"
                          >
                            <span>
                              {node.kind === 'text'
                                ? 'Body'
                                : 'Transcript / description'}
                            </span>
                            <Textarea
                              id="studio-control-6"
                              value={node.body}
                              maxLength={12000}
                              rows={6}
                              onChange={(e) =>
                                patch({ body: e.target.value }, 'body')
                              }
                              onBlur={() => dispatch({ type: 'end' })}
                            />
                          </label>
                          <Choice
                            label="Heading level"
                            value={String(node.headingLevel || 2)}
                            options={[
                              ['2', 'Section (H2)'],
                              ['3', 'Subsection (H3)'],
                            ]}
                            onChange={(level) =>
                              patch({
                                headingLevel: level === '3' ? 3 : undefined,
                              })
                            }
                          />
                        </>,
                      )}
                    {node?.kind === 'references' &&
                      group(
                        'content',
                        'References',
                        true,
                        <ReferencesEditor
                          nodeId={node.id}
                          entries={node.references || []}
                          onChange={(references, key) =>
                            patch({ references }, key)
                          }
                          onEnd={() => dispatch({ type: 'end' })}
                        />,
                      )}
                    {node?.kind === 'shape' && (
                      <Choice
                        label="Shape"
                        value={node.shape || 'rectangle'}
                        options={[
                          'rectangle',
                          'ellipse',
                          'triangle',
                          'diamond',
                          'line',
                          'arrow',
                        ].map((s) => [s, s[0].toUpperCase() + s.slice(1)])}
                        onChange={(v) =>
                          patch({ shape: v as CanvasNode['shape'] })
                        }
                      />
                    )}
                    {node?.kind === 'html' &&
                      group(
                        'content',
                        'Custom HTML',
                        true,
                        <CustomHtmlEditor
                          disabled={disabled}
                          key={node.id}
                          node={node}
                          onChange={(value, key) => patch(value, key)}
                          onEnd={() => dispatch({ type: 'end' })}
                        />,
                      )}
                    {node?.kind === 'equation' &&
                      group(
                        'content',
                        'Equation',
                        true,
                        <>
                          <label
                            className="studio-field"
                            htmlFor="studio-equation"
                          >
                            <span>LaTeX source</span>
                            <Textarea
                              id="studio-equation"
                              className="studio-equation-source"
                              value={node.body}
                              rows={5}
                              maxLength={12000}
                              spellCheck={false}
                              onChange={(e) =>
                                patch({ body: e.target.value }, 'body')
                              }
                              onBlur={() => dispatch({ type: 'end' })}
                            />
                          </label>
                          <p className="studio-equation-help">
                            Enter math notation, such as \frac{'{a}{b}'} or x^2.
                            No document preamble is needed.
                          </p>
                          <div
                            className="studio-equation-examples"
                            aria-label="Equation examples"
                          >
                            {[
                              ['Fraction', String.raw`\frac{a}{b}`],
                              ['Sum', String.raw`\sum_{i=1}^{n} x_i`],
                              [
                                'Matrix',
                                String.raw`\begin{pmatrix} a & b \\ c & d \end{pmatrix}`,
                              ],
                            ].map(([label, source]) => (
                              <button
                                key={label}
                                type="button"
                                onClick={() => {
                                  patch({ body: source }, 'body');
                                  dispatch({ type: 'end' });
                                }}
                              >
                                {label}
                              </button>
                            ))}
                          </div>
                          <div className="studio-equation-preview">
                            <span>Preview</span>
                            <EquationBlock source={node.body} />
                          </div>
                          <label
                            className="studio-field"
                            htmlFor="studio-equation-caption"
                          >
                            <span>Caption (optional)</span>
                            <Input
                              id="studio-equation-caption"
                              value={node.caption}
                              maxLength={2000}
                              onChange={(e) =>
                                patch({ caption: e.target.value }, 'caption')
                              }
                              onBlur={() => dispatch({ type: 'end' })}
                            />
                          </label>
                        </>,
                      )}
                    {node?.kind === 'accordion' &&
                      group(
                        'content',
                        'Sections',
                        true,
                        <>
                          <label
                            htmlFor="studio-accordion-heading"
                            className="studio-field"
                          >
                            <span>Heading (optional)</span>
                            <Input
                              id="studio-accordion-heading"
                              value={node.title}
                              maxLength={300}
                              onChange={(e) =>
                                patch({ title: e.target.value }, 'title')
                              }
                              onBlur={() => dispatch({ type: 'end' })}
                            />
                          </label>
                          <AccordionEditor
                            items={node.items || []}
                            focusItem={accordionFocus}
                            onAdd={() => addAccordionItem(node.id)}
                            onInsert={(itemId, kind) =>
                              add(kind, true, { layerId: node.id, itemId })
                            }
                            canRemove={(itemId) =>
                              !descendants(
                                current,
                                current.nodes
                                  .filter(
                                    (child) =>
                                      child.parentId === node.id &&
                                      child.parentItemId === itemId,
                                  )
                                  .map((child) => child.id),
                              ).some((id) => nodeLocked(current, id))
                            }
                            onChange={(items, key) => patch({ items }, key)}
                            onEnd={() => dispatch({ type: 'end' })}
                          />
                        </>,
                      )}
                    {node &&
                      [
                        'text',
                        'section',
                        'template',
                        'image',
                        'accordion',
                      ].includes(node.kind) && (
                        <div className="studio-field">
                          <label className="studio-upload">
                            <Plus size={16} />{' '}
                            {uploading
                              ? `Uploading ${progress}%`
                              : 'Add images'}
                            <input
                              type="file"
                              multiple
                              accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
                              disabled={
                                disabled ||
                                (node.kind === 'accordion' && !insertItem) ||
                                Boolean(
                                  insertContainer &&
                                  nodeLocked(current, insertContainer.id),
                                )
                              }
                              onChange={(e) => {
                                const files = Array.from(e.target.files || []);
                                e.target.value = '';
                                void addImages(files);
                              }}
                            />
                          </label>
                          <p className="studio-help">
                            Adds separate image layers inside the selected text
                            or section. Select several files to add them
                            together. Choose a subsection first for a
                            collapsible.
                          </p>
                        </div>
                      )}
                    {node &&
                      ![
                        'text',
                        'section',
                        'button',
                        'accordion',
                        'equation',
                        'references',
                        'html',
                        'shape',
                      ].includes(node.kind) &&
                      group(
                        'media',
                        node.kind === 'template' ? 'Section image' : 'Media',
                        node.kind !== 'template',
                        <>
                          <label
                            htmlFor="studio-control-7"
                            className="studio-field"
                          >
                            <span>Source URL</span>
                            <Input
                              id="studio-control-7"
                              value={node.src}
                              maxLength={2048}
                              placeholder="https://…"
                              onChange={(e) =>
                                patch({ src: e.target.value }, 'src')
                              }
                              onBlur={() => dispatch({ type: 'end' })}
                            />
                          </label>
                          <label className="studio-upload">
                            <Upload size={16} />
                            {uploading
                              ? `Uploading ${progress}%`
                              : node.src
                                ? 'Replace this file'
                                : 'Choose file'}
                            <input
                              type="file"
                              disabled={disabled}
                              accept={
                                node.kind === 'template'
                                  ? 'image/png,image/jpeg,image/webp'
                                  : '.png,.jpg,.jpeg,.webp,.mp4,.webm,.mp3,.wav,.ogg,.pdf,.glb'
                              }
                              onChange={(e) => {
                                if (e.target.files?.[0])
                                  void upload(e.target.files[0]);
                                e.target.value = '';
                              }}
                            />
                          </label>
                          <p className="studio-help">
                            Video and GLB upload directly to media storage; size
                            depends on server capacity. Other files: 25 MiB. Use
                            a self-contained GLB for 3D. Larger media can use a
                            hosted HTTPS URL.
                          </p>
                          <Choice
                            label="Image fit"
                            value={node.objectFit || 'contain'}
                            options={[
                              ['contain', 'Contain'],
                              ['cover', 'Cover'],
                            ]}
                            onChange={(v) =>
                              patch({
                                objectFit: v as CanvasNode['objectFit'],
                              })
                            }
                          />
                          {node.kind !== 'template' && (
                            <>
                              <label
                                htmlFor="studio-control-8"
                                className="studio-field"
                              >
                                <span>Alt text / accessible label</span>
                                <Input
                                  id="studio-control-8"
                                  value={node.alt}
                                  maxLength={1000}
                                  onChange={(e) =>
                                    patch({ alt: e.target.value }, 'alt')
                                  }
                                  onBlur={() => dispatch({ type: 'end' })}
                                />
                              </label>
                              <label
                                htmlFor="studio-control-9"
                                className="studio-field"
                              >
                                <span>Caption</span>
                                <Textarea
                                  id="studio-control-9"
                                  value={node.caption}
                                  maxLength={2000}
                                  onChange={(e) =>
                                    patch(
                                      { caption: e.target.value },
                                      'caption',
                                    )
                                  }
                                  onBlur={() => dispatch({ type: 'end' })}
                                />
                              </label>
                            </>
                          )}
                        </>,
                      )}
                    {node &&
                      mediaKinds.includes(node.kind) &&
                      group(
                        'content',
                        'Heading & description',
                        false,
                        <>
                          <label
                            htmlFor="studio-control-5"
                            className="studio-field"
                          >
                            <span>Heading</span>
                            <Input
                              id="studio-control-5"
                              value={node.title}
                              maxLength={300}
                              onChange={(e) =>
                                patch({ title: e.target.value }, 'title')
                              }
                              onBlur={() => dispatch({ type: 'end' })}
                            />
                          </label>
                          <label
                            htmlFor="studio-control-6"
                            className="studio-field"
                          >
                            <span>
                              {node.kind === 'text'
                                ? 'Body'
                                : 'Transcript / description'}
                            </span>
                            <Textarea
                              id="studio-control-6"
                              value={node.body}
                              maxLength={12000}
                              rows={6}
                              onChange={(e) =>
                                patch({ body: e.target.value }, 'body')
                              }
                              onBlur={() => dispatch({ type: 'end' })}
                            />
                          </label>
                        </>,
                      )}
                    {node &&
                      group(
                        'link',
                        target?.linkKey
                          ? 'Selected link'
                          : node.kind === 'button'
                            ? 'Button link'
                            : node.linkTo
                              ? 'Link button'
                              : sponsorNode
                                ? 'Sponsor website'
                                : 'Add a link button',
                        node.kind === 'button' || Boolean(target?.linkKey),
                        <>
                          <LinkEditor
                            key={target?.linkKey || node?.id}
                            label={
                              target?.linkKey
                                ? 'Selected link URL'
                                : 'Link destination'
                            }
                            optional={!target?.linkKey}
                            value={
                              target?.linkKey
                                ? node?.links?.[target.linkKey] ||
                                  target.href ||
                                  ''
                                : node?.linkTo || ''
                            }
                            pages={studioPages.map((p) => [
                              p.slug === 'home' ? '/' : '/' + p.slug,
                              p.title,
                            ])}
                            onChange={(href) => {
                              if (target?.linkKey && node)
                                edit(
                                  patchNodes(currentRef.current, [node.id], {
                                    links: {
                                      ...node.links,
                                      [target.linkKey]: href,
                                    },
                                  }),
                                );
                              else
                                patch({
                                  linkTo: sponsorNode
                                    ? href
                                    : href || undefined,
                                });
                            }}
                          />
                          {!sponsorNode &&
                            !target?.linkKey &&
                            (node?.linkTo || node?.kind === 'button') && (
                              <label
                                className="studio-field"
                                htmlFor="studio-page-button-label"
                              >
                                <span>Button label</span>
                                <Input
                                  id="studio-page-button-label"
                                  aria-label="Page link button label"
                                  maxLength={150}
                                  value={node?.linkLabel || ''}
                                  placeholder="Open page"
                                  onChange={(e) =>
                                    patch(
                                      { linkLabel: e.target.value },
                                      'link-label',
                                    )
                                  }
                                  onBlur={() => dispatch({ type: 'end' })}
                                />
                              </label>
                            )}
                          <p className="studio-help">
                            {target?.linkKey
                              ? 'Changes this link. Save the layout, then test it in Preview.'
                              : 'Use a website page or an external URL. This adds a button to the section.'}
                          </p>
                        </>,
                      )}
                    {node &&
                      node.kind !== 'button' &&
                      group(
                        'index',
                        <>
                          <span>Page index</span>
                          <em className="studio-group-status">
                            {node.indexHidden
                              ? 'Hidden'
                              : node.indexLabel !== undefined
                                ? 'Custom'
                                : 'Auto'}
                          </em>
                        </>,
                        node.kind === 'section',
                        <>
                          <Choice
                            label="Right-side index entry"
                            value={
                              node.indexHidden
                                ? 'hidden'
                                : node.indexLabel !== undefined
                                  ? 'custom'
                                  : 'auto'
                            }
                            options={[
                              [
                                'auto',
                                node.kind === 'section'
                                  ? 'Headings inside it'
                                  : 'Use its heading',
                              ],
                              ['custom', 'Custom label'],
                              ['hidden', 'Hide from index'],
                            ]}
                            onChange={(mode) =>
                              patch(
                                mode === 'custom'
                                  ? {
                                      indexLabel:
                                        node.indexLabel ??
                                        (
                                          node.title ||
                                          node.name ||
                                          'Section'
                                        ).slice(0, 120),
                                      indexHidden: undefined,
                                    }
                                  : mode === 'hidden'
                                    ? {
                                        indexLabel: undefined,
                                        indexHidden: true,
                                      }
                                    : {
                                        indexLabel: undefined,
                                        indexHidden: undefined,
                                      },
                              )
                            }
                          />
                          {node.indexLabel !== undefined &&
                            !node.indexHidden && (
                              <label
                                htmlFor="studio-index-label"
                                className="studio-field"
                              >
                                <span>Index label</span>
                                <Input
                                  id="studio-index-label"
                                  value={node.indexLabel}
                                  maxLength={120}
                                  placeholder="Shown when hovering the marker"
                                  onChange={(e) =>
                                    patch(
                                      { indexLabel: e.target.value },
                                      'index-label',
                                    )
                                  }
                                  onBlur={() => dispatch({ type: 'end' })}
                                />
                              </label>
                            )}
                          <p className="studio-help">
                            {(() => {
                              const listed = pageIndex
                                .filter((entry) => entry.layerId === node.id)
                                .map((entry) => entry.label);
                              return listed.length
                                ? 'Listed as: ' + listed.join(' · ')
                                : node.indexHidden
                                  ? 'Not listed in the page indexes.'
                                  : 'Not listed yet — add a heading or choose Custom label.';
                            })()}
                          </p>
                        </>,
                      )}
                    {group(
                      'layout',
                      'Layout',
                      !node ||
                        ['section', 'template', 'html'].includes(node.kind),
                      <>
                        {node &&
                          !['template', 'button', 'section'].includes(
                            node.kind,
                          ) && (
                            <Choice
                              label="Containing section"
                              value={
                                node.parentItemId
                                  ? `${node.parentId}:${node.parentItemId}`
                                  : node.parentId || ''
                              }
                              options={[
                                ['', 'Page (top level)'],
                                ...current.nodes
                                  .filter(
                                    (n) =>
                                      [
                                        'section',
                                        'template',
                                        'accordion',
                                        'text',
                                      ].includes(n.kind) &&
                                      !descendants(current, [node.id]).includes(
                                        n.id,
                                      ) &&
                                      !nodeLocked(current, n.id),
                                  )
                                  .flatMap((n) =>
                                    n.kind === 'accordion'
                                      ? (n.items || []).map(
                                          (item) =>
                                            [
                                              `${n.id}:${item.id}`,
                                              `${n.name || n.title || 'Collapsible'} / ${item.title}`,
                                            ] as [string, string],
                                        )
                                      : [
                                          [
                                            n.id,
                                            n.name || n.title || n.kind,
                                          ] as [string, string],
                                        ],
                                  ),
                              ]}
                              onChange={(destination) => {
                                const [parentId, parentItemId] =
                                  destination.split(':');
                                patch({
                                  parentId: parentId || undefined,
                                  parentItemId,
                                });
                              }}
                            />
                          )}
                        {node && (
                          <>
                            <div className="studio-grid">
                              <button
                                type="button"
                                disabled={
                                  disabled || nodeLocked(current, node.id)
                                }
                                onClick={() => arrange('front')}
                              >
                                <Layers size={14} /> Bring to front
                              </button>
                              <button
                                type="button"
                                disabled={
                                  disabled || nodeLocked(current, node.id)
                                }
                                onClick={() => arrange('back')}
                              >
                                <Layers size={14} /> Send to back
                              </button>
                            </div>
                            {number(
                              'Layer order',
                              'zIndex',
                              -1000000,
                              1000000,
                              0,
                            )}
                            <p className="studio-help">
                              Higher layers cover lower layers in the same
                              container. Move pictures to overlap them; their
                              reading order stays unchanged.
                            </p>
                          </>
                        )}
                        {node?.kind === 'html' && (
                          <HtmlPositionControls
                            artboard={artboard}
                            id={node.id}
                            revision={current}
                            viewport={viewport}
                            disabled={disabled || nodeLocked(current, node.id)}
                            onMove={(x, y) =>
                              moveObject(
                                {
                                  layerId: node.id,
                                  selector: `[data-layer-id="${node.id}"]`,
                                  label: node.name || 'Custom HTML',
                                },
                                x,
                                y,
                              )
                            }
                          />
                        )}
                        {node &&
                          ['section', 'template', 'text'].includes(
                            node.kind,
                          ) && (
                            <Choice
                              label="Children layout"
                              value={node.layoutMode || 'flow'}
                              options={[
                                ['flow', 'Responsive flow'],
                                ['free', 'Free placement'],
                              ]}
                              onChange={(mode) =>
                                patch({ layoutMode: mode as 'free' | 'flow' })
                              }
                            />
                          )}
                        {node?.parentId &&
                          current.nodes.find((n) => n.id === node.parentId)
                            ?.layoutMode === 'free' && (
                            <div className="studio-grid">
                              {number('X (%)', 'x', 0, 100, 5)}
                              {number('Y (px)', 'y', 0, 2000, 20)}
                              {number('Width (%)', 'freeWidth', 5, 100, 40)}
                              {number(
                                'Height (px)',
                                'freeHeight',
                                20,
                                2000,
                                80,
                              )}
                            </div>
                          )}
                        <div className="studio-grid">
                          {number(
                            viewport <= 760
                              ? 'Mobile columns'
                              : viewport <= 1000
                                ? 'Tablet columns'
                                : 'Columns',
                            spanKey,
                            1,
                            12,
                            node ? effectiveSpan(node) : 12,
                          )}
                          {number(
                            ['pdf', 'html', 'shape'].includes(node?.kind || '')
                              ? 'Height (px)'
                              : 'Min height',
                            'minHeight',
                            ['pdf', 'html', 'shape'].includes(node?.kind || '')
                              ? 80
                              : 0,
                            2000,
                            node?.kind === 'pdf'
                              ? 600
                              : node?.kind === 'html'
                                ? 360
                                : 0,
                          )}
                        </div>
                        <Choice
                          label="Alignment"
                          value={node?.align || 'left'}
                          options={[
                            ['left', 'Left'],
                            ['center', 'Center'],
                            ['right', 'Right'],
                          ]}
                          onChange={(v) =>
                            patch({ align: v as CanvasNode['align'] })
                          }
                        />
                      </>,
                    )}
                    {group(
                      'spacing',
                      'Spacing',
                      false,
                      <div className="studio-grid">
                        {number(
                          'Padding X',
                          'paddingX',
                          0,
                          160,
                          node?.padding || 0,
                        )}
                        {number(
                          'Padding Y',
                          'paddingY',
                          0,
                          160,
                          node?.padding || 0,
                        )}
                        {number('Margin top', 'marginTop', 0, 200, 0)}
                        {number('Margin bottom', 'marginBottom', 0, 200, 0)}
                      </div>,
                    )}
                    {group(
                      'appearance',
                      'Appearance',
                      false,
                      <>
                        {color('Fill', 'background', '#ffffff')}
                        {color('Text', 'textColor', '#222b25')}
                        <div className="studio-grid">
                          {number('Corner radius', 'radius', 0, 200, 0)}
                          {number('Opacity %', 'opacity', 10, 100, 100)}
                          {number('Border width', 'borderWidth', 0, 20, 0)}
                        </div>
                        {color('Border', 'borderColor', '#d3d9d5')}
                        <Choice
                          label="Shadow"
                          value={node?.shadow || 'none'}
                          options={[
                            ['none', 'None'],
                            ['soft', 'Soft'],
                            ['raised', 'Raised'],
                          ]}
                          onChange={(v) =>
                            patch({ shadow: v as CanvasNode['shadow'] })
                          }
                        />
                      </>,
                    )}
                    {group(
                      'typography',
                      'Typography',
                      false,
                      <>
                        <Choice
                          label="Font family"
                          value={node?.fontFamily || 'sans'}
                          options={[
                            ['sans', 'Sans serif'],
                            ['serif', 'Serif'],
                            ['mono', 'Monospace'],
                          ]}
                          onChange={(v) =>
                            patch({ fontFamily: v as CanvasNode['fontFamily'] })
                          }
                        />
                        <div className="studio-grid">
                          {number('Body size', 'fontSize', 10, 72, 17)}
                          {number('Heading size', 'headingSize', 14, 120, 34)}
                          {number('Weight', 'fontWeight', 100, 900, 400, 100)}
                          {number(
                            'Line height',
                            'lineHeight',
                            1,
                            2.5,
                            1.6,
                            0.1,
                          )}
                          {number(
                            'Letter spacing',
                            'letterSpacing',
                            -3,
                            12,
                            0,
                            0.1,
                          )}
                        </div>
                      </>,
                    )}
                  </fieldset>
                  {node?.locked && (
                    <p className="studio-help">
                      This layer is locked. Unlock it in Layers to change it.
                    </p>
                  )}
                  {node?.kind === 'template' && (
                    <p className="studio-help">
                      Double-click text on the canvas to edit it. Template
                      sections can be hidden and restored. Add text or media
                      sections for independently editable copies.
                    </p>
                  )}
                  <div className="studio-actions">
                    <button
                      title="Move up (Alt ↑)"
                      disabled={disabled || !editable}
                      onClick={() => reorder(-1)}
                    >
                      <ArrowUp size={16} />
                    </button>
                    <button
                      title="Move down (Alt ↓)"
                      disabled={disabled || !editable}
                      onClick={() => reorder(1)}
                    >
                      <ArrowDown size={16} />
                    </button>
                    <button
                      title="Duplicate custom sections (Ctrl/⌘ D)"
                      disabled={
                        disabled ||
                        !selected.some((id) => {
                          const n = current.nodes.find((n) => n.id === id);
                          return n && !n.locked && n.kind !== 'template';
                        })
                      }
                      onClick={duplicate}
                    >
                      <Copy size={16} />
                    </button>
                    <button
                      title="Delete selected section"
                      disabled={disabled || !editable}
                      onClick={remove}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </>
              )}
            </div>
          </aside>
        </ResizablePanel>
      </ResizablePanelGroup>
      {!preview && !elementText && (
        <SelectionOutline
          artboard={artboard}
          stage={stageRef}
          targets={styleTargets}
          revision={current}
          zoom={zoom}
        />
      )}
      {dockAnchor &&
        styleTargets.length === 1 &&
        dockAnchor.selector !== `[data-layer-id="${dockAnchor.layerId}"]` &&
        !disabled &&
        !styleLocked &&
        !preview &&
        !ctx.locked &&
        !drag.visual &&
        !objectDragging &&
        !elementText &&
        cssPreview === undefined &&
        !pagePreview && (
          <SelectionResize
            target={dockAnchor}
            artboard={artboard}
            stage={stageRef}
            revision={current}
            zoom={zoom}
            onActive={setObjectResizing}
            onResize={(picked, styles) => {
              if (disabled || nodeLocked(currentRef.current, picked.layerId))
                return;
              try {
                let customCss = currentRef.current.customCss || '';
                const scope =
                  viewport <= 760
                    ? 'mobile'
                    : viewport <= 1000
                      ? 'tablet'
                      : 'all';
                for (const [property, value] of Object.entries(styles))
                  customCss = applySelectionStyle(
                    customCss,
                    picked.selector,
                    property,
                    value,
                    scope,
                  );
                setCssEnabled(true);
                edit({ ...currentRef.current, customCss });
                dispatch({ type: 'end' });
              } catch (error) {
                setError(
                  error instanceof Error
                    ? error.message
                    : 'Could not resize this element.',
                );
              }
            }}
          />
        )}
      {dockAnchor &&
        node?.kind !== 'shape' &&
        !pendingPage &&
        !newPageOpen &&
        !preview &&
        !ctx.locked &&
        !drag.visual &&
        !contextMenuOpen &&
        !objectDragging &&
        !objectResizing &&
        !elementText &&
        cssPreview === undefined && (
          <SelectionDock
            key={dockAnchor.selector}
            target={dockAnchor}
            count={styleTargets.length}
            onEditInline={
              dockAnchor.textProperty
                ? () => editElementText(dockAnchor, true)
                : undefined
            }
            onReplaceImage={
              styleTargets.length === 1 &&
              node &&
              ['image', 'template'].includes(node.kind)
                ? (file) => {
                    void upload(file);
                  }
                : undefined
            }
            uploadProgress={uploading ? progress : undefined}
            artboard={artboard}
            stage={stageRef}
            revision={current}
            zoom={zoom}
            scope={
              viewport <= 760 ? 'mobile' : viewport <= 1000 ? 'tablet' : 'all'
            }
            disabled={disabled || styleLocked || Boolean(incomingRequest)}
            onEnd={() => dispatch({ type: 'end' })}
            onStyle={(property, value, group) => {
              if (disabled || styleLocked || cssPreview !== undefined) return;
              const scope =
                viewport <= 760
                  ? 'mobile'
                  : viewport <= 1000
                    ? 'tablet'
                    : 'all';
              try {
                let source = currentRef.current.customCss || '';
                // One change styles every selected element in one undo step.
                for (const t of styleTargets) {
                  const element = artboard.current?.querySelector(t.selector);
                  // Inline text can be styled independently; alignment belongs to its text block.
                  const block =
                    property === 'text-align' && element?.matches('span')
                      ? element.parentElement?.closest(
                          'h1,h2,h3,h4,h5,h6,p,li,blockquote,figcaption,div',
                        )
                      : null;
                  const styleTarget = block ? pickDesignTarget(block) : null;
                  // Inline spans need a transformable box; preserve existing transforms using CSS rotate.
                  if (
                    ['rotate', 'translate'].includes(property) &&
                    element &&
                    getComputedStyle(element).display === 'inline'
                  )
                    source = applySelectionStyle(
                      source,
                      t.selector,
                      'display',
                      'inline-block',
                      scope,
                    );
                  source = applySelectionStyle(
                    source,
                    styleTarget?.selector || t.selector,
                    property,
                    value,
                    scope,
                  );
                }
                setCssEnabled(true);
                edit({ ...currentRef.current, customCss: source }, group);
              } catch (error) {
                setError(
                  error instanceof Error
                    ? error.message
                    : 'Could not apply this style.',
                );
              }
            }}
            onSend={(text) => {
              if (styleTargets.length > 1) {
                // Several elements: ask the page Assistant, naming each one.
                setTarget(null);
                setMultiTargets([]);
                setSelected([]);
                setIncomingRequest({
                  id: crypto.randomUUID(),
                  text:
                    text +
                    '\n\nApply this to these elements: ' +
                    styleTargets.map((t) => t.selector).join(', '),
                  selector: '',
                });
              } else {
                setTarget(dockAnchor);
                setIncomingRequest({
                  id: crypto.randomUUID(),
                  text,
                  selector: dockAnchor.selector,
                });
              }
              openAssistant();
            }}
            onLayer={() => {
              select(dockAnchor.layerId);
              setTarget(null);
            }}
            onEditText={
              styleTargets.length === 1 &&
              (dockAnchor.fieldId || dockAnchor.textProperty)
                ? () => editElementText(dockAnchor)
                : undefined
            }
          />
        )}
      {marquee && (
        <div
          className="studio-marquee"
          aria-hidden="true"
          style={{
            left: Math.min(marquee.x0, marquee.x1),
            top: Math.min(marquee.y0, marquee.y1),
            width: Math.abs(marquee.x1 - marquee.x0),
            height: Math.abs(marquee.y1 - marquee.y0),
          }}
        />
      )}
      {elementText && inlineText && target && (
        <InlineTextEditor
          target={target}
          artboard={artboard}
          stage={stageRef}
          value={elementText.value}
          maxLength={
            elementText.property === 'body'
              ? 12000
              : elementText.property === 'title'
                ? 300
                : 150
          }
          onChange={(value) =>
            setElementText((previous) =>
              previous ? { ...previous, value } : null,
            )
          }
          onSave={saveElementText}
          onCancel={() => setElementText(null)}
          onExpand={() => setInlineText(false)}
        />
      )}
      <TextEditDialog
        open={Boolean(elementText) && !inlineText}
        value={elementText?.value || ''}
        maxLength={
          elementText?.property === 'body'
            ? 12000
            : elementText?.property === 'title'
              ? 300
              : 150
        }
        onChange={(value) =>
          setElementText((previous) =>
            previous ? { ...previous, value } : null,
          )
        }
        onCancel={() => setElementText(null)}
        onSave={saveElementText}
      />
      <Dialog
        open={pendingPage !== null}
        onOpenChange={(open) => {
          if (!open && !resolving) setPendingPage(null);
        }}
      >
        <DialogContent
          className="studio-dialog studio-unsaved-dialog"
          showCloseButton={!resolving}
        >
          <div className="studio-unsaved-icon">
            <FilePenLine size={25} aria-hidden="true" />
          </div>
          <div className="studio-unsaved-heading">
            <DialogTitle>Save your changes?</DialogTitle>
            <DialogDescription>
              You have unsaved edits on{' '}
              <strong>
                {studioPages.find((item) => item.slug === page)?.title || page}
              </strong>
              . Save them before{' '}
              {pendingPage === '__new__'
                ? 'creating a new page'
                : pendingPage === '__workspace__'
                  ? 'returning to your projects'
                  : pendingPage?.startsWith('__project__')
                    ? 'switching projects'
                    : 'opening another page'}
              .
            </DialogDescription>
          </div>
          <div className="studio-unsaved-destination">
            <span>Next</span>
            <strong>
              {pendingPage === '__new__'
                ? 'New page'
                : pendingPage === '__workspace__'
                  ? 'Projects & templates'
                  : pendingPage?.startsWith('__project__')
                    ? 'Another project'
                    : studioPages.find((item) => item.slug === pendingPage)
                        ?.title || pendingPage}
            </strong>
            <ArrowRight size={16} aria-hidden="true" />
          </div>
          {cssPreview !== undefined && (
            <p className="studio-unsaved-note">
              The AI preview hasn’t been applied and won’t be saved.
            </p>
          )}
          {(pageError || ctx.error) && (
            <p role="alert" className="studio-css-error">
              {pageError || ctx.error}
            </p>
          )}
          <div className="studio-unsaved-actions">
            <button
              className="studio-unsaved-save"
              disabled={resolving || ctx.busy || uploading || Boolean(conflict)}
              onClick={() => void resolveNavigation(true)}
            >
              {resolving ? (
                <LoaderCircle size={16} className="studio-unsaved-spinner" />
              ) : (
                <Save size={16} />
              )}
              {resolving ? 'Please wait…' : 'Save changes'}
            </button>
            <button
              className="studio-unsaved-discard"
              disabled={resolving || ctx.busy || uploading}
              onClick={() => void resolveNavigation(false)}
            >
              Discard changes
            </button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={newPageOpen}
        onOpenChange={(open) => {
          if (!resolving) setNewPageOpen(open);
        }}
      >
        <DialogContent className="studio-dialog">
          <DialogTitle>
            {duplicateSource ? 'Duplicate page' : 'Create a page'}
          </DialogTitle>
          <DialogDescription>
            {duplicateSource
              ? 'Copy the saved layout, content, images and styles to a new page. The original stays unchanged.'
              : 'Add a page to your team wiki. It will also be included in static export.'}
          </DialogDescription>
          <label htmlFor="studio-new-page-title">
            Page title
            <Input
              id="studio-new-page-title"
              value={newTitle}
              maxLength={100}
              onChange={(e) => {
                setNewTitle(e.target.value);
                setNewSlug(
                  e.target.value
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, '-')
                    .replace(/^-|-$/g, '')
                    .slice(0, 60),
                );
              }}
            />
          </label>
          <label htmlFor="studio-new-page-slug">
            Page address
            <Input
              id="studio-new-page-slug"
              value={newSlug}
              maxLength={60}
              onChange={(e) => setNewSlug(e.target.value)}
            />
          </label>
          <small>/{newSlug || 'your-page'}</small>
          {pageError && (
            <p className="studio-css-error" role="alert">
              {pageError}
            </p>
          )}
          <div className="studio-dialog-actions">
            <button disabled={resolving} onClick={() => setNewPageOpen(false)}>
              Cancel
            </button>
            <button
              className="studio-primary"
              disabled={
                resolving || !newTitle.trim() || !newSlug || !ctx.createPage
              }
              onClick={async () => {
                setResolving(true);
                setPageError('');
                try {
                  await ctx.createPage?.(newTitle, newSlug, duplicateSource);
                  setNewPageOpen(false);
                } catch (error) {
                  setPageError(
                    error instanceof Error
                      ? error.message
                      : 'Could not create page.',
                  );
                } finally {
                  setResolving(false);
                }
              }}
            >
              {resolving
                ? 'Creating…'
                : duplicateSource
                  ? 'Duplicate page'
                  : 'Create page'}
            </button>
          </div>
        </DialogContent>
      </Dialog>
      {drag.visual && (
        <>
          <div
            className="studio-drag-ghost"
            style={{
              left: drag.visual.point.x + 14,
              top: drag.visual.point.y + 14,
            }}
          >
            {drag.visual.ids.length === 1
              ? current.nodes.find((n) => n.id === drag.visual!.ids[0])?.name ||
                'Section'
              : drag.visual.ids.length + ' layers'}
          </div>
          {drag.visual.mark && (
            <div
              className="studio-drop-line"
              style={{
                left: drag.visual.mark.left,
                top: drag.visual.mark.top,
                width: drag.visual.mark.width,
              }}
            />
          )}
          <output className="sr-only">
            Dragging {drag.visual.ids.length} layer. Escape cancels.
          </output>
        </>
      )}
    </div>
  );
}
