import type { ReactNode } from 'react';
import { Container } from '#site/components/container';

export interface InstallStepProps {
  step: string;
  title: ReactNode;
  intro?: ReactNode;
  id?: string;
  children: ReactNode;
}

export function InstallStep({ step, title, intro, id, children }: Readonly<InstallStepProps>) {
  return (
    <section id={id} className="scroll-mt-24 border-t border-border/60 py-16 sm:py-20">
      <Container>
        <header className="flex items-baseline gap-4 sm:gap-6">
          <span
            aria-hidden
            className="font-display text-5xl font-extrabold leading-none text-accent-text/25 sm:text-6xl"
          >
            {step}
          </span>
          <div>
            <h2 className="font-display text-2xl font-extrabold leading-tight text-text sm:text-3xl">
              {title}
            </h2>
            {intro && (
              <p className="mt-2 max-w-2xl text-pretty leading-relaxed text-muted">{intro}</p>
            )}
          </div>
        </header>
        <div className="mt-10">{children}</div>
      </Container>
    </section>
  );
}
