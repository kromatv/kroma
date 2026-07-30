import { Fragment, useRef } from 'react';
import { Button } from '#site/components/button';
import { Container } from '#site/components/container';
import { AccentHeading } from '#site/components/home/heading';
import { HeroBeams } from '#site/components/home/hero-beams';
import { site } from '#site/lib/site';
import { m } from '#site/paraglide/messages';

// The entrance is a pure-CSS staggered rise: it needs no JS and no scroll
// observer, so it plays on the prerendered HTML too, and `motion-safe:` drops
// it entirely for readers who ask for stillness.
export function Hero() {
  // The burst locks its origin onto the lockup; the ref hands the canvas that node.
  const markRef = useRef<HTMLSpanElement>(null);
  // The three specifics, as a list so the middot separators can sit between them.
  const facts = [m.home_hero_fact_1(), m.home_hero_fact_2(), m.home_hero_fact_3()];

  return (
    <section className="relative overflow-hidden">
      {/* A browser without WebGL still gets warmth rather than flat charcoal. */}
      <div className="glow-amber pointer-events-none absolute inset-x-0 -top-24 h-[620px]" />
      <HeroBeams anchorRef={markRef} />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-bg" />

      <Container>
        <div className="relative z-10 flex flex-col items-center py-24 text-center sm:py-32">
          <div className="mb-9 motion-safe:animate-rise">
            <span ref={markRef} className="inline-block">
              <img
                src="/kroma-lockup.svg"
                alt={m.home_hero_logo_alt()}
                width={458}
                height={100}
                className="h-11 w-auto drop-shadow-[0_2px_24px_rgba(0,0,0,0.5)] sm:h-14"
              />
            </span>
          </div>

          <p
            className="mb-7 inline-flex items-center gap-2.5 rounded-full border border-border bg-surface-1/60 px-3.5 py-1.5 font-mono text-xs tracking-tight text-muted backdrop-blur-sm motion-safe:animate-rise"
            style={{ animationDelay: '60ms' }}
          >
            <span className="inline-block size-1.5 rounded-full bg-accent" aria-hidden />
            {m.home_hero_pill()}
          </p>

          <h1
            className="max-w-4xl text-balance font-display text-5xl font-extrabold leading-[1.02] text-text motion-safe:animate-rise sm:text-6xl lg:text-7xl"
            style={{ animationDelay: '120ms' }}
          >
            <AccentHeading text={m.home_hero_title()} />
          </h1>

          <p
            className="mt-6 max-w-2xl text-pretty text-lg leading-relaxed text-muted motion-safe:animate-rise sm:text-xl"
            style={{ animationDelay: '180ms' }}
          >
            {m.home_hero_description()}
          </p>

          <div
            className="mt-10 flex flex-wrap items-center justify-center gap-3 motion-safe:animate-rise"
            style={{ animationDelay: '240ms' }}
          >
            <Button to="/download" size="lg">
              {m.home_hero_install()}
            </Button>
            <Button href={site.repo} variant="outline" size="lg">
              {m.home_hero_code()}
            </Button>
          </div>

          <ul
            className="mt-12 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 font-mono text-xs text-dim motion-safe:animate-rise"
            style={{ animationDelay: '320ms' }}
          >
            {facts.map((fact, i) => (
              // Middot separators live between items only, aria-hidden as pure punctuation.
              <Fragment key={fact}>
                {i > 0 && (
                  <li aria-hidden className="text-border-strong">
                    ·
                  </li>
                )}
                <li>{fact}</li>
              </Fragment>
            ))}
          </ul>
        </div>
      </Container>
    </section>
  );
}
