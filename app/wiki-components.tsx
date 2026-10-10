'use client';
import type { ReactNode } from 'react';
import {
  ArrowUpRight,
  ArrowRight,
  ChevronDown,
  BookOpen,
  FlaskConical,
  HeartHandshake,
  Users,
  ArrowLeft,
  FileText,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import {
  Table,
  TableHeader,
  TableHead,
  TableRow,
  TableBody,
  TableCell,
} from '@/components/ui/table';
import {
  wikiPages,
  wikiGroups,
  wikiKey,
  official,
  type WikiPage,
} from './wiki-data';
import type { Blocks, Field } from './content';
import { PageCanvas } from './page-canvas';
export function WikiNav({
  current,
  data,
  publication = false,
}: {
  publication?: boolean;
  current?: WikiPage;
  data: Blocks;
}) {
  if (publication)
    return (
      <nav className="static-nav" aria-label="Main navigation">
        <a href="/">Home</a>
        {wikiGroups.map((group) => (
          <details key={group}>
            <summary>{group}</summary>
            <div className="static-menu">
              {wikiPages
                .filter((p) => p.group === group)
                .map((p) => (
                  <a key={p.slug} href={'/' + p.slug}>
                    {data[p.slug + ':title']?.value || p.title}
                  </a>
                ))}
            </div>
          </details>
        ))}
        <a href="/judging">Judging</a>
      </nav>
    );
  return (
    <nav aria-label="Main navigation">
      <a className={!current ? 'nav-active' : ''} href="/">
        Home
      </a>
      {wikiGroups.map((group) => (
        <DropdownMenu key={group}>
          <DropdownMenuTrigger
            className={current?.group === group ? 'nav-active' : ''}
          >
            {group}
            <ChevronDown size={12} />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="wiki-menu" sideOffset={10}>
            {wikiPages
              .filter((p) => p.group === group)
              .map((p) => (
                <DropdownMenuItem
                  key={p.slug}
                  render={<a href={'/' + p.slug} />}
                >
                  {data[p.slug + ':title']?.value || p.title}
                  {p.status === 'Optional award' && (
                    <span className="menu-tag">Optional</span>
                  )}
                </DropdownMenuItem>
              ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ))}
      <a
        className={current?.slug === 'judging' ? 'nav-active' : ''}
        href="/judging"
      >
        Judging
      </a>
    </nav>
  );
}
const icons = [BookOpen, FlaskConical, HeartHandshake, Users];
export function WikiDirectory({
  field,
  data,
}: {
  field: (id: Field) => ReactNode;
  data: Blocks;
}) {
  return (
    <section className="wiki-directory" id="wiki">
      <div className="section-heading">
        <div>
          <div className="eyebrow">THE PROJECT, FROM EVERY ANGLE</div>
          <h2>{field('home:directory-title')}</h2>
        </div>
        <a className="text-link" href="/judging">
          A guide for judges <ArrowUpRight size={16} />
        </a>
      </div>
      <p className="directory-intro">{field('home:directory-intro')}</p>
      <div className="directory-grid">
        {wikiGroups.map((group, i) => {
          const Icon = icons[i];
          return (
            <div className="directory-card" key={group}>
              <div className="directory-heading">
                <Icon size={23} strokeWidth={1.5} />
                <h3>{group}</h3>
                <span>0{i + 1}</span>
              </div>
              {wikiPages
                .filter(
                  (p) => p.group === group && p.status !== 'Optional award',
                )
                .map((p) => (
                  <a key={p.slug} href={'/' + p.slug}>
                    {data[p.slug + ':title']?.value || p.title}
                    <ArrowUpRight size={14} />
                  </a>
                ))}
              {wikiPages.some(
                (p) => p.group === group && p.status === 'Optional award',
              ) && (
                <div className="optional-links">
                  <span>IF RELEVANT TO YOUR WORK</span>
                  {wikiPages
                    .filter(
                      (p) => p.group === group && p.status === 'Optional award',
                    )
                    .map((p) => (
                      <a key={p.slug} href={'/' + p.slug}>
                        {data[p.slug + ':title']?.value || p.title}
                        <ArrowUpRight size={13} />
                      </a>
                    ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
export function WikiArticle({
  page,
  field,
  data,
  editing,
}: {
  page: WikiPage;
  field: (id: Field) => ReactNode;
  data: Blocks;
  editing: boolean;
}) {
  const index = wikiPages.findIndex((p) => p.slug === page.slug);
  const next = wikiPages[(index + 1) % wikiPages.length];
  return (
    <>
      <section className="wiki-hero">
        <a className="breadcrumb" href="/">
          Home <span>/</span> {page.group}
        </a>
        <div className="wiki-title-line">
          <span className="eyebrow">PRION COLLECTIVE / iGEM WIKI</span>
          <span
            className={
              'page-type ' +
              (page.status === 'Medal documentation' ? 'medal-type' : '')
            }
          >
            {page.status}
          </span>
        </div>
        <h1>{field(page.slug + ':title')}</h1>
        <p>{field(page.slug + ':summary')}</p>
        <div className="draft-note">
          <span className="live-dot" />
          Team evidence in preparation<span className="draft-divider">·</span>
          2026 structure — year to confirm
        </div>
      </section>
      <div className="article-layout">
        <aside className="article-toc">
          <span className="eyebrow">ON THIS PAGE</span>
          {page.slug === 'judging' && <a href="#criteria">Requirements map</a>}
          {page.sections.map((s, i) => (
            <a key={s.id} href={'#' + s.id}>
              <span>{String(i + 1).padStart(2, '0')}</span>
              {s.title}
            </a>
          ))}
          {page.slug === 'judging' && (
            <a href="#award-pages">Optional award pages</a>
          )}
          <a href="#page-sources">Sources & related pages</a>
          <a className="toc-back" href="/#wiki">
            <ArrowLeft size={14} />
            All wiki sections
          </a>
        </aside>
        <article className="wiki-article">
          <PageCanvas page={page.slug}>
            {page.slug === 'judging' && <JudgingMap />}
            {page.slug === 'engineering' && (
              <div className="engineering-cycle" aria-label="Engineering cycle">
                <span>01 Design</span>
                <ArrowRight />
                <span>02 Build</span>
                <ArrowRight />
                <span>03 Test</span>
                <ArrowRight />
                <span>04 Learn</span>
              </div>
            )}
            {page.sections.map((s, i) => {
              const key = wikiKey(page.slug, s.id);
              const block = data[key];
              return (
                <section className="article-section" id={s.id} key={s.id}>
                  <div className="article-kicker">
                    <span>
                      {String(i + 1).padStart(2, '0')} / DOCUMENTATION
                    </span>
                    <span>
                      {block?.version ? 'Team draft' : 'Awaiting team content'}
                    </span>
                  </div>
                  <h2>{field(page.slug + ':heading:' + s.id)}</h2>
                  <div
                    className={
                      'article-content ' +
                      (!block?.version ? 'prompt-content' : '')
                    }
                  >
                    {field(key)}
                  </div>
                  {editing && block?.author && (
                    <p className="edit-credit">Last saved by {block.author}</p>
                  )}
                </section>
              );
            })}
            {page.slug === 'attributions' && (
              <div className="form-pending">
                <FileText size={28} />
                <div>
                  <h3>Official attribution form</h3>
                  <p>
                    Not connected yet. Supply your registered iGEM team ID to
                    display your team’s form here.
                  </p>
                  <a
                    href={official.attributions}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open iGEM’s attribution instructions{' '}
                    <ArrowUpRight size={14} />
                  </a>
                </div>
              </div>
            )}
            {page.slug === 'judging' && <AwardPages />}
            <section className="article-section" id="page-sources">
              <div className="eyebrow">KEEP THE EVIDENCE CONNECTED</div>
              <h2>Sources & related pages</h2>
              <div className="reference-links">
                {page.source && (
                  <a href={page.source} target="_blank" rel="noreferrer">
                    Official iGEM guidance <ArrowUpRight size={15} />
                  </a>
                )}
                {page.slug === 'references' && (
                  <>
                    <a
                      href="https://www.cdc.gov/prions/about/index.html"
                      target="_blank"
                      rel="noreferrer"
                    >
                      CDC — About prion diseases <ArrowUpRight size={15} />
                    </a>
                    <a
                      href="https://pmc.ncbi.nlm.nih.gov/articles/PMC9071098/"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Cellular and Molecular Mechanisms of Prion Disease{' '}
                      <ArrowUpRight size={15} />
                    </a>
                    <a
                      href="https://www.nih.gov/news-events/nih-research-matters/developing-treatments-prion-diseases"
                      target="_blank"
                      rel="noreferrer"
                    >
                      NIH — Developing treatments for prion diseases{' '}
                      <ArrowUpRight size={15} />
                    </a>
                  </>
                )}
                {page.slug !== 'references' && (
                  <a href="/references">
                    Scientific references & asset credits{' '}
                    <ArrowRight size={15} />
                  </a>
                )}
                {page.slug !== 'judging' && (
                  <a href="/judging">
                    Judging requirements & submission guide{' '}
                    <ArrowRight size={15} />
                  </a>
                )}
                {page.slug === 'judging' && (
                  <>
                    <a href={official.wiki} target="_blank" rel="noreferrer">
                      Official team wiki requirements <ArrowUpRight size={15} />
                    </a>
                    <a
                      href={official.calendar}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Competition calendar & deadlines{' '}
                      <ArrowUpRight size={15} />
                    </a>
                  </>
                )}
              </div>
            </section>
            <a className="next-page" href={'/' + next.slug}>
              <span>
                <small>CONTINUE EXPLORING</small>
                {next.title}
              </span>
              <ArrowRight size={24} />
            </a>
          </PageCanvas>
        </article>
      </div>
    </>
  );
}
function JudgingMap() {
  return (
    <section className="judging-map" id="criteria">
      <span className="eyebrow">2026 REQUIREMENTS / PROVISIONAL YEAR</span>
      <h2>Find the evidence.</h2>
      <p className="map-intro">
        Required documentation and optional awards are different. All criteria
        at lower medal levels must also be met.
      </p>
      <Table className="requirements-table">
        <TableHeader>
          <TableRow>
            <TableHead>Level</TableHead>
            <TableHead>Documentation</TableHead>
            <TableHead>Where to find it</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>
              <span className="medal-label">Bronze</span>
            </TableCell>
            <TableCell>Competition deliverables</TableCell>
            <TableCell>
              Wiki, Safety Forms, Judging Form, Presentation Video, Judging
              Session
            </TableCell>
          </TableRow>
          <TableRow>
            <TableCell>Bronze</TableCell>
            <TableCell>Project attributions</TableCell>
            <TableCell>
              <a href="/attributions">Official form on /attributions ↗</a>
            </TableCell>
          </TableRow>
          <TableRow>
            <TableCell>Bronze</TableCell>
            <TableCell>Contribution</TableCell>
            <TableCell>
              <a href="/contribution">/contribution ↗</a>
            </TableCell>
          </TableRow>
          <TableRow>
            <TableCell>Silver</TableCell>
            <TableCell>Engineering success</TableCell>
            <TableCell>
              <a href="/engineering">/engineering ↗</a>
            </TableCell>
          </TableRow>
          <TableRow>
            <TableCell>Silver</TableCell>
            <TableCell>Human practices</TableCell>
            <TableCell>
              <a href="/human-practices">/human-practices ↗</a>
            </TableCell>
          </TableRow>
          <TableRow>
            <TableCell>Gold</TableCell>
            <TableCell>Three selected special awards</TableCell>
            <TableCell>
              <a href="#award-pages">Award pages & Registry records ↓</a>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
      <p className="guide-note">
        Gold requires three award selections, including at least one General Bio
        Engineering award and one Specialization; the third can be from either
        category. The 2026 assessment uses performance in those selections.
        Confirm choices on the Judging Form.{' '}
        <a href={official.medals} target="_blank" rel="noreferrer">
          Read the full medal criteria ↗
        </a>
      </p>
      <div className="deliverable-note">
        <strong>The wiki is one deliverable.</strong>
        <p>
          Complete official forms and submissions in iGEM’s systems. A wiki
          page, writing prompt, or link is not evidence that a deliverable has
          been submitted.
        </p>
        <a href={official.calendar} target="_blank" rel="noreferrer">
          Check the official calendar <ArrowUpRight size={15} />
        </a>
      </div>
    </section>
  );
}
function AwardPages() {
  const awards = [
    ['General Bio Engineering', ['measurement', 'model']],
    [
      'Specializations',
      [
        'education',
        'entrepreneurship',
        'hardware',
        'inclusivity',
        'human-practices',
        'alternative-platform',
        'safety-and-security',
        'software',
        'sustainability',
      ],
    ],
  ] as const;
  return (
    <section className="article-section" id="award-pages">
      <div className="eyebrow">SELECT ACCORDING TO YOUR WORK</div>
      <h2>Optional award documentation.</h2>
      <p>
        These pages are available if relevant. Their presence does not mean the
        team has selected or achieved an award.
      </p>
      {awards.map(([title, slugs]) => (
        <div className="award-group" key={title}>
          <h3>{title}</h3>
          <div className="award-links">
            {slugs.map((slug) => (
              <a key={slug} href={'/' + slug}>
                {wikiPages.find((p) => p.slug === slug)!.title}
                <ArrowUpRight size={14} />
              </a>
            ))}
          </div>
          {title === 'General Bio Engineering' && (
            <p className="guide-note">
              New Basic Part, New Composite Part, New Improved Part, and Part
              Collection are assessed on the Registry.{' '}
              <a href="/parts">
                Keep those records linked from Parts & Registry ↗
              </a>
            </p>
          )}
        </div>
      ))}
      <p className="guide-note">
        Best Wiki and Best Presentation are considered for all teams. Best
        Software is not available to Software & AI Village teams.{' '}
        <a href={official.awards} target="_blank" rel="noreferrer">
          Check the official award guidance ↗
        </a>
      </p>
    </section>
  );
}
export function WikiFooter({ field }: { field: (id: Field) => ReactNode }) {
  return (
    <footer className="wiki-footer">
      <div className="footer-main">
        <a className="brand" href="/">
          {field('brand')}
          <span className="brand-dot" />
        </a>
        <span>{field('footer:tagline')}</span>
        <a href="/judging">
          Judging guide <ArrowUpRight size={14} />
        </a>
        <a href="/references">
          References & credits <ArrowUpRight size={14} />
        </a>
      </div>
      <div className="footer-meta">
        <span>{field('footer:identity')}</span>
        <span>{field('footer:repository')}</span>
        <a
          href="https://creativecommons.org/licenses/by/4.0/"
          target="_blank"
          rel="noreferrer"
        >
          Publication license to confirm: CC BY 4.0 ↗
        </a>
      </div>
    </footer>
  );
}
