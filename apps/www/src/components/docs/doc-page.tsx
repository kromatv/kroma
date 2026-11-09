import { site } from '@kromatv/site-meta';
import { IconArrowLeft, IconArrowRight, IconBrandGithub, IconLanguage } from '@tabler/icons-react';
import { DocAnchor } from '#site/components/docs/doc-anchor';
import { DOC_NAV_LABEL, DOC_SECTION_LABEL } from '#site/components/docs/doc-labels';
import { DocsNav } from '#site/components/docs/docs-nav';
import { L } from '#site/components/localized-link';
import { getDoc, listed, neighbours } from '#site/lib/doc-pages';
import { type DocSlug, docPath } from '#site/lib/docs';
import { useLang } from '#site/lib/i18n';
import { m } from '#site/paraglide/messages';

const components = { a: DocAnchor };

function Pager({ slug }: Readonly<{ slug: DocSlug }>) {
  const { prev, next } = neighbours(slug);
  if (!prev && !next) return null;
  return (
    <div className="mt-16 grid gap-3 border-t border-border pt-8 sm:grid-cols-2">
      {prev ? (
        <L
          to={docPath(prev)}
          className="group rounded-xl border border-border p-4 transition-colors hover:border-border-strong"
        >
          <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-dim">
            <IconArrowLeft size={14} aria-hidden />
            {m.docs_prev()}
          </span>
          <span className="mt-1.5 block font-display font-bold text-text">
            {DOC_NAV_LABEL[prev]()}
          </span>
        </L>
      ) : (
        <span />
      )}
      {next && (
        <L
          to={docPath(next)}
          className="group rounded-xl border border-border p-4 text-right transition-colors hover:border-border-strong"
        >
          <span className="flex items-center justify-end gap-1.5 text-xs font-semibold uppercase tracking-wider text-dim">
            {m.docs_next()}
            <IconArrowRight size={14} aria-hidden />
          </span>
          <span className="mt-1.5 block font-display font-bold text-text">
            {DOC_NAV_LABEL[next]()}
          </span>
        </L>
      )}
    </div>
  );
}

/** One setup guide, with the list of guides beside it. */
export function DocPage({ slug }: Readonly<{ slug: DocSlug }>) {
  const lang = useLang();
  const doc = getDoc(slug, lang);
  if (!doc) return null;
  const { Component } = doc;

  return (
    <div
      className="mx-auto grid w-full max-w-[75rem] gap-8 py-10 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-14 lg:py-16"
      style={{ paddingInline: 'var(--gutter-web)' }}
    >
      <aside className="lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)] lg:self-start lg:overflow-y-auto lg:pb-8">
        <DocsNav current={slug} listed={listed()} />
      </aside>

      <article className="min-w-0 max-w-[46rem]">
        <header>
          <p className="mb-3 font-sans text-xs font-bold uppercase tracking-[0.18em] text-accent-text">
            {DOC_SECTION_LABEL[doc.section]()}
          </p>
          <h1 className="text-balance font-display text-4xl font-extrabold leading-[1.08] text-text sm:text-5xl">
            {doc.title}
          </h1>
        </header>

        {!doc.translated && lang !== 'en' && (
          <p className="mt-6 flex items-center gap-2 rounded-lg border border-border bg-surface-1/60 px-4 py-3 text-sm text-muted">
            <IconLanguage size={16} aria-hidden className="shrink-0" />
            {m.docs_untranslated()}
          </p>
        )}

        <div className="prose-kroma prose-docs mt-10">
          <Component components={components} />
        </div>

        <Pager slug={slug} />

        <a
          href={`${site.repo}/edit/main/${doc.source}`}
          target="_blank"
          rel="noreferrer noopener"
          className="mt-8 inline-flex items-center gap-2 text-sm text-muted transition-colors hover:text-text"
        >
          <IconBrandGithub size={16} aria-hidden />
          {m.docs_edit()}
        </a>
      </article>
    </div>
  );
}
