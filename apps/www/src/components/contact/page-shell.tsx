import type { ReactNode } from 'react';
import { Container } from '#site/components/container';

export interface PageShellProps {
  eyebrow: string;
  title: string;
  intro: ReactNode;
  updated?: string;
  size?: 'default' | 'prose';
  children: ReactNode;
}

export function PageShell({
  eyebrow,
  title,
  intro,
  updated,
  size = 'default',
  children,
}: Readonly<PageShellProps>) {
  const prose = size === 'prose';
  const Root = prose ? 'article' : 'div';
  return (
    <Container size={size}>
      <Root className="py-16 sm:py-20">
        <header className={prose ? undefined : 'max-w-2xl'}>
          <p className="mb-3 font-sans text-xs font-bold uppercase tracking-[0.18em] text-accent-text">
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
