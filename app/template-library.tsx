'use client';
/* oxlint-disable next/no-html-link-for-pages, next/no-img-element -- Standalone self-hosted client; template assets are served directly. */
import { projectNameKey } from './project-name';
import { useRef, useState } from 'react';
import {
  ArrowUpRight,
  Plus,
  Layers,
  ArrowRight,
  Globe,
  Download,
  Trash2,
  RotateCcw,
  MoreHorizontal,
  Eye,
  Pencil,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import type { Project, Projects } from './project-api';
import { TemplateChangeDialog } from './template-change-dialog';
import { ProjectRenameDialog } from './project-rename-dialog';

export function TemplateLibrary({
  initial,
  name,
}: {
  initial: Projects;
  name: string;
}) {
  const [data, setData] = useState(initial),
    [chosen, setChosen] = useState<string | null>(null),
    [title, setTitle] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [deleting, setDeleting] = useState<Project | null>(null),
    [changing, setChanging] = useState<Project | null>(null),
    [renaming, setRenaming] = useState<Project | null>(null),
    [replacementId, setReplacementId] = useState('');
  const creating = useRef(false);
  const existing = data.projects.filter(
    (p) => (p.appearanceId || p.templateId) === chosen,
  );
  const sameName = data.projects.find(
    (p) => projectNameKey(p.name) === projectNameKey(title),
  );
  async function create() {
    if (creating.current || sameName) return;
    creating.current = true;
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          name: title,
          templateId: chosen,
        }),
      });
      const result = (await response.json()) as Projects & {
        id: string;
        error?: string;
      };
      if (!response.ok) {
        if (response.status === 409) {
          const latest = await fetch('/api/projects');
          if (latest.ok) setData(await latest.json());
        }
        throw Error(result.error || 'Could not create the project.');
      }
      location.assign('/?studio=1&project=' + encodeURIComponent(result.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create project');
      setBusy(false);
      creating.current = false;
    }
  }
  async function makeDefault(id: string) {
    setBusy(true);
    setError('');
    try {
      const r = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'default', id }),
      });
      const result = (await r.json()) as Projects & { error?: string };
      if (!r.ok) throw Error(result.error);
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not select default');
    } finally {
      setBusy(false);
    }
  }
  async function changeDeleted(action: 'delete' | 'restore', id: string) {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, id, replacementId }),
      });
      const result = (await response.json()) as Projects & { error?: string };
      if (!response.ok) {
        // Refresh choices when another teammate changed the project list.
        const latest = await fetch('/api/projects');
        if (latest.ok) setData(await latest.json());
        throw Error(result.error || 'Could not update this project.');
      }
      setData(result);
      setDeleting(null);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Could not update this project.',
      );
    } finally {
      setBusy(false);
    }
  }
  function askDelete(project: Project) {
    setDeleting(project);
    setReplacementId('');
    setError('');
  }
  const needsReplacement =
    deleting?.id === data.defaultId &&
    data.projects.some((p) => p.id !== deleting.id);
  return (
    <div className="template-library">
      {renaming && (
        <ProjectRenameDialog
          key={renaming.id}
          project={renaming}
          projects={data.projects}
          onClose={() => setRenaming(null)}
          onRenamed={setData}
        />
      )}
      <header className="library-header">
        <a href="/workspace">
          <Layers size={20} /> Website Studio
        </a>
        <span>{name}</span>
        <a href="/auth/logout">Sign out</a>
      </header>
      <main className="library-main">
        <div className="library-intro">
          <p>YOUR TEAM’S WORKSPACE</p>
          <h1>Make it your own.</h1>
          <div>Choose a starting point, then build your story together.</div>
        </div>
        <div className="library-section-title">
          <h2>Start from a template</h2>
          <span>Choose a design. Make it yours.</span>
        </div>
        <div className="library-templates">
          {(data.templates || []).map((template) => (
            <button
              className={'library-template library-' + template.id}
              key={template.id}
              onClick={() => {
                setChosen(template.id);
                setTitle(
                  template.id === 'blank' ? 'Untitled project' : template.name,
                );
                setError('');
              }}
            >
              <div className="library-template-cover">
                {template.id === 'blank' ? (
                  <>
                    <Plus size={34} />
                    <span>A fresh start.</span>
                  </>
                ) : ['notebook-purple', 'notebook-white'].includes(
                    template.id,
                  ) ? (
                  <>
                    <b>
                      Small proteins.
                      <br />
                      <em>Big possibilities.</em>
                    </b>
                    <img
                      src="/templates/notebook-purple/logo-transparent.png"
                      alt=""
                    />
                    <span className="library-purple-note">
                      {template.id === 'notebook-white'
                        ? 'White pages · notebook illustrations'
                        : 'a more curious notebook'}
                    </span>
                  </>
                ) : template.id === 'swiss' ? (
                  <>
                    <b>
                      ENGINEERING
                      <br />
                      PRION-LIKE
                      <br />
                      SYSTEMS<span>.</span>
                    </b>
                    <img src="/templates/swiss/protein-surface.png" alt="" />
                  </>
                ) : (
                  <>
                    <b>
                      A gel made
                      <br />
                      from <em>proteins.</em>
                    </b>
                    <img
                      src="/templates/regelerate/gel-watercolor.png"
                      alt=""
                    />
                  </>
                )}
              </div>
              <div className="library-template-label">
                <div>
                  <strong>{template.name}</strong>
                  <small>
                    {template.id === 'blank'
                      ? 'An empty page, ready for anything'
                      : `${template.pageCount} pages · Ready to customize`}
                  </small>
                </div>
                <ArrowUpRight size={19} />
              </div>
            </button>
          ))}
        </div>
        <div className="library-section-title library-project-heading">
          <h2>
            Your projects <span>{data.projects.length}</span>
          </h2>
          <span>Choose a project to continue editing.</span>
        </div>
        {error && !chosen && !deleting && (
          <p role="alert" className="library-error">
            {error}
          </p>
        )}
        {data.projects.length ? (
          <div className="library-projects">
            {data.projects.map((project) => (
              <article key={project.id}>
                <div
                  className={
                    'library-project-icon library-' +
                    (project.appearanceId || project.templateId)
                  }
                >
                  <Layers size={20} />
                </div>
                <div className="library-project-info">
                  <h3>
                    <a href={'/?studio=1&project=' + project.id}>
                      {project.name}
                    </a>
                  </h3>
                  <p>
                    Template ·{' '}
                    {data.templates?.find(
                      (t) =>
                        t.id === (project.appearanceId || project.templateId),
                    )?.name || 'Project'}
                    {data.defaultId === project.id && (
                      <span className="library-default-badge">
                        <Globe size={11} />
                        Main website
                      </span>
                    )}
                  </p>
                </div>
                <div className="library-project-actions">
                  <a
                    className="library-view"
                    href={'/?project=' + project.id}
                    aria-label={'View ' + project.name}
                  >
                    <Eye size={15} /> View
                  </a>
                  <a
                    className="library-edit"
                    href={'/?studio=1&project=' + project.id}
                  >
                    Edit project <ArrowRight size={14} />
                  </a>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      className="library-project-more"
                      disabled={busy}
                      aria-label={'More actions for ' + project.name}
                      title="More actions"
                    >
                      <MoreHorizontal size={20} />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="end"
                      sideOffset={8}
                      className="library-project-menu"
                    >
                      <DropdownMenuItem onClick={() => setChanging(project)}>
                        <Layers size={16} /> Change template
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setRenaming(project)}>
                        <Pencil size={16} /> Rename project
                      </DropdownMenuItem>
                      {data.defaultId !== project.id && (
                        <DropdownMenuItem
                          onClick={() => void makeDefault(project.id)}
                        >
                          <Globe size={16} /> Set as main website
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => askDelete(project)}
                      >
                        <Trash2 size={16} /> Delete project…
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="library-empty">
            <Layers size={24} />
            <strong>Your first project starts above.</strong>
            <span>
              Template copies have their own pages, styles and saved edits.
            </span>
          </div>
        )}
        {!!data.archivedProjects?.length && (
          <details className="library-archive">
            <summary>Archived previous work</summary>
            <p>
              The retired starter is no longer used for new projects. Previous
              saved work is available as an export.
            </p>
            {data.archivedProjects.map((p) => (
              <div key={p.id} className="library-trash-row">
                <a
                  download={p.name + '.json'}
                  href={'/api/export?project=' + p.id}
                >
                  <Download size={14} />
                  {p.name} · Download snapshot
                </a>
                <button
                  disabled={busy}
                  onClick={() => askDelete(p)}
                  aria-label={'Delete project ' + p.name}
                >
                  <Trash2 size={14} /> Delete
                </button>
              </div>
            ))}
          </details>
        )}
        {!!data.deletedProjects?.length && (
          <details className="library-archive library-trash">
            <summary>Trash · {data.deletedProjects.length}</summary>
            <p>
              Deleted projects are hidden from everyone. Restore brings back
              their saved pages and edits. Shared uploads and original templates
              are kept.
            </p>
            {data.deletedProjects.map((p) => (
              <div key={p.id} className="library-trash-row">
                <span>{p.name}</span>
                <button
                  disabled={busy}
                  onClick={() => void changeDeleted('restore', p.id)}
                  aria-label={'Restore project ' + p.name}
                >
                  <RotateCcw size={14} /> Restore
                </button>
              </div>
            ))}
          </details>
        )}
      </main>
      {changing && (
        <TemplateChangeDialog
          project={changing}
          templates={data.templates || []}
          onClose={() => setChanging(null)}
          onChanged={() => {
            void fetch('/api/projects')
              .then((r) => r.json() as Promise<Projects>)
              .then(setData)
              .catch(() =>
                setError('Refresh the library to see the latest template.'),
              );
          }}
        />
      )}
      <Dialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open && !busy) {
            setDeleting(null);
            setError('');
          }
        }}
      >
        <DialogContent
          className="studio-dialog library-delete-dialog"
          showCloseButton={!busy}
        >
          <div className="library-delete-symbol">
            <Trash2 size={22} />
          </div>
          <DialogTitle>Delete “{deleting?.name}”?</DialogTitle>
          <DialogDescription>
            This removes the project from everyone’s workspace and makes its
            links unavailable. Saved pages and edits can be recovered from
            Trash. Templates and shared uploads are kept.
          </DialogDescription>
          {needsReplacement ? (
            <label className="library-replacement">
              Choose the new main website
              <select
                value={replacementId}
                disabled={busy}
                onChange={(e) => setReplacementId(e.target.value)}
              >
                <option value="">Select a project…</option>
                {data.projects
                  .filter((p) => p.id !== deleting?.id)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
            </label>
          ) : (
            deleting?.id === data.defaultId && (
              <p className="library-delete-note">
                The main URL will show the project selector until a project is
                created or restored.
              </p>
            )
          )}
          {error && (
            <p role="alert" className="library-error">
              {error}
            </p>
          )}
          <div className="library-delete-actions">
            <button
              disabled={busy}
              onClick={() => {
                setDeleting(null);
                setError('');
              }}
            >
              Cancel
            </button>
            <button
              className="library-confirm-delete"
              disabled={
                busy ||
                (!!needsReplacement &&
                  !data.projects.some(
                    (p) => p.id === replacementId && p.id !== deleting?.id,
                  ))
              }
              onClick={() =>
                deleting && void changeDeleted('delete', deleting.id)
              }
            >
              {busy ? 'Deleting…' : 'Delete project'}
            </button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={chosen !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setChosen(null);
        }}
      >
        <DialogContent className="studio-dialog library-create-dialog">
          <DialogTitle>
            {existing.length
              ? 'Continue your project'
              : chosen === 'blank'
                ? 'Create a blank project'
                : 'Use this template'}
          </DialogTitle>
          <DialogDescription>
            {existing.length
              ? 'You already have projects using this template. Open one below to keep editing.'
              : 'Create a separate project for your team. Software updates will keep this project and its saved edits.'}
          </DialogDescription>
          {!!existing.length && (
            <div className="library-existing-projects">
              {existing.map((p) => (
                <a
                  key={p.id}
                  href={'/?studio=1&project=' + encodeURIComponent(p.id)}
                >
                  <span>
                    {p.name}
                    {p.id === data.defaultId && <small>Main website</small>}
                  </span>
                  <span>
                    Open <ArrowRight size={14} />
                  </span>
                </a>
              ))}
            </div>
          )}
          <details className="library-new-copy" open={!existing.length}>
            <summary>Create a separate project</summary>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void create();
              }}
            >
              <label htmlFor="library-project-name">Project name</label>
              <Input
                id="library-project-name"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={80}
              />
              {error && <p role="alert">{error}</p>}
              {sameName && (
                <p className="library-name-conflict">
                  A project with this name already exists.{' '}
                  <a
                    href={
                      '/?studio=1&project=' + encodeURIComponent(sameName.id)
                    }
                  >
                    Open existing project
                  </a>
                  , or enter a different name for a new copy.
                </p>
              )}
              <button
                disabled={busy || !title.trim() || !!sameName}
                type="submit"
              >
                {busy ? 'Creating project…' : 'Create & open editor'}{' '}
                <ArrowRight size={15} />
              </button>
            </form>
          </details>
        </DialogContent>
      </Dialog>
    </div>
  );
}
