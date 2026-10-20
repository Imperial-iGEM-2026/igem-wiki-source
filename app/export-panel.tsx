'use client';

import { projectFetch, projectURL } from './project-api';
import { prepareExport, ExportRequestError } from './export-request';

import { useEffect, useRef, useState } from 'react';

import {
  Archive,
  FileCode2,
  Images,
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

  sourceChanges?: string[];

  googleFontsDownloaded?: number;

  recordingTodos?: {
    source: string;
    kind: string;
    locations: { page?: string; pageTitle: string; layerName: string }[];
  }[];

  downloads: Bundle[];
};

type MediaIssue = {
  source: string;

  kind: string;

  reason: string;

  locations: {
    page?: string;

    pageTitle: string;

    layerId?: string;

    layerName: string;

    field: string;
  }[];
};

function downloadMediaReport(issues: MediaIssue[]) {
  const report = issues

    .map((issue, index) =>
      [
        `${index + 1}. ${issue.source}`,

        issue.reason,

        ...issue.locations.map(
          (location) =>
            `Where: ${location.pageTitle} → ${location.layerName} → ${location.field}${location.layerId ? ` (layer: ${location.layerId})` : ''}`,
        ),
      ].join('\n'),
    )

    .join('\n\n');

  const url = URL.createObjectURL(
    new Blob([report], { type: 'text/plain;charset=utf-8' }),
  );

  const link = document.createElement('a');

  link.href = url;

  link.download = 'export-media-issues.txt';

  link.click();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

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
];

function size(bytes: number) {
  if (bytes < 1024 * 1024) return Math.max(1, Math.round(bytes / 1024)) + ' KB';

  if (bytes < 1024 ** 3) return (bytes / 1024 ** 2).toFixed(1) + ' MB';

  return (bytes / 1024 ** 3).toFixed(1) + ' GB';
}

export function ExportPanel({ disabled, standalone = false, onClose }: { disabled: boolean; standalone?: boolean; onClose?: () => void }) {
  const [open, setOpenState] = useState(standalone),
    [busy, setBusy] = useState(false);
  const setOpen = (value: boolean) => { setOpenState(value); if (!value) onClose?.(); };

  const [team, setTeam] = useState('imperial-college');

  const [requiredPages, setRequiredPages] = useState<string[]>([]);

  const [plan, setPlan] = useState<ExportPlan | null>(null);

  const [error, setError] = useState('');
  const [progress, setProgress] = useState('');
  const pendingExport = useRef<{
    key: string;
    requestId: string;
    statusURL?: string;
  } | null>(null);

  const [mediaIssues, setMediaIssues] = useState<MediaIssue[]>([]);

  const generation = useRef(0);
  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );

  const dialogRef = useRef<HTMLDivElement>(null);

  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!error) return;

    dialogRef.current?.scrollTo({ top: 0 });

    errorRef.current?.focus({ preventScroll: true });
  }, [error]);

  async function prepare() {
    const current = ++generation.current;

    setBusy(true);

    setError('');

    setMediaIssues([]);
    setProgress('Starting export preparation…');

    setPlan(null);

    try {
      const key = JSON.stringify({
        team,
        requiredPages,
        project: projectURL('/'),
      });
      if (!pendingExport.current || pendingExport.current.key !== key)
        pendingExport.current = { key, requestId: crypto.randomUUID() };
      const pending = pendingExport.current;
      const result = await prepareExport({
        fetcher: projectFetch,
        body: { team, requiredPages, requestId: pending.requestId },
        resumeURL: pending.statusURL,
        onJob: (url) => {
          pending.statusURL = url;
        },
        onProgress: (message) => {
          if (current === generation.current) setProgress(message);
        },
        active: () => current === generation.current,
      });
      if (current === generation.current && result) {
        setPlan(result as unknown as ExportPlan);
        pendingExport.current = null;
      }
    } catch (failure) {
      if (
        current === generation.current &&
        failure instanceof ExportRequestError
      ) {
        setMediaIssues(failure.mediaIssues as MediaIssue[]);
        if (
          failure.terminal ||
          ![502, 503, 504, 520, 521, 522, 523, 524].includes(failure.status)
        )
          pendingExport.current = null;
      }
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

    setMediaIssues([]);

    setBusy(false);
  }

  return (
    <>
      {!standalone && <button
        disabled={disabled}

        title={
          disabled
            ? 'Save or cancel your draft first'
            : 'Export saved pages for iGEM'
        }

        onClick={() => changeOpen(true)}
      >
        Export wiki
      </button>}
      <Dialog open={open} onOpenChange={changeOpen}>
        <DialogContent className="wiki-export-dialog" ref={dialogRef}>
          <div className="wiki-export-heading">
            <span className="wiki-export-emblem">
              <Archive size={22} />
            </span>
            <div>
              <DialogTitle>Export for iGEM</DialogTitle>
              <DialogDescription>
                Your saved project, in two ZIPs.
              </DialogDescription>
            </div>
          </div>
          {error && (
            <div
              className="wiki-export-error"

              role="alert"

              ref={errorRef}

              tabIndex={-1}
            >
              {mediaIssues.length ? (
                <>
                  <strong>
                    {mediaIssues.length} media{' '}
                    {mediaIssues.length === 1 ? 'file needs' : 'files need'}{' '}
                    attention
                  </strong>
                  <p>
                    Fix these saved references, then prepare the ZIPs again.
                  </p>
                  <ol className="wiki-export-issues">
                    {mediaIssues.map((issue) => (
                      <li key={issue.source}>
                        <code>{issue.source}</code>
                        <p>{issue.reason}</p>
                        <ul>
                          {issue.locations.map((location, index) => (
                            <li key={index}>
                              <span>
                                {location.pageTitle} → {location.layerName} ·{' '}
                                {location.field}
                              </span>
                              {location.layerId && (
                                <small>Layer: {location.layerId}</small>
                              )}
                              {location.page && (
                                <a
                                  target="_blank"

                                  rel="noreferrer"

                                  href={projectURL(
                                    location.page === 'home'
                                      ? '/'
                                      : `/${encodeURIComponent(location.page)}`,
                                  )}
                                >
                                  Open page ↗
                                </a>
                              )}
                            </li>
                          ))}
                        </ul>
                      </li>
                    ))}
                  </ol>
                  <button
                    type="button"

                    className="wiki-export-report"

                    onClick={() => downloadMediaReport(mediaIssues)}
                  >
                    <Download size={15} />
                    Download error report
                  </button>
                </>
              ) : (
                error
              )}
            </div>
          )}
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
          <div className="wiki-export-recordings">
            <strong>Video &amp; audio: add embeds before exporting</strong>
            <p>
              Upload recordings to{' '}
              <a
                href="https://video.igem.org/"
                target="_blank"
                rel="noreferrer"
              >
                Video Universe
              </a>
              , then paste its HTML iframe into an HTML block or its embed URL
              into a Video embed block. Player settings are preserved.
            </p>
            <p>
              Raw recordings are excluded from both ZIPs. Their frames become
              visible TODOs in the exported website; your editor content stays
              unchanged.
            </p>
            {plan?.recordingTodos?.length ? (
              <details open>
                <summary>
                  {plan.recordingTodos.length}{' '}
                  {plan.recordingTodos.length === 1
                    ? 'recording needs an embed'
                    : 'recordings need embeds'}
                </summary>
                <ul>
                  {plan.recordingTodos.map((item, index) => (
                    <li key={index}>
                      {item.locations.map((location, i) =>
                        location.page ? (
                          <a
                            key={i}
                            href={projectURL(
                              (location.page === 'home'
                                ? '/'
                                : '/' + location.page + '/') + '?editor',
                            )}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {location.pageTitle} · {location.layerName}
                          </a>
                        ) : (
                          <span key={i}>
                            {location.pageTitle} · {location.layerName}
                          </span>
                        ),
                      )}
                      <small>{item.source || 'No recording URL saved'}</small>
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </div>
          {plan?.googleFontsDownloaded ? (
            <p role="status">
              {plan.googleFontsDownloaded} Google Font files downloaded with
              licence notices. The upload helper will upload them to iGEM and
              connect their URLs automatically.
            </p>
          ) : null}
          <div className="wiki-export-guidance">
            <strong>Let the upload helper connect your files</strong>
            <p>
              Open the helper on your computer, choose these two ZIPs, and sign
              in to iGEM. It uploads images and files, fills in their URLs and
              opens a GitLab review. No manual JSON edits.
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
                retained. Review your saved content and recording TODOs before
                publishing. External media may need its original file. Markdown
                and upload guides are excluded from GitLab. Review and merge the
                resulting request to publish.
              </p>
            </details>
          </div>
          {busy && (
            <output className="wiki-export-progress">
              <LoaderCircle size={16} className="animate-spin" />
              {progress || 'Preparing your saved project…'}
            </output>
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
                  {!!plan.sourceChanges?.length && (
                    <details className="export-note">
                      <summary>
                        {plan.sourceChanges.length} developer source{' '}
                        {plan.sourceChanges.length === 1 ? 'edit' : 'edits'}{' '}
                        included
                      </summary>
                      <p>
                        These changes take effect after building and deploying
                        the website source. Studio Preview uses the installed
                        release.
                      </p>
                      <ul>
                        {plan.sourceChanges.map((name) => (
                          <li key={name}>
                            <code>{name}</code>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
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
                  {busy ? 'Preparing downloads…' : 'Prepare two ZIPs'}
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
