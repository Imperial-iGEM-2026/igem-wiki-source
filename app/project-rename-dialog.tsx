'use client';
import { useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { projectFetch, type Project, type Projects } from './project-api';
import { projectNameKey } from './project-name';

export function ProjectRenameDialog({
  project,
  projects,
  onClose,
  onRenamed,
}: {
  project: Project;
  projects: Project[];
  onClose: () => void;
  onRenamed: (data: Projects) => void;
}) {
  const [name, setName] = useState(project.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const saving = useRef(false);
  const duplicate = projects.some(
    (p) =>
      p.id !== project.id && projectNameKey(p.name) === projectNameKey(name),
  );
  async function save() {
    if (saving.current || !name.trim() || duplicate) return;
    saving.current = true;
    setBusy(true);
    setError('');
    try {
      const response = await projectFetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'rename', id: project.id, name }),
      });
      const result = (await response.json()) as Projects & { error?: string };
      if (!response.ok)
        throw Error(result.error || 'Could not rename this project.');
      onRenamed(result);
      onClose();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Could not rename this project.',
      );
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !saving.current) onClose();
      }}
    >
      <DialogContent className="studio-dialog" showCloseButton={!busy}>
        <DialogTitle>Rename project</DialogTitle>
        <DialogDescription>
          Give this project a name your team can recognize. Pages, images and
          website URLs stay the same.
        </DialogDescription>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <label>
            Project name
            <Input
              value={name}
              maxLength={80}
              required
              disabled={busy}
              onFocus={(event) => event.target.select()}
              onChange={(event) => {
                setName(event.target.value);
                setError('');
              }}
              aria-invalid={duplicate || !!error}
              aria-describedby={
                duplicate || error ? 'project-rename-error' : undefined
              }
            />
          </label>
          {(duplicate || error) && (
            <p id="project-rename-error" role="alert">
              {duplicate
                ? 'A project with this name already exists. Choose a different name.'
                : error}
            </p>
          )}
          <div className="studio-dialog-actions">
            <button type="button" disabled={busy} onClick={onClose}>
              Cancel
            </button>
            <button
              className="studio-primary"
              type="submit"
              disabled={busy || !name.trim() || duplicate}
            >
              {busy ? 'Saving…' : 'Save name'}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
