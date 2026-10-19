'use client';
import { useState, type DragEvent } from 'react';
import {
  Copy,
  ArrowDown,
  ArrowUp,
  File,
  FolderInput,
  GripVertical,
  Pencil,
  Search,
  X,
  PanelLeft,
  Plus,
  Trash2,
} from 'lucide-react';
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubTrigger,
  ContextMenuSubContent,
} from '@/components/ui/context-menu';
import { movePage, newGroupId, type SiteMenu } from './site-menu';
import { wikiPages } from './wiki-data';

export const studioPages = [
  { slug: 'home', title: 'Home', group: 'Overview' },
  ...wikiPages,
];

type StudioPage = (typeof studioPages)[number];
type MenuView = {
  groups: { id: string; label: string; pages: StudioPage[] }[];
  unplaced: StudioPage[];
};

export function StudioPages({
  page,
  query,
  onQuery,
  onNavigate,
  pages = studioPages,
  onCreate,
  onDuplicate,
  onDelete,
  onRestore,
  removed = [],
  onHeader,
  menu,
  menuSource,
  onMenu,
}: {
  pages?: typeof studioPages;
  onCreate?: () => void;
  onDuplicate?: (slug: string) => void;
  onDelete?: (slug: string) => Promise<void>;
  onRestore?: (slug: string) => Promise<void>;
  removed?: { slug: string; title: string }[];
  onHeader?: () => void;
  page: string;
  query: string;
  onQuery: (value: string) => void;
  onNavigate: (page: string) => void;
  /** The header menu (template projects). Without it pages group by type. */
  menu?: MenuView;
  menuSource?: SiteMenu;
  onMenu?: (next: SiteMenu) => void | Promise<void>;
}) {
  const [confirming, setConfirming] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [menuPage, setMenuPage] = useState<StudioPage | null>(null);
  const [menuGroupId, setMenuGroupId] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{
    id: string;
    label: string;
  } | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropAt, setDropAt] = useState<{
    group: string | null;
    index: number;
  } | null>(null);
  const q = query.trim().toLowerCase();
  const matches = (p: StudioPage) =>
    !q || `${p.title} ${p.slug}`.toLowerCase().includes(q);
  const editable = Boolean(menu && menuSource && onMenu) && !q;
  // Sections shown in the list: Home, the header's groups, then the rest.
  const sections: {
    id: string | null;
    label: string;
    pages: StudioPage[];
    kind: 'home' | 'group' | 'unplaced' | 'legacy';
  }[] = menu
    ? [
        {
          id: '__home',
          label: 'Home',
          pages: pages.filter((p) => p.slug === 'home'),
          kind: 'home',
        },
        ...menu.groups.map((g) => ({
          id: g.id,
          label: g.label,
          pages: g.pages,
          kind: 'group' as const,
        })),
        {
          id: null,
          label: 'Not in menu',
          pages: menu.unplaced,
          kind: 'unplaced',
        },
      ]
    : [...new Set(pages.map((p) => p.group))].map((group) => ({
        id: group,
        label: group,
        pages: pages.filter((p) => p.group === group),
        kind: 'legacy' as const,
      }));
  const groupOf = (slug: string) =>
    menuSource?.groups.find((g) => g.pages.includes(slug));
  function move(slug: string, group: string | null, index = Infinity) {
    if (!menuSource || !onMenu) return;
    void onMenu(movePage(menuSource, slug, group, index));
  }
  function nudge(slug: string, delta: number) {
    const group = groupOf(slug);
    if (!group) return;
    move(slug, group.id, group.pages.indexOf(slug) + delta);
  }
  function updateGroups(
    change: (groups: SiteMenu['groups']) => SiteMenu['groups'],
  ) {
    if (!menuSource || !onMenu) return;
    void onMenu({ groups: change(menuSource.groups.map((g) => ({ ...g }))) });
  }
  function commitRename() {
    if (!renaming) return;
    const label = renaming.label.trim().slice(0, 40);
    if (label)
      updateGroups((groups) =>
        groups.map((g) => (g.id === renaming.id ? { ...g, label } : g)),
      );
    setRenaming(null);
  }
  function addGroup() {
    if (!menuSource) return;
    const id = newGroupId(menuSource);
    updateGroups((groups) => [
      ...groups,
      { id, label: 'New group', pages: [] },
    ]);
    setRenaming({ id, label: 'New group' });
  }
  function moveGroup(id: string, delta: number) {
    updateGroups((groups) => {
      const index = groups.findIndex((g) => g.id === id);
      const target = index + delta;
      if (index < 0 || target < 0 || target >= groups.length) return groups;
      const [group] = groups.splice(index, 1);
      groups.splice(target, 0, group);
      return groups;
    });
  }
  const dropProps = (group: string | null, index: number) =>
    editable
      ? {
          onDragOver: (e: DragEvent) => {
            if (!dragging) return;
            e.preventDefault();
            e.stopPropagation();
            const box = (
              e.currentTarget as HTMLElement
            ).getBoundingClientRect();
            const after = e.clientY > box.top + box.height / 2;
            setDropAt({ group, index: index + (after ? 1 : 0) });
          },
          onDrop: (e: DragEvent) => {
            e.preventDefault();
            e.stopPropagation();
            if (dragging && dropAt) {
              // Indices after the dragged page shift once it is removed.
              const from = groupOf(dragging);
              const current = from?.pages.indexOf(dragging) ?? -1;
              const index =
                from?.id === dropAt.group &&
                current >= 0 &&
                current < dropAt.index
                  ? dropAt.index - 1
                  : dropAt.index;
              move(dragging, dropAt.group, index);
            }
            setDragging(null);
            setDropAt(null);
          },
        }
      : {};
  const row = (
    p: StudioPage,
    section: (typeof sections)[number],
    index: number,
  ) =>
    confirming === p.slug ? (
      <div
        key={p.slug}
        className="studio-page-confirm"
        role="alertdialog"
        aria-label={'Delete ' + p.title}
      >
        <span>
          {p.group === 'Custom pages'
            ? `Delete “${p.title}” for the whole team? Its content and links to it are removed.`
            : `Delete the template page “${p.title}” from this project? Your edits to it are discarded and links to it are removed. You can restore the original template page later.`}
        </span>
        <div>
          <button
            className="studio-danger"
            disabled={deleting}
            onClick={async () => {
              setDeleting(true);
              try {
                await onDelete?.(p.slug);
              } finally {
                setDeleting(false);
                setConfirming(null);
              }
            }}
          >
            {deleting ? 'Deleting…' : 'Delete page'}
          </button>
          <button disabled={deleting} onClick={() => setConfirming(null)}>
            Cancel
          </button>
        </div>
      </div>
    ) : (
      <div
        key={p.slug}
        className={
          'studio-page-row-item' +
          (dragging === p.slug ? ' is-dragging' : '') +
          (dropAt && dropAt.group === section.id && dropAt.index === index
            ? ' drop-before'
            : '') +
          (dropAt &&
          dropAt.group === section.id &&
          dropAt.index === index + 1 &&
          index === section.pages.length - 1
            ? ' drop-after'
            : '')
        }
        data-page-slug={p.slug}
        draggable={editable && section.kind !== 'home'}
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', p.slug);
          setDragging(p.slug);
        }}
        onDragEnd={() => {
          setDragging(null);
          setDropAt(null);
        }}
        {...(section.kind === 'home' ? {} : dropProps(section.id, index))}
      >
        {editable && section.kind !== 'home' && (
          <GripVertical className="studio-page-grip" size={13} aria-hidden />
        )}
        <button
          aria-current={page === p.slug ? 'page' : undefined}
          onClick={() => onNavigate(p.slug)}
        >
          <File size={14} />
          <span>{p.title}</span>
        </button>
        {onDuplicate && (
          <button
            className="studio-page-delete"
            aria-label={'Duplicate page ' + p.title}
            title="Duplicate page"
            onClick={() => onDuplicate(p.slug)}
          >
            <Copy size={13} />
          </button>
        )}
        {onDelete && (p.slug as string) !== 'home' && (
          <button
            className="studio-page-delete"
            aria-label={'Delete page ' + p.title}
            title="Delete page"
            onClick={() => setConfirming(p.slug)}
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>
    );
  const shown = sections
    .map((s) => ({ ...s, pages: s.pages.filter(matches) }))
    .filter(
      (s) =>
        s.pages.length ||
        (editable && s.kind === 'group') ||
        (editable && s.kind === 'unplaced'),
    );
  const currentGroup = menuPage ? groupOf(menuPage.slug) : undefined;
  return (
    <div className="studio-pages">
      {onHeader && (
        <button className="studio-header-page" onClick={onHeader}>
          <PanelLeft size={15} />
          <span>
            Header & logo<small>Navigation, logo and style</small>
          </span>
        </button>
      )}
      {onCreate && (
        <button className="studio-new-page" onClick={onCreate}>
          <Plus size={15} /> New page
        </button>
      )}
      <label className="studio-page-search">
        <Search size={14} />
        <input
          aria-label="Find a page"
          placeholder="Find a page…"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
        />
      </label>
      <ContextMenu
        onOpenChange={(open, details) => {
          if (!open || !(details.event.target instanceof Element)) return;
          const target = details.event.target;
          const slug =
            target.closest<HTMLElement>('[data-page-slug]')?.dataset.pageSlug;
          setMenuPage(pages.find((p) => p.slug === slug) || null);
          setMenuGroupId(
            slug
              ? null
              : target.closest<HTMLElement>('[data-menu-group]')?.dataset
                  .menuGroup || null,
          );
        }}
      >
        <ContextMenuTrigger className="studio-page-menu-area">
          <div
            className="studio-page-list"
            aria-label={menu ? 'Header menu and pages' : 'Wiki pages'}
          >
            {menu && (
              <p className="studio-menu-hint">
                {editable
                  ? 'Groups match the header menu. Drag pages to reorder or regroup them, or right-click for more.'
                  : q
                    ? 'Clear the search to rearrange the menu.'
                    : ''}
              </p>
            )}
            {shown.map((section) => (
              <div
                key={section.id ?? '__unplaced'}
                className={'studio-menu-section is-' + section.kind}
                data-menu-group={
                  section.kind === 'group' ? section.id! : undefined
                }
                {...(section.kind === 'group' || section.kind === 'unplaced'
                  ? dropProps(section.id, section.pages.length)
                  : {})}
              >
                {renaming && renaming.id === section.id ? (
                  <input
                    className="studio-menu-rename"
                    aria-label="Menu group name"
                    ref={(input) => input?.focus()}
                    maxLength={40}
                    value={renaming.label}
                    onChange={(e) =>
                      setRenaming({ ...renaming, label: e.target.value })
                    }
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitRename();
                      if (e.key === 'Escape') setRenaming(null);
                    }}
                    onBlur={commitRename}
                  />
                ) : (
                  <h3
                    title={
                      section.kind === 'unplaced'
                        ? 'Pages not linked from the header menu'
                        : undefined
                    }
                  >
                    {section.kind === 'group' && editable ? (
                      <button
                        type="button"
                        className="studio-menu-label"
                        title="Header menu group. Double-click or press Enter to rename"
                        onDoubleClick={() =>
                          setRenaming({ id: section.id!, label: section.label })
                        }
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === 'F2')
                            setRenaming({
                              id: section.id!,
                              label: section.label,
                            });
                        }}
                      >
                        {section.label}
                      </button>
                    ) : (
                      section.label
                    )}
                    {section.kind === 'group' && <small>menu</small>}
                  </h3>
                )}
                {section.pages.map((p, index) => row(p, section, index))}
                {!section.pages.length && editable && (
                  <p className="studio-menu-empty">
                    {section.kind === 'group'
                      ? 'Drop pages here. Empty groups are hidden in the header.'
                      : 'Every page is in the menu.'}
                  </p>
                )}
              </div>
            ))}
            {editable && (
              <button className="studio-menu-add" onClick={addGroup}>
                <Plus size={14} /> Add menu group
              </button>
            )}
            {!shown.length && (
              <p className="studio-help">No pages match your search.</p>
            )}
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent className="studio-context-menu">
          {menuPage ? (
            <>
              <div className="studio-context-label">{menuPage.title}</div>
              <ContextMenuItem onClick={() => onNavigate(menuPage.slug)}>
                <File size={15} /> Open page
              </ContextMenuItem>
              {editable && (menuPage.slug as string) !== 'home' && (
                <>
                  <ContextMenuSeparator />
                  <ContextMenuSub>
                    <ContextMenuSubTrigger>
                      <FolderInput size={15} /> Move to menu group
                    </ContextMenuSubTrigger>
                    <ContextMenuSubContent className="studio-context-menu">
                      {menuSource!.groups.map((g) => (
                        <ContextMenuItem
                          key={g.id}
                          disabled={currentGroup?.id === g.id}
                          onClick={() => move(menuPage.slug, g.id)}
                        >
                          {g.label}
                        </ContextMenuItem>
                      ))}
                      <ContextMenuSeparator />
                      <ContextMenuItem
                        disabled={!currentGroup}
                        onClick={() => move(menuPage.slug, null)}
                      >
                        Remove from menu
                      </ContextMenuItem>
                    </ContextMenuSubContent>
                  </ContextMenuSub>
                  <ContextMenuItem
                    disabled={
                      !currentGroup || currentGroup.pages[0] === menuPage.slug
                    }
                    onClick={() => nudge(menuPage.slug, -1)}
                  >
                    <ArrowUp size={15} /> Move up
                  </ContextMenuItem>
                  <ContextMenuItem
                    disabled={
                      !currentGroup ||
                      currentGroup.pages.at(-1) === menuPage.slug
                    }
                    onClick={() => nudge(menuPage.slug, 1)}
                  >
                    <ArrowDown size={15} /> Move down
                  </ContextMenuItem>
                </>
              )}
              <ContextMenuSeparator />
              {(menuPage.slug as string) !== 'home' && onDelete ? (
                <ContextMenuItem
                  variant="destructive"
                  onClick={() => setConfirming(menuPage.slug)}
                >
                  <Trash2 size={15} /> Delete page…
                </ContextMenuItem>
              ) : (
                <ContextMenuItem disabled>
                  <Trash2 size={15} /> The home page can’t be deleted
                </ContextMenuItem>
              )}
            </>
          ) : menuGroupId && editable ? (
            <>
              <div className="studio-context-label">
                {menuSource!.groups.find((g) => g.id === menuGroupId)?.label}
              </div>
              <ContextMenuItem
                onClick={() => {
                  const g = menuSource!.groups.find(
                    (g) => g.id === menuGroupId,
                  );
                  if (g) setRenaming({ id: g.id, label: g.label });
                }}
              >
                <Pencil size={15} /> Rename group
              </ContextMenuItem>
              <ContextMenuItem onClick={() => moveGroup(menuGroupId, -1)}>
                <ArrowUp size={15} /> Move group up
              </ContextMenuItem>
              <ContextMenuItem onClick={() => moveGroup(menuGroupId, 1)}>
                <ArrowDown size={15} /> Move group down
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem
                variant="destructive"
                onClick={() =>
                  updateGroups((groups) =>
                    groups.filter((g) => g.id !== menuGroupId),
                  )
                }
              >
                <Trash2 size={15} /> Delete group (pages stay, out of menu)
              </ContextMenuItem>
            </>
          ) : (
            <>
              {onCreate && (
                <ContextMenuItem onClick={onCreate}>
                  <Plus size={15} /> New page
                </ContextMenuItem>
              )}
              {editable && (
                <ContextMenuItem onClick={addGroup}>
                  <Plus size={15} /> Add menu group
                </ContextMenuItem>
              )}
            </>
          )}
        </ContextMenuContent>
      </ContextMenu>
      {removed.length > 0 && onRestore && (
        <details className="studio-removed-pages">
          <summary>Deleted template pages ({removed.length})</summary>
          {removed.map((p) => (
            <div key={p.slug}>
              <span>{p.title}</span>
              <button
                disabled={deleting}
                onClick={async () => {
                  setDeleting(true);
                  try {
                    await onRestore(p.slug);
                  } finally {
                    setDeleting(false);
                  }
                }}
              >
                Restore
              </button>
            </div>
          ))}
        </details>
      )}
      <p className="studio-pages-help">
        {pages.length} pages.{' '}
        {menu
          ? 'Menu changes apply to the header on every page as soon as you make them. '
          : ''}
        Right-click a page or use its bin icon to delete it (the home page
        stays).
      </p>
    </div>
  );
}

export function StudioPageTabs({
  page,
  ids,
  onNavigate,
  onClose,
  onBrowse,
  pages = studioPages,
}: {
  page: string;
  ids: string[];
  onNavigate: (page: string) => void;
  onClose: (page: string) => void;
  onBrowse: () => void;
  pages?: typeof studioPages;
}) {
  return (
    <nav className="studio-page-tabs" aria-label="Open pages">
      <button
        className="studio-browse-pages"
        title="Browse all pages"
        aria-label="Browse all pages"
        onClick={onBrowse}
      >
        <PanelLeft size={15} />
      </button>
      {ids.map((id) => {
        const entry = pages.find((p) => p.slug === id);
        if (!entry) return null;
        return (
          <div className={page === id ? 'active' : ''} key={id}>
            <button
              aria-current={page === id ? 'page' : undefined}
              onClick={() => onNavigate(id)}
            >
              <File size={12} />
              <span>{entry.title}</span>
            </button>
            {page !== id && (
              <button
                aria-label={'Close ' + entry.title + ' tab'}
                onClick={() => onClose(id)}
              >
                <X size={12} />
              </button>
            )}
          </div>
        );
      })}
    </nav>
  );
}
