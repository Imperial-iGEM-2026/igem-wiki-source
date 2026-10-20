'use client';
import { useCallback, useEffect, useState } from 'react';
import {
  Bot,
  Check,
  ChevronDown,
  Copy,
  Link2,
  Plus,
  Trash2,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { projectFetch } from './project-api';

type AiLink = {
  id: string;
  mode: 'standard' | 'developer';
  page: string | null;
  name: string;
  createdBy: string;
  createdAt: number;
  expiresAt: number;
  lastUsedAt: number | null;
  mine: boolean;
  canCopy: boolean;
};
// Setup steps refer to the link; Claude Code also gets a ready command.
const clients: {
  id: string;
  label: string;
  steps: string[];
  command?: (url: string) => string;
}[] = [
  {
    id: 'claude',
    label: 'Claude',
    steps: [
      'Open Settings → Connectors → Add custom connector.',
      'Paste the link as the server URL. No sign-in is needed.',
      'In a chat, turn the connector on and ask Claude to edit the wiki.',
    ],
  },
  {
    id: 'chatgpt',
    label: 'ChatGPT',
    steps: [
      'In connector settings, turn on Developer mode (under Advanced).',
      'Create a connector with the link as its MCP server URL and no authentication.',
      'Select the connector in a chat and ask for the edit.',
    ],
  },
  {
    id: 'code',
    label: 'Claude Code',
    steps: ['Run this in a terminal, then ask Claude Code to edit the wiki.'],
    command: (url) => `claude mcp add --transport http prion-wiki "${url}"`,
  },
  {
    id: 'other',
    label: 'Other',
    steps: [
      'Add the link as a Streamable HTTP MCP server. No other authentication is required.',
    ],
  },
];
const expiries = [
  [1, '1 day'],
  [7, '7 days'],
  [30, '30 days'],
] as const;
const when = (time: number) =>
  new Date(time).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
  });

/** Create, copy and revoke MCP links that let an external AI edit this project. */
export function AiLinkDialog({
  open,
  onOpenChange,
  page,
  pageTitle,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  page: string;
  pageTitle: string;
}) {
  const [links, setLinks] = useState<AiLink[] | null>(null);
  const [view, setView] = useState<'mine' | 'team'>('mine');
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('Claude');
  const [scope, setScope] = useState<'project' | 'page'>('project');
  const [days, setDays] = useState(7);
  const [mode, setMode] = useState<'standard' | 'developer'>('standard');
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [fresh, setFresh] = useState<string | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [client, setClient] = useState('claude');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');
  const [revoking, setRevoking] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      const response = await projectFetch('/api/mcp-links', {
        cache: 'no-store',
      });
      const result = (await response.json()) as {
        links?: AiLink[];
        error?: string;
      };
      if (!response.ok) throw Error(result.error);
      setLinks(result.links || []);
    } catch (e) {
      setError(
        e instanceof Error && e.message
          ? e.message
          : 'Could not load AI links.',
      );
    }
  }, []);
  useEffect(() => {
    if (open) void load();
  }, [open, load]);
  useEffect(() => { setConfirmation(null); }, [mode, name, scope, days]);
  // Closing forgets revealed links and resets the dialog.
  function close(next: boolean) {
    if (!next) {
      setUrls({});
      setExpanded(null);
      setFresh(null);
      setCreating(false);
      setError('');
      setRevoking(null);
      setView('mine');
      setLinks(null);
      setMode('standard');
      setConfirmation(null);
    }
    onOpenChange(next);
  }
  async function post<T>(body: object): Promise<T | null> {
    setBusy(true);
    setError('');
    try {
      const response = await projectFetch('/api/mcp-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = (await response.json()) as T & { error?: string };
      if (!response.ok) throw Error(result.error);
      return result;
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'Request failed.');
      return null;
    } finally {
      setBusy(false);
    }
  }
  async function urlFor(link: AiLink) {
    if (urls[link.id]) return urls[link.id];
    const result = await post<{ url: string }>({
      action: 'reveal',
      id: link.id,
    });
    if (result) setUrls((all) => ({ ...all, [link.id]: result.url }));
    return result?.url;
  }
  async function copy(key: string, text: string | undefined) {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(
        () => setCopied((current) => (current === key ? '' : current)),
        1600,
      );
    } catch {
      setError('Copy failed. Open the setup steps and copy the link there.');
    }
  }
  const mine = (links || []).filter((l) => l.mine);
  const showForm = creating || (links !== null && !mine.length);
  const guide = clients.find((c) => c.id === client)!;
  const revokeControls = (link: AiLink) =>
    revoking === link.id ? (
      <span className="ai-connect-confirm">
        <button
          type="button"
          className="is-danger"
          disabled={busy}
          onClick={async () => {
            const result = await post<{ links: AiLink[] }>({
              action: 'revoke',
              id: link.id,
            });
            if (result) setLinks(result.links);
            setRevoking(null);
          }}
        >
          Revoke
        </button>
        <button type="button" onClick={() => setRevoking(null)}>
          Keep
        </button>
      </span>
    ) : (
      <button
        type="button"
        className="ai-connect-icon-button is-danger"
        title="Revoke: the link stops working immediately"
        aria-label={'Revoke ' + link.name}
        onClick={() => setRevoking(link.id)}
      >
        <Trash2 size={15} />
      </button>
    );
  const meta = (link: AiLink, withOwner = false) =>
    [
      withOwner ? (link.mine ? 'You' : link.createdBy) : null,
      link.mode === 'developer' ? 'Developer · source read/write' : 'Standard',
      link.page ? 'Page: ' + link.page : 'Whole project',
      'expires ' + when(link.expiresAt),
      link.lastUsedAt ? 'last used ' + when(link.lastUsedAt) : 'not used yet',
    ]
      .filter(Boolean)
      .join(' · ');
  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="ai-connect gap-0 p-0 sm:max-w-[560px]">
        <header className="ai-connect-head">
          <span className="ai-connect-icon" aria-hidden="true">
            <Bot size={20} />
          </span>
          <div>
            <DialogTitle>Connect an AI</DialogTitle>
            <DialogDescription>
              Give Claude, ChatGPT or another MCP app a private link to edit
              this wiki and upload images or files. Page edits appear live for everyone.
            </DialogDescription>
          </div>
        </header>
        <div className="ai-connect-toolbar">
          <div className="ai-connect-view" role="tablist" aria-label="Links">
            <button
              type="button"
              role="tab"
              aria-selected={view === 'mine'}
              onClick={() => setView('mine')}
            >
              Your links <span>{mine.length}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === 'team'}
              onClick={() => setView('team')}
            >
              Team <span>{links?.length ?? 0}</span>
            </button>
          </div>
          {view === 'mine' && !showForm && (
            <button
              type="button"
              className="ai-connect-new"
              onClick={() => {
                setCreating(true);
                setFresh(null);
              }}
            >
              <Plus size={15} /> New link
            </button>
          )}
        </div>
        <div className="ai-connect-body">
          {view === 'mine' ? (
            <>
              {showForm && (
                <form
                  className="ai-connect-form"
                  onSubmit={async (event) => {
                    event.preventDefault();
                    if (mode === 'developer' && !confirmation) {
                      const grant = await post<{ confirmation: string }>({ action: 'prepare-developer' });
                      if (grant) setConfirmation(grant.confirmation);
                      return;
                    }
                    const result = await post<{ url: string; link: AiLink }>({
                      action: 'create',
                      name,
                      days,
                      page: mode === 'standard' && scope === 'page' ? page : null,
                      mode,
                      ...(mode === 'developer' ? { confirmation, confirmDeveloper: true } : {}),
                    });
                    if (!result) return;
                    setUrls((all) => ({
                      ...all,
                      [result.link.id]: result.url,
                    }));
                    setLinks((all) => [result.link, ...(all || [])]);
                    setExpanded(result.link.id);
                    setFresh(result.link.id);
                    setCreating(false);
                    setConfirmation(null);
                    setMode('standard');
                    void load();
                  }}
                >
                  {!confirmation && <>
                  <div className="ai-connect-field">
                    <span id="ai-connect-mode">Access level</span>
                    <div className="ai-connect-segments" role="radiogroup" aria-labelledby="ai-connect-mode">
                      {(['standard', 'developer'] as const).map(value => (
                        <label key={value}>
                          <input type="radio" name="ai-connect-mode" checked={mode === value} onChange={() => setMode(value)} />
                          <span>{value === 'standard' ? 'Standard' : 'Developer'}</span>
                        </label>
                      ))}
                    </div>
                    <small>{mode === 'standard'
                      ? 'Edit pages, styling and media with the usual editor checks.'
                      : 'Read and edit this wiki’s source for developer preview and export. Requires your confirmation.'}</small>
                  </div>
                  <label className="ai-connect-field">
                    <span>Name</span>
                    <input
                      value={name}
                      maxLength={60}
                      required
                      onChange={(e) => setName(e.target.value)}
                    />
                    <small>Shown to teammates while the AI is editing.</small>
                  </label>
                  {mode === 'standard' && <div className="ai-connect-field">
                    <span id="ai-connect-scope">Can edit</span>
                    <div
                      className="ai-connect-segments"
                      role="radiogroup"
                      aria-labelledby="ai-connect-scope"
                    >
                      {(
                        [
                          ['project', 'Whole project'],
                          ['page', 'Only “' + pageTitle + '”'],
                        ] as const
                      ).map(([value, label]) => (
                        <label key={value}>
                          <input
                            type="radio"
                            name="ai-connect-scope"
                            checked={scope === value}
                            onChange={() => setScope(value)}
                          />
                          <span>{label}</span>
                        </label>
                      ))}
                    </div>
                  </div>}
                  <div className="ai-connect-field">
                    <span id="ai-connect-expiry">Expires after</span>
                    <div
                      className="ai-connect-segments"
                      role="radiogroup"
                      aria-labelledby="ai-connect-expiry"
                    >
                      {expiries.map(([value, label]) => (
                        <label key={value}>
                          <input
                            type="radio"
                            name="ai-connect-expiry"
                            checked={days === value}
                            onChange={() => setDays(value)}
                          />
                          <span>{label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  </>}
                  {mode === 'developer' && confirmation && (
                    <section className="ai-connect-developer" aria-label="Developer permissions" aria-live="polite">
                      <strong>{confirmation ? 'Confirm developer access' : 'Project source access'}</strong>
                      <p>This link can edit all pages and read and change this wiki’s template/component source. Anyone holding the link has these permissions until it expires or you revoke it.</p>
                      <p>Source edits are saved per project with rollback history and included in the next website-source ZIP. Use Preview → Developer source to check them before exporting. Design and Installed version keep using the installed release.</p>
                      <p>Server files, credentials, build scripts and dependencies cannot be changed. Revoking a link stops access; saved edits remain.</p>
                      {confirmation && <p><b>Allow “{name}” developer access for {days} {days === 1 ? 'day' : 'days'}?</b></p>}
                    </section>
                  )}
                  <div className="ai-connect-actions">
                    {confirmation && <button type="button" disabled={busy} onClick={() => setConfirmation(null)}>Back</button>}
                    {mine.length > 0 && (
                      <button type="button" onClick={() => setCreating(false)}>
                        Cancel
                      </button>
                    )}
                    <button
                      className="ai-connect-primary"
                      disabled={busy || !name.trim()}
                    >
                      <Link2 size={16} />
                      {busy ? 'Working…' : mode === 'developer' ? (confirmation ? 'Confirm & create developer link' : 'Review developer access') : 'Create link'}
                    </button>
                  </div>
                </form>
              )}
              {mine.length > 0 && (
                <ul className="ai-connect-list">
                  {mine.map((link) => {
                    const url = urls[link.id];
                    const isOpen = expanded === link.id;
                    const command = url && guide.command?.(url);
                    return (
                      <li
                        key={link.id}
                        className={
                          (isOpen ? 'is-open' : '') +
                          (fresh === link.id ? ' is-fresh' : '')
                        }
                      >
                        <div className="ai-connect-row">
                          <span
                            className="ai-connect-avatar"
                            aria-hidden="true"
                          >
                            {link.name.slice(0, 1).toUpperCase()}
                          </span>
                          <div className="ai-connect-row-text">
                            <strong>
                              {link.name}
                              {fresh === link.id && <em>New</em>}
                            </strong>
                            <small>{meta(link)}</small>
                          </div>
                          {link.canCopy ? (
                            <>
                              <button
                                type="button"
                                className="ai-connect-copy"
                                disabled={busy}
                                onClick={async () =>
                                  copy(link.id, await urlFor(link))
                                }
                              >
                                {copied === link.id ? (
                                  <Check size={14} />
                                ) : (
                                  <Copy size={14} />
                                )}
                                {copied === link.id ? 'Copied' : 'Copy link'}
                              </button>
                              <button
                                type="button"
                                className="ai-connect-icon-button ai-connect-toggle"
                                aria-expanded={isOpen}
                                aria-label={'Setup steps for ' + link.name}
                                title="Setup steps"
                                onClick={async () => {
                                  setExpanded(isOpen ? null : link.id);
                                  if (!isOpen) await urlFor(link);
                                }}
                              >
                                <ChevronDown size={16} />
                              </button>
                            </>
                          ) : (
                            <span
                              className="ai-connect-note"
                              title="Links created before this update cannot be shown again. Create a new link."
                            >
                              Can’t copy
                            </span>
                          )}
                          {revokeControls(link)}
                        </div>
                        {isOpen && url && (
                          <div className="ai-connect-guide">
                            <div className="ai-connect-url">
                              <input
                                readOnly
                                aria-label={link.name + ' link'}
                                value={url}
                                onFocus={(e) => e.currentTarget.select()}
                              />
                            </div>
                            <div className="ai-connect-tabs" role="tablist">
                              {clients.map((c) => (
                                <button
                                  key={c.id}
                                  type="button"
                                  role="tab"
                                  aria-selected={client === c.id}
                                  onClick={() => setClient(c.id)}
                                >
                                  {c.label}
                                </button>
                              ))}
                            </div>
                            <ol className="ai-connect-steps">
                              {guide.steps.map((step) => (
                                <li key={step}>{step}</li>
                              ))}
                            </ol>
                            {command && (
                              <div className="ai-connect-url is-command">
                                <input
                                  readOnly
                                  aria-label="Terminal command"
                                  value={command}
                                  onFocus={(e) => e.currentTarget.select()}
                                />
                                <button
                                  type="button"
                                  className="ai-connect-copy"
                                  onClick={() =>
                                    void copy('cmd-' + link.id, command)
                                  }
                                >
                                  {copied === 'cmd-' + link.id ? (
                                    <Check size={14} />
                                  ) : (
                                    <Copy size={14} />
                                  )}
                                  {copied === 'cmd-' + link.id
                                    ? 'Copied'
                                    : 'Copy'}
                                </button>
                              </div>
                            )}
                            <p className="ai-connect-meta">
                              Anyone with this link can edit{' '}
                              {link.page ? 'that page' : 'the whole project'}{' '}
                              until {when(link.expiresAt)}. Revoke it when you
                              are done.
                            </p>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
              {links === null && <p className="ai-connect-empty">Loading…</p>}
            </>
          ) : (
            <>
              <p className="ai-connect-hint">
                Every active link in this project. Only the person who created a
                link can copy it; anyone can revoke a link they do not trust.
              </p>
              {links && links.length ? (
                <ul className="ai-connect-list">
                  {links.map((link) => (
                    <li key={link.id}>
                      <div className="ai-connect-row">
                        <span
                          className={
                            'ai-connect-avatar' + (link.mine ? '' : ' is-other')
                          }
                          aria-hidden="true"
                        >
                          {link.name.slice(0, 1).toUpperCase()}
                        </span>
                        <div className="ai-connect-row-text">
                          <strong>{link.name}</strong>
                          <small>{meta(link, true)}</small>
                        </div>
                        {revokeControls(link)}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="ai-connect-empty">
                  No active links in this project.
                </p>
              )}
            </>
          )}
          {error && (
            <p className="ai-connect-error" role="alert">
              {error}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
