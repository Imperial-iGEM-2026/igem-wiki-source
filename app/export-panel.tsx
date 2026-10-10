'use client';
import { projectFetch, projectURL } from './project-api';
import { useRef, useState } from 'react';
import {
  Archive,
  FileCode2,
  Images,
  Film,
  Download,
  LoaderCircle,
  RefreshCw,
  ArrowUpRight,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import './export-panel.css';
import { igemAwards } from './igem-pages';

type Bundle = {
  key: string;
  filename: string;
  url: string;
  bytes: number;
  files: number;
};
type ExportPlan = {
  project: string;
  exportedAt: string;
  expiresAt: string;
  externalFiles: number;
  downloads: Bundle[];
};
const parts = [
  {
    key: 'source',
    title: 'Website source',
    destination: 'iGEM GitLab',
    description: 'Pages, design & build files',
    icon: FileCode2,
  },
  {
    key: 'assets',
    title: 'Images & files',
    destination: 'iGEM Uploads',
    description: 'Images, documents & 3D models',
    icon: Images,
  },
  {
    key: 'media',
    title: 'Video & audio',
    destination: 'Video Universe',
    description: 'Original recordings',
    icon: Film,
  },
];
function size(bytes: number) {
  if (bytes < 1024 * 1024) return Math.max(1, Math.round(bytes / 1024)) + ' KB';
  if (bytes < 1024 ** 3) return (bytes / 1024 ** 2).toFixed(1) + ' MB';
  return (bytes / 1024 ** 3).toFixed(1) + ' GB';
}
export function ExportPanel({ disabled }: { disabled: boolean }) {
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false);
  const [team, setTeam] = useState('imperial-college');
  const [requiredPages, setRequiredPages] = useState<string[]>([]);
  const [plan, setPlan] = useState<ExportPlan | null>(null);
  const [error, setError] = useState('');
  const generation = useRef(0);
  async function prepare() {
    const current = ++generation.current;
    setBusy(true);
    setError('');
    setPlan(null);
    try {
      const response = await projectFetch('/api/export/bundles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ team, requiredPages }),
      });
      if (!response.headers.get('content-type')?.includes('application/json'))
        throw Error(
          'The export server is unavailable. Sign in again or update the server, then retry.',
        );
      const result = (await response.json()) as ExportPlan & { error?: string };
      if (!response.ok)
        throw Error(
          result.error || 'Could not prepare your export. Please retry.',
        );
      if (current === generation.current) setPlan(result);
    } catch (failure) {
      if (current === generation.current)
        setError(
          failure instanceof Error
            ? failure.message
            : 'Export failed. Please retry.',
        );
    } finally {
      if (current === generation.current) setBusy(false);
    }
  }
  function changeOpen(value: boolean) {
    generation.current++;
    setOpen(value);
    setPlan(null);
    setError('');
    setBusy(false);
  }
  return (
    <>
      <button
        disabled={disabled}
        title={
          disabled
            ? 'Save or cancel your draft first'
            : 'Export saved pages for iGEM'
        }
        onClick={() => changeOpen(true)}
      >
        Export wiki
      </button>
      <Dialog open={open} onOpenChange={changeOpen}>
        <DialogContent className="wiki-export-dialog">
          <div className="wiki-export-heading">
            <span className="wiki-export-emblem">
              <Archive size={22} />
            </span>
            <div>
              <DialogTitle>Export for iGEM</DialogTitle>
              <DialogDescription>
                Your saved project, in three ZIPs.
              </DialogDescription>
            </div>
          </div>
          <label className="wiki-export-team">
            Team URL name
            <div>
              <span>2026.igem.wiki /</span>
              <input
                value={team}
                disabled={busy}
                autoComplete="off"
                maxLength={80}
                spellCheck={false}
                aria-label="Team URL name"
                onChange={(event) => {
                  setTeam(event.target.value.trim().toLowerCase());
                  setPlan(null);
                  setError('');
                }}
              />
            </div>
          </label>
          <details className="wiki-export-awards">
            <summary>
              Award pages{' '}
              <span>
                {requiredPages.length
                  ? `${requiredPages.length} selected`
                  : 'Choose your awards'}
              </span>
            </summary>
            <p>
              Medal pages are always checked. Select the awards you are entering
              so missing pages block export.
            </p>
            <div>
              {igemAwards.map(([slug, label]) => (
                <label key={slug}>
                  <input
                    type="checkbox"
                    checked={requiredPages.includes(slug)}
                    disabled={busy}
                    onChange={(event) => {
                      setRequiredPages(
                        event.target.checked
                          ? [...requiredPages, slug]
                          : requiredPages.filter((id) => id !== slug),
                      );
                      setPlan(null);
                      setError('');
                    }}
                  />
                  <span>
                    {label}
                    <small>/{slug}</small>
                  </span>
                </label>
              ))}
            </div>
          </details>
          <div className="wiki-export-parts">
            {parts.map((part, index) => {
              const bundle = plan?.downloads.find(
                (item) => item.key === part.key,
              );
              const Icon = part.icon;
              return (
                <div className="wiki-export-part" key={part.key}>
                  <span className="wiki-export-file-icon">
                    <Icon size={22} />
                    <small>0{index + 1}</small>
                  </span>
                  <div className="wiki-export-part-copy">
                    <strong>{part.title}</strong>
                    <a
                      href={
                        part.key === 'source'
                          ? `https://gitlab.igem.org/2026/${encodeURIComponent(team)}`
                          : part.key === 'assets'
                            ? 'https://teams.igem.org/go/deliverables/wiki/uploads'
                            : 'https://video.igem.org/'
                      }
                      target="_blank"
                      rel="noreferrer"
                    >
                      {part.destination}
                      <ArrowUpRight size={12} />
                    </a>
                    <small>
                      {bundle
                        ? part.key === 'media' && !bundle.files
                          ? 'No recordings · guide included'
                          : `${bundle.files} files · ${size(bundle.bytes)}`
                        : part.description}
                    </small>
                  </div>
                  {bundle ? (
                    <a
                      className="wiki-export-download"
                      href={projectURL(bundle.url, false)}
                      download={bundle.filename}
                      aria-label={`Download ${part.title} ZIP`}
                      onClick={(event) => {
                        if (Date.now() >= Date.parse(plan!.expiresAt)) {
                          event.preventDefault();
                          setPlan(null);
                          setError(
                            'These downloads have expired. Prepare a fresh export below.',
                          );
                        }
                      }}
                    >
                      <Download size={17} />
                      <span>ZIP</span>
                    </a>
                  ) : (
                    <span className="wiki-export-zip">.zip</span>
                  )}
                </div>
              );
            })}
          </div>
          <div className="wiki-export-guidance">
            <strong>Let the upload helper connect your files</strong>
            <p>
              Open the helper on your computer, choose these three ZIPs, and
              sign in to iGEM. It uploads media, fills in the URLs and opens a
              GitLab review. No manual JSON edits.
            </p>
            <a
              className="wiki-export-helper"
              href="/upload-helper.zip"
              download="regelerate-upload-helper.zip"
            >
              <Download size={16} /> Download upload helper
            </a>
            <p className="wiki-export-helper-note">
              Windows, macOS & Linux · Node.js 24 required
            </p>
            <details>
              <summary>Before publishing</summary>
              <p>
                Exports include a CC BY 4.0 LICENSE. Third-party licences are
                retained. Review your saved content and video details in the
                helper. External media may need its original file. Markdown and
                upload guides are excluded from GitLab. Review and merge the
                resulting request to publish.
              </p>
            </details>
          </div>
          {error && (
            <p className="wiki-export-error" role="alert">
              {error}
            </p>
          )}
          <div className="wiki-export-footer" aria-live="polite">
            {plan ? (
              <>
                <div>
                  <strong>{plan.project}</strong>
                  <span>Medal and selected award URLs checked</span>
                  <span>
                    Saved snapshot ·{' '}
                    {new Date(plan.exportedAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}{' '}
                    · links last 30 min
                  </span>
                  {plan.externalFiles > 0 && (
                    <span>
                      {plan.externalFiles} external{' '}
                      {plan.externalFiles === 1
                        ? 'file listed'
                        : 'files listed'}{' '}
                      in the manifest
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  className="wiki-export-refresh"
                  onClick={prepare}
                  aria-label="Prepare fresh export"
                  title="Prepare fresh export"
                >
                  <RefreshCw size={17} />
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="wiki-export-prepare"
                  disabled={busy || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(team)}
                  onClick={prepare}
                >
                  {busy ? (
                    <LoaderCircle className="wiki-export-spin" size={18} />
                  ) : (
                    <Archive size={18} />
                  )}
                  {busy ? 'Preparing downloads…' : 'Prepare three ZIPs'}
                </button>
                <small>
                  Saved changes only · large media streams directly to disk
                </small>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
