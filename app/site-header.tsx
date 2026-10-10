/* oxlint-disable next/no-html-link-for-pages -- Also rendered as a standalone static wiki, without a Next router. */
import type { HeaderLink } from './header-schema';
import type { ReactNode } from 'react';
import type { Blocks } from './content';
import type { WikiPage } from './wiki-data';
import { parseHeader, headerStyle, HeaderBrand } from './header-design';
import { WikiNav } from './wiki-components';
import { pageCatalog } from './custom-pages';

export function SiteHeader({
  data,
  wiki,
  publication = false,
  children,
}: {
  data: Blocks;
  wiki?: WikiPage;
  publication?: boolean;
  children?: ReactNode;
}) {
  const design = parseHeader(data['site:header']?.value);
  const customPages = pageCatalog(data).filter(
    (p) => p.group === 'Custom pages',
  );
  const visible = design.links?.filter((link) => !link.hidden) || [];
  const renderLink = (link: HeaderLink, index: number) => (
    <a
      key={index}
      href={link.href}
      aria-current={
        link.href === (wiki ? '/' + wiki.slug : '/') ? 'page' : undefined
      }
    >
      {link.label || 'Untitled link'}
    </a>
  );
  return (
    <>
      <header
        className={'header header-layout-' + design.layout}
        style={headerStyle(design)}
        data-header-part="layout"
      >
        {(design.showLogo || design.showName) && (
          <a
            className="brand"
            href={design.brandHref}
            aria-label={design.name || 'Home'}
            data-header-part="brand"
          >
            <HeaderBrand
              design={design}
              fallback={data.brand?.value || 'prion collective'}
            />
          </a>
        )}
        {design.navigation && (
          <div className="site-header-navigation" data-header-part="navigation">
            {design.links === null ? (
              <WikiNav current={wiki} data={data} publication={publication} />
            ) : (
              <nav className="static-nav" aria-label="Main navigation">
                {visible.map((link, index) => {
                  if (!link.group) return renderLink(link, index);
                  if (
                    visible.findIndex((item) => item.group === link.group) !==
                    index
                  )
                    return null;
                  return (
                    <details key={'group-' + index}>
                      <summary>{link.group}</summary>
                      <div className="static-menu">
                        {visible
                          .filter((item) => item.group === link.group)
                          .map(renderLink)}
                      </div>
                    </details>
                  );
                })}
              </nav>
            )}
          </div>
        )}
        {children}
      </header>
      {design.navigation && design.links === null && customPages.length > 0 && (
        <nav
          className="custom-page-nav"
          data-header-part="navigation"
          aria-label="Team pages"
        >
          {customPages.map((p) => (
            <a key={p.slug} href={'/' + p.slug}>
              {p.title}
            </a>
          ))}
        </nav>
      )}
    </>
  );
}
