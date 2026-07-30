import type { ReactNode } from 'react';
import { Container } from '#site/components/container';

export interface PageShellProps {
  /** Small amber eyebrow above the heading. */
  eyebrow: string;
  title: string;
  /** Lead paragraph under the heading. */
  intro: ReactNode;
  /** A quiet line between heading and lead, for a legal page's revision date. */
  updated?: string;
  /** Narrow measure for a long-form document (the privacy policy) instead of the
   *  page-width grid a landing page uses. */
  size?: 'default' | 'prose';
  children: ReactNode;
}

/** The standalone-page frame the site's non-landing pages share: the horizontal
 *  measure, the vertical rhythm, and the typographic header (eyebrow, display
 *  title, optional date, one lead line). A page supplies its strings and its
 *  body; the chrome around them is decided once, here. */
export function PageShell({
  eyebrow,
  title,
  intro,
  updated,
  size = 'default',
  children,
}: Readonly<PageShellProps>) {
  const prose = size === 'prose';
  // A legal document is an <article>; a hub page like support is not.
  const Root = prose ? 'article' : 'div';
  return (
    <Container size={size}>
      <Root className="py-16 sm:py-20">
        <header className={prose ? undefined : 'max-w-2xl'}>
          <p className="mb-3 font-sans text-xs font-bold uppercase tracking-[0.18em] text-accent">
            {eyebrow}
          </p>
          <h1
            className={`text-balance font-display text-4xl font-extrabold text-text sm:text-5xl ${
              prose ? 'leading-[1.08]' : 'leading-[1.05]'
            }`}
          >
            {title}
          </h1>
          {updated && <p className="mt-5 text-sm text-dim">{updated}</p>}
          <p className={`${updated ? 'mt-6' : 'mt-4'} text-lg leading-relaxed text-muted`}>
            {intro}
          </p>
        </header>
        {children}
      </Root>
    </Container>
  );
}
