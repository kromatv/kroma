import { IconChevronDown } from '@tabler/icons-react';
import { Link, type LinkProps } from '@tanstack/react-router';
import { DOC_NAV_LABEL, DOC_SECTION_LABEL } from '#site/components/docs/doc-labels';
import { DOC_SECTIONS, type DocSlug, docPath } from '#site/lib/docs';
import { m } from '#site/paraglide/messages';

export interface DocsNavProps {
  current: DocSlug;
  listed: readonly DocSlug[];
}

function Sections({ current, listed }: Readonly<DocsNavProps>) {
  return (
    <div className="flex flex-col gap-7">
      {DOC_SECTIONS.map((section) => {
        const slugs = section.slugs.filter((slug) => listed.includes(slug));
        if (slugs.length === 0) return null;
        return (
          <div key={section.id}>
            <p className="mb-2.5 font-sans text-[0.7rem] font-bold uppercase tracking-[0.16em] text-dim">
              {DOC_SECTION_LABEL[section.id]()}
            </p>
            <ul className="flex flex-col gap-0.5 border-l border-border">
              {slugs.map((slug) => {
                const active = slug === current;
                return (
                  <li key={slug}>
                    <Link
                      to={docPath(slug) as LinkProps['to']}
                      activeOptions={{ exact: true }}
                      className={`-ml-px block border-l-2 py-1.5 pl-4 text-sm transition-colors ${
                        active
                          ? 'border-accent font-semibold text-text'
                          : 'border-transparent text-muted hover:border-border-strong hover:text-text'
                      }`}
                    >
                      {DOC_NAV_LABEL[slug]()}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

/** The list of guides: a sticky column beside the page on a wide screen, a
 *  disclosure above it on a narrow one. */
export function DocsNav(props: Readonly<DocsNavProps>) {
  return (
    <nav aria-label={m.docs_nav_label()}>
      <details className="group rounded-xl border border-border bg-surface-1/50 lg:hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-text [&::-webkit-details-marker]:hidden">
          <span>
            {m.docs_menu()}
            <span className="ml-2 font-normal text-muted">{DOC_NAV_LABEL[props.current]()}</span>
          </span>
          <IconChevronDown
            size={18}
            aria-hidden
            className="shrink-0 text-muted transition-transform group-open:rotate-180"
          />
        </summary>
        <div className="border-t border-border px-4 py-5">
          <Sections {...props} />
        </div>
      </details>
      <div className="hidden lg:block">
        <Sections {...props} />
      </div>
    </nav>
  );
}
