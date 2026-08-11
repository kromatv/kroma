import type { ReactNode } from 'react';
import { Container } from '#site/components/container';

export interface SectionProps {
  children: ReactNode;
  id?: string;
  eyebrow?: string;
  title?: ReactNode;
  intro?: ReactNode;
  className?: string;
  align?: 'center' | 'left';
}

/** A vertical band with the site's rhythm and an optional titled header. */
export function Section({
  children,
  id,
  eyebrow,
  title,
  intro,
  className,
  align = 'center',
}: Readonly<SectionProps>) {
  const hasHeader = eyebrow || title || intro;
  return (
    <section
      id={id}
      className={['scroll-mt-24 py-20 sm:py-28', className].filter(Boolean).join(' ')}
    >
      <Container>
        {hasHeader && (
          <div className={['max-w-2xl', align === 'center' ? 'mx-auto text-center' : ''].join(' ')}>
            {eyebrow && (
              <p className="mb-3 font-sans text-xs font-bold uppercase tracking-[0.18em] text-accent">
                {eyebrow}
              </p>
            )}
            {title && (
              <h2 className="text-balance font-display text-3xl font-extrabold leading-[1.05] text-text sm:text-4xl">
                {title}
              </h2>
            )}
            {intro && (
              <p className="mt-4 text-pretty text-lg leading-relaxed text-muted">{intro}</p>
            )}
          </div>
        )}
        <div className={hasHeader ? 'mt-14' : ''}>{children}</div>
      </Container>
    </section>
  );
}
