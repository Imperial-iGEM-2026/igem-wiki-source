'use client';

import { startWebsiteSearch } from './site-search';
import { defaultLoading, startSiteLoading } from './site-loading';
import { parseHeader } from './header-schema';
import { startReferenceNavigation } from './reference-navigation';
import { siteIcon } from '../scripts/export-media.mjs';
import { MathText } from './equation-block';
import { TextEditDialog } from './text-edit-dialog';
import { mergeContentRows, coalesceRefresh } from './content-sync';
import { ImportedPage } from './template-renderer';
import { templateFor } from './templates';
import { projectFetch, projectURL } from './project-api';
import { SiteHeader } from './site-header';
import { useLiveChannel } from './live-sync';
import { useState, useEffect, useMemo, useRef } from 'react';
import {
  ArrowUpRight,
  ArrowRight,
  Network,
  MoveUpRight,
  Pencil,
  ArrowLeft,
  Users,
  BookOpen,
  Microscope,
  Fingerprint,
  Activity,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import type { Blocks, Field } from './content';
import { ExportPanel } from './export-panel';
import { CanvasContext, PageCanvas } from './page-canvas';
import { pageCatalog } from './custom-pages';
import { type WikiPage } from './wiki-data';
import { WikiDirectory, WikiArticle, WikiFooter } from './wiki-components';

type User = { name: string; id: string };
const topics = [
  {
    id: '1',
    label: 'FOUNDATIONS',
    icon: BookOpen,
    detail:
      'Prions are infectious, misfolded proteins. Unlike bacteria or viruses, they do not require their own nucleic acid to propagate. Their shape is central to how they behave.',
    source: 'https://www.cdc.gov/prions/about/index.html',
  },
  {
    id: '2',
    label: 'MOLECULAR BIOLOGY',
    icon: Network,
    detail:
      'Disease-associated prion protein can promote the misfolding of normal prion protein. This conversion and the assembly of protein aggregates are central questions in prion biology.',
    source: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC9071098/',
  },
  {
    id: '3',
    label: 'RESEARCH & MEDICINE',
    icon: Microscope,
    detail:
      'Prion diseases affect the brain and nervous system. Research explores how these proteins cause damage and how interventions might reduce the supply of prion protein.',
    source:
      'https://www.nih.gov/news-events/nih-research-matters/developing-treatments-prion-diseases',
  },
];
export default function Home({
  user,
  projectId,
  wiki: initialWiki,
  publication = false,
  startEditing = false,
  initialData,
  login = {
    provider: 'ChatGPT',
    signIn: '/auth/login',
    signOut: '/auth/logout',
  },
}: {
  user: User | null;
  projectId?: string;
  wiki?: WikiPage;
  publication?: boolean;
  startEditing?: boolean;
  initialData: Blocks;
  login?: { provider: string; signIn: string; signOut: string };
}) {
  const allowUnload = useRef(false);
  const [selectedWiki, setWiki] = useState(initialWiki);
  const [data, setData] = useState<Blocks>(initialData),
    [editing, setEditing] = useState(
      Boolean(startEditing && user && !publication),
    ),
    [active, setActive] = useState<Field | null>(null),
    [draft, setDraft] = useState(''),
    [base, setBase] = useState(0),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [connected, setConnected] = useState(Boolean(projectId)),
    [people, setPeople] = useState<User[]>([]),
    [modal, setModal] = useState<string | null>(null),
    [saved, setSaved] = useState(''),
    [structuralDirty, setStructuralDirty] = useState(false);
  // Page existence comes from the server's page registry, not from whether
  // its layout loaded successfully. Resolve deletion before mounting a canvas:
  // the deleted page's editor may never mount to perform its own redirect.
  const wiki = selectedWiki
    ? pageCatalog(data).find((page) => page.slug === selectedWiki.slug)
    : undefined;
  const deletedPage = selectedWiki && !wiki ? selectedWiki.slug : undefined;
  const loadingHeader = data['site:header']?.value;
  useEffect(() => {
    if (editing) return;
    const loading = parseHeader(loadingHeader).loading;
    // Preview has a separate namespace so it never consumes a visitor's session.
    return startSiteLoading({ ...defaultLoading, ...loading },
      (publication ? 'preview:' : 'project:') + (projectId || 'default'));
  }, [editing, loadingHeader, publication, projectId, wiki?.slug]);
  useEffect(() => {
    if (editing) return;
    return startWebsiteSearch(async () => {
      const response = await projectFetch('/api/search-index' + (projectId ? '?project=' + encodeURIComponent(projectId) : ''), { credentials: 'same-origin' });
      if (!response.ok) throw Error('Search unavailable');
      return response.json();
    }, '/', document.body, (url) => projectURL(url, false));
  }, [editing, projectId]);
  const tabIcon = siteIcon({
    'site:header': data['site:header']?.value,
    'site:template': data['site:template']?.value,
  });
  useEffect(() => {
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.removeAttribute('type');
    link.href = tabIcon;
  }, [tabIcon]);
  useEffect(() => {
    if (!deletedPage) return;
    setWiki(undefined);
    setActive(null);
    setDraft('');
    setStructuralDirty(false);
    setError('');
    if (!publication)
      window.history.replaceState(null, '', projectURL('/', editing));
  }, [deletedPage, publication, editing]);
  useEffect(() => {
    if (publication) setData(initialData);
  }, [publication, initialData]);
  const sync = useMemo(
    () =>
      coalesceRefresh(async () => {
        try {
          const r = await projectFetch('/api/content', { cache: 'no-store' });
          if (!r.ok) throw Error();
          const v = (await r.json()) as {
            rows: ({ id: Field } & Blocks[Field])[];
            people: User[];
          };
          setData((previous) => mergeContentRows(previous, v.rows));
          setPeople((previous) =>
            JSON.stringify(previous) === JSON.stringify(v.people)
              ? previous
              : v.people,
          );
          setConnected(true);
        } catch {
          setConnected(false);
        }
      }),
    [],
  );
  const live = useLiveChannel({
    enabled: Boolean(editing && user && !publication),
    projectId,
    page: wiki?.slug || 'home',
    onRevision: sync,
  });
  useEffect(() => {
    if (publication) return;
    if (!projectId) void sync();
    // Polling is the fallback; the live channel announces saves immediately.
    const refreshVisible = () => {
      if (document.visibilityState !== 'hidden') void sync();
    };
    const t = setInterval(refreshVisible, live.connected ? 15000 : 2500);
    document.addEventListener('visibilitychange', refreshVisible);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', refreshVisible);
    };
  }, [sync, publication, projectId, live.connected]);
  useEffect(() => {
    if (!editing || !user) return;
    const pulse = () => {
      if (document.visibilityState === 'hidden') return;
      void projectFetch('/api/content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ presence: true }),
      }).catch(() => {});
    };
    pulse();
    const t = setInterval(pulse, 7000);
    document.addEventListener('visibilitychange', pulse);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', pulse);
    };
  }, [editing, user]);
  async function save(
    id: Field,
    value: string,
    version: number,
    { quiet = false }: { quiet?: boolean } = {},
  ) {
    // Quiet saves are live-sync autosaves: they must not lock the editor or
    // close an open text field, and a lost race is retried after merging.
    if (!quiet) {
      setBusy(true);
      setError('');
    }
    try {
      const r = await projectFetch('/api/content', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Prion-Client': live.clientId,
        },
        body: JSON.stringify({ id, value, version }),
      });
      const result = (await r.json()) as Blocks[Field] & { error?: string };
      if (!r.ok) {
        if (r.status === 409) await sync();
        throw Error(result.error);
      }
      setData((p) => ({ ...p, [id]: result }));
      if (!quiet) {
        setActive(null);
        setSaved('Changes saved');
      }
      return true;
    } catch (e) {
      if (!quiet) setError(e instanceof Error ? e.message : 'Could not save.');
      return false;
    } finally {
      if (!quiet) setBusy(false);
    }
  }
  async function pageAction(action: 'delete' | 'restore', slug: string) {
    const response = await projectFetch('/api/pages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Prion-Client': live.clientId,
      },
      body: JSON.stringify({ action, slug }),
    });
    const result = (await response.json()) as {
      rows: ({ id: string } & Blocks[string])[];
      error?: string;
    };
    if (!response.ok)
      throw Error(result.error || 'Could not ' + action + ' the page.');
    setData((previous) => {
      const next = { ...previous };
      // Discarded template edits come back as their template defaults.
      for (const row of result.rows)
        if (row.version || row.value) next[row.id] = row;
        else delete next[row.id];
      return next;
    });
  }
  useEffect(() => startReferenceNavigation(), []);
  function begin(id: Field) {
    if (active && draft !== data[active].value) {
      setError('Save or cancel your current edit first.');
      return;
    }
    if (!data[id]) return;
    setActive(id);
    setDraft(data[id].value);
    setBase(data[id].version);
    setError('');
    setSaved('');
  }
  function field(id: Field) {
    return (
      <span
        data-field-id={id}
        className={editing ? 'editable' : ''}
        tabIndex={editing ? 0 : undefined}
        role={editing ? 'button' : undefined}
        title={editing ? 'Double-click to edit text' : undefined}
        onClick={(e) => {
          if (
            (e.target as Element).closest(
              '[data-citation-link],.modern-pdf-reader',
            )
          )
            return;
          if (!editing) return;
          e.preventDefault();
          e.stopPropagation();
          begin(id);
        }}
        onKeyDown={(e) => {
          if (editing && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            e.stopPropagation();
            begin(id);
          }
        }}
      >
        <MathText text={active === id ? draft : data[id].value} />
        {editing && !id.startsWith('template:') && (
          <Pencil className="edit-indicator" size={14} />
        )}
      </span>
    );
  }
  function edit() {
    if (!user) {
      setModal('signin');
      return;
    }
    if (editing && (active || structuralDirty)) {
      setError('Save or cancel your current edit before leaving edit mode.');
      return;
    }
    setEditing(!editing);
    if (projectId)
      window.history.replaceState(
        null,
        '',
        projectURL(
          location.pathname + location.search + location.hash,
          !editing,
        ),
      );
  }
  useEffect(() => {
    if (!active) return;
    const guard = (event: BeforeUnloadEvent) => {
      if (allowUnload.current) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [active]);
  useEffect(() => {
    if (publication || editing) return;
    const navigateBack = () => {
      const slug = location.pathname.replace(/^\/+|\/+$/g, '') || 'home';
      setWiki(pageCatalog(data).find((p) => p.slug === slug));
    };
    window.addEventListener('popstate', navigateBack);
    return () => window.removeEventListener('popstate', navigateBack);
  }, [publication, editing, data]);
  useEffect(() => {
    if (editing) return;
    const frame = requestAnimationFrame(() => {
      if (location.hash) {
        try {
          document
            .getElementById(decodeURIComponent(location.hash.slice(1)))
            ?.scrollIntoView();
        } catch {}
      } else window.scrollTo(0, 0);
    });
    return () => cancelAnimationFrame(frame);
  }, [wiki?.slug, editing]);
  const template = templateFor(data);
  const selected = topics.find((t) => t.id === modal);
  return (
    <CanvasContext.Provider
      value={{
        data,
        projectId,
        userId: user?.id,
        switchProject: (id) => {
          allowUnload.current = true;
          window.location.assign(
            '/?studio=1&project=' + encodeURIComponent(id),
          );
        },
        openWorkspace: () => {
          allowUnload.current = true;
          window.location.assign('/workspace');
        },
        publication,
        editing,
        busy,
        locked: Boolean(active),
        beginText: begin,
        save,
        dirty: setStructuralDirty,
        exit: edit,
        navigate: (slug, resolved = false) => {
          if (!resolved && (active || structuralDirty || busy)) return;
          const next = pageCatalog(data).find((p) => p.slug === slug);
          if (slug !== 'home' && !next) return;
          setWiki(next);
          setError('');
          window.history.replaceState(
            null,
            '',
            projectURL(slug === 'home' ? '/' : '/' + slug),
          );
        },
        resolveText: async (keep) => {
          if (!active) return true;
          if (keep) return save(active, draft, base);
          setActive(null);
          setDraft('');
          return true;
        },
        deletePage: (slug) => pageAction('delete', slug),
        restorePage: (slug) => pageAction('restore', slug),
        createPage: async (title, slug, source) => {
          const response = await projectFetch('/api/pages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title,
              slug,
              source,
              ...(source
                ? { sourceVersion: data['layout:' + source]?.version || 0 }
                : {}),
            }),
          });
          const result = (await response.json()) as {
            page: WikiPage;
            rows: ({ id: string } & Blocks[string])[];
            error?: string;
          };
          if (!response.ok)
            throw Error(result.error || 'Could not create page.');
          setData((previous) => ({
            ...previous,
            ...Object.fromEntries(result.rows.map((row) => [row.id, row])),
          }));
          setStructuralDirty(false);
          setActive(null);
          setWiki(result.page);
          setError('');
          window.history.replaceState(
            null,
            '',
            projectURL('/' + result.page.slug),
          );
        },
        people,
        peers: live.peers,
        live: live.connected,
        setSelection: live.setSelection,
        error,
      }}
    >
      <div
        onClickCapture={(e) => {
          const link = (e.target as HTMLElement).closest?.('a');
          if (
            link?.hasAttribute('data-citation-link') ||
            (e.target as Element).closest('.modern-pdf-reader')
          )
            return;
          if (
            !publication &&
            !editing &&
            projectId &&
            link &&
            !link.hasAttribute('download') &&
            !e.metaKey &&
            !e.ctrlKey &&
            !e.shiftKey &&
            !e.altKey &&
            e.button === 0 &&
            link.target !== '_blank'
          ) {
            const href = link.getAttribute('href');
            const route = href?.split(/[?#]/)[0];
            if (
              href &&
              (route === '/' ||
                pageCatalog(data).some((p) => '/' + p.slug === route))
            ) {
              e.preventDefault();
              window.history.pushState(null, '', projectURL(href, false));
              const slug = route?.replace(/^\/+|\/+$/g, '') || 'home';
              setWiki(pageCatalog(data).find((p) => p.slug === slug));
              if (slug === (wiki?.slug || 'home')) {
                if (href.includes('#')) {
                  try {
                    document
                      .getElementById(decodeURIComponent(href.split('#')[1]))
                      ?.scrollIntoView();
                  } catch {}
                } else window.scrollTo(0, 0);
              }
            }
          }
          if (
            editing &&
            (e.target as HTMLElement).closest?.('.editable') &&
            link
          )
            e.preventDefault();
          if (
            (active || structuralDirty) &&
            link &&
            link.target !== '_blank' &&
            !link.getAttribute('href')?.startsWith('#')
          ) {
            e.preventDefault();
            setError('Save or cancel your current edit before changing pages.');
          }
        }}
      >
        {template ? (
          <>
            {!publication && (
              <div className="template-workspace-bar">
                <a href="/workspace">← All projects</a>
                <span>{template.name}</span>
                <ExportPanel
                  disabled={Boolean(active) || structuralDirty || busy}
                />
                <button onClick={edit}>
                  {editing ? 'Finish editing' : 'Edit website'}
                </button>
              </div>
            )}
            <ImportedPage
              data={data}
              page={wiki?.slug || 'home'}
              field={field}
            />
          </>
        ) : (
          <>
            <a className="skip-link" href="#main-content">
              Skip to content
            </a>
            <SiteHeader data={data} wiki={wiki} publication={publication}>
              {!publication && (
                <div className="account">
                  {user && (
                    <ExportPanel
                      disabled={Boolean(active) || structuralDirty || busy}
                    />
                  )}
                  {user ? (
                    <button
                      onClick={() => setModal('account')}
                      className="account-name"
                    >
                      <span className="avatar">
                        {user.name.slice(0, 1).toUpperCase()}
                      </span>
                      My account
                    </button>
                  ) : (
                    <button onClick={() => setModal('signin')}>Sign in</button>
                  )}
                  <button className="dark-button" onClick={edit}>
                    <Pencil size={14} />
                    {editing ? 'Finish editing' : 'Edit this page'}
                  </button>
                </div>
              )}
            </SiteHeader>
            {editing && (
              <aside className="editing-bar">
                <div>
                  <span className="live-dot" />
                  <strong>Visual editor</strong>
                  <span>Edit text · Move sections · Add media below</span>
                </div>
                <div>
                  <Users size={16} />
                  {people.length} editing<span>{saved}</span>
                </div>
              </aside>
            )}
            {error && (
              <div className="error" role="alert">
                {error}
              </div>
            )}
            <main id="main-content">
              {wiki ? (
                <WikiArticle
                  page={wiki}
                  field={field}
                  data={data}
                  editing={editing}
                />
              ) : (
                <PageCanvas page="home">
                  <section
                    className="intro"
                    id="explore"
                    data-label="Page introduction"
                  >
                    <div className="eyebrow">
                      <span className="tiny-cross">✳</span>{' '}
                      {field('home:eyebrow')}
                    </div>
                    <div className="intro-grid">
                      <h1>{field('headline')}</h1>
                      <div className="intro-right">
                        <p>{field('intro')}</p>
                        <a className="text-link" href="/description">
                          Explore our project <ArrowRight size={18} />
                        </a>
                      </div>
                    </div>
                  </section>
                  <section className="feature" data-label="Molecular hero">
                    <img
                      src="/prion-hero.png"
                      alt="Artistic rendering of folded protein ribbons in lime green and ivory"
                    />
                    <div className="feature-top">
                      <span>
                        <span className="live-dot" /> UNDER THE MICROSCOPE
                      </span>
                      <span>01 / PRION BIOLOGY</span>
                    </div>
                    <div className="feature-copy">
                      <span className="pill">
                        A DIFFERENT KIND OF INFECTIOUS AGENT
                      </span>
                      <h2>{field('feature')}</h2>
                      <p>{field('featureBody')}</p>
                      {publication ? (
                        <a className="lime-button" href="#topic-1">
                          Meet the prion <ArrowUpRight size={18} />
                        </a>
                      ) : (
                        <button
                          className="lime-button"
                          onClick={() => setModal('1')}
                        >
                          Meet the prion <ArrowUpRight size={18} />
                        </button>
                      )}
                    </div>
                    <div className="image-note">
                      <span className="crosshair">+</span> PROTEIN CONFORMATION
                      <span>Conceptual visualization</span>
                    </div>
                    <div className="feature-bottom">
                      <span>One molecule. A world of possibilities.</span>
                      <span>SCROLL TO DISCOVER ↓</span>
                    </div>
                  </section>
                  <div
                    className="collab-strip"
                    data-label="Collaboration banner"
                  >
                    <div className="strip-icon">
                      <Users size={20} />
                    </div>
                    <p>
                      Science moves forward <strong>together.</strong>
                      <span>
                        This page is a shared canvas. Add your perspective.
                      </span>
                    </p>
                    <div className="live-status">
                      <span
                        className={connected ? 'live-dot' : 'offline-dot'}
                      />
                      {connected ? 'Shared workspace' : 'Connecting workspace'}
                      {people.length > 0 && ` · ${people.length} editing`}
                    </div>
                    <button onClick={edit}>
                      Join the collaboration <ArrowUpRight size={16} />
                    </button>
                  </div>
                  <WikiDirectory field={field} data={data} />
                  <section className="knowledge" id="knowledge">
                    <div className="section-heading">
                      <div>
                        <div className="eyebrow">FOLLOW YOUR CURIOSITY</div>
                        <h2>{field('home:knowledge-title')}</h2>
                      </div>
                      <span className="section-note">
                        Three ways into prion science <ArrowDownSymbol />
                      </span>
                    </div>
                    <div className="topic-grid">
                      {data.order.value.split(',').map((id, index) => {
                        const t = topics.find((x) => x.id === id)!;
                        const Icon = t.icon;
                        return (
                          <article
                            className={'topic topic-' + id}
                            key={id}
                            id={'topic-' + id}
                          >
                            <div className="topic-top">
                              <Icon size={26} strokeWidth={1.4} />
                              <span>0{id}</span>
                            </div>
                            <div className="eyebrow">{t.label}</div>
                            <h3>{field(('title' + id) as Field)}</h3>
                            <p>{field(('body' + id) as Field)}</p>
                            {publication && <p>{t.detail}</p>}
                            <div className="topic-bottom">
                              {publication ? (
                                <a href={t.source}>
                                  Read scientific source{' '}
                                  <ArrowUpRight size={18} />
                                </a>
                              ) : (
                                <button onClick={() => setModal(id)}>
                                  Explore topic <ArrowUpRight size={18} />
                                </button>
                              )}
                              {editing && (
                                <span className="reorder">
                                  <button
                                    aria-label="Move topic left"
                                    disabled={busy || index === 0}
                                    onClick={() => {
                                      const a = data.order.value.split(',');
                                      [a[index - 1], a[index]] = [
                                        a[index],
                                        a[index - 1],
                                      ];
                                      save(
                                        'order',
                                        a.join(','),
                                        data.order.version,
                                      );
                                    }}
                                  >
                                    <ArrowLeft size={16} />
                                  </button>
                                  <button
                                    aria-label="Move topic right"
                                    disabled={busy || index === 2}
                                    onClick={() => {
                                      const a = data.order.value.split(',');
                                      [a[index + 1], a[index]] = [
                                        a[index],
                                        a[index + 1],
                                      ];
                                      save(
                                        'order',
                                        a.join(','),
                                        data.order.version,
                                      );
                                    }}
                                  >
                                    <ArrowRight size={16} />
                                  </button>
                                </span>
                              )}
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </section>
                  <section className="invitation">
                    <div>
                      <span className="eyebrow">
                        KNOWLEDGE IS NEVER FINISHED.
                      </span>
                      <h2>{field('home:invitation-title')}</h2>
                      <p>{field('home:invitation-body')}</p>
                    </div>
                    <button className="dark-button" onClick={edit}>
                      Contribute to this page <ArrowUpRight size={18} />
                    </button>
                  </section>
                </PageCanvas>
              )}
            </main>
            <WikiFooter field={field} />
            <Dialog
              open={modal !== null}
              onOpenChange={(o) => !o && setModal(null)}
            >
              <DialogContent className="site-dialog">
                <DialogTitle>
                  {selected
                    ? data[('title' + selected.id) as Field].value
                    : modal === 'account'
                      ? 'Your account'
                      : modal === 'community'
                        ? 'Better understanding, together.'
                        : 'Make room for your perspective.'}
                </DialogTitle>
                <DialogDescription>
                  {selected
                    ? 'PRION COLLECTIVE / KNOWLEDGE NOTES'
                    : modal === 'account'
                      ? 'Your individual identity in this shared space.'
                      : 'One shared page. Your own account.'}
                </DialogDescription>
                {selected ? (
                  <>
                    <p>{selected.detail}</p>
                    <a
                      className="dark-button"
                      href={selected.source}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Read the scientific source <ArrowUpRight size={16} />
                    </a>
                  </>
                ) : modal === 'account' ? (
                  <>
                    <p>
                      Signed in as <strong>{user?.name}</strong>.
                    </p>
                    <button
                      className="dark-button"
                      onClick={() => {
                        setModal(null);
                        edit();
                      }}
                    >
                      Open visual editor <Pencil size={16} />
                    </button>
                    <a href={login.signOut}>Sign out</a>
                  </>
                ) : (
                  <>
                    <div className="dialog-features">
                      <p>
                        <Pencil size={20} /> Edit text directly on the page.
                      </p>
                      <p>
                        <Users size={20} /> Work alongside other signed-in
                        contributors.
                      </p>
                      <p>
                        <Activity size={20} /> Shared changes refresh every few
                        seconds.
                      </p>
                      <p>
                        <Fingerprint size={20} /> Every saved section records
                        its contributor.
                      </p>
                    </div>
                    <p className="small">
                      Everyone granted access to this site can contribute. Sign
                      in with your own {login.provider} account to start
                      editing.
                    </p>
                    {user ? (
                      <button
                        className="dark-button"
                        onClick={() => {
                          setModal(null);
                          setEditing(true);
                        }}
                      >
                        Start editing <ArrowRight size={16} />
                      </button>
                    ) : (
                      <a className="dark-button" href={login.signIn}>
                        Continue with {login.provider} <ArrowRight size={16} />
                      </a>
                    )}
                  </>
                )}
              </DialogContent>
            </Dialog>
          </>
        )}
      </div>
      <TextEditDialog
        open={Boolean(active)}
        value={draft}
        onChange={setDraft}
        onSave={() => {
          if (active) void save(active, draft, base);
        }}
        onCancel={() => {
          setActive(null);
          setError('');
        }}
        busy={busy}
        error={error}
        maxLength={active?.startsWith('wiki:') ? 12000 : 2000}
        conflict={
          active && data[active].version !== base
            ? {
                latest: data[active].value,
                onRebase: () => setBase(data[active].version),
              }
            : undefined
        }
      />
    </CanvasContext.Provider>
  );
}
function ArrowDownSymbol() {
  return <MoveUpRight size={16} style={{ transform: 'rotate(90deg)' }} />;
}
