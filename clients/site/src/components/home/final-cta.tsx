import { Button } from '#site/components/button';
import { Container } from '#site/components/container';
import { AccentHeading } from '#site/components/home/heading';
import { WheelMark } from '#site/components/wheel-mark';
import { site } from '#site/lib/site';
import { m } from '#site/paraglide/messages';

export function FinalCta() {
  return (
    <section className="relative overflow-hidden border-t border-border/70">
      <div className="glow-amber pointer-events-none absolute inset-x-0 bottom-0 h-[420px]" />
      <Container>
        <div className="relative flex flex-col items-center py-24 text-center sm:py-32">
          <WheelMark size={56} className="mb-7" />
          <h2 className="max-w-2xl text-balance font-display text-4xl font-extrabold leading-[1.05] text-text sm:text-5xl">
            <AccentHeading text={m.home_final_cta_heading()} />
          </h2>
          <p className="mt-5 max-w-xl text-pretty text-lg leading-relaxed text-muted">
            {m.home_final_cta_lead()}
          </p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Button to="/download" size="lg">
              {m.home_final_cta_install()}
            </Button>
            <Button href={site.repo} variant="outline" size="lg">
              {m.home_final_cta_code()}
            </Button>
          </div>
          <p className="mt-8 font-mono text-xs text-dim">{m.home_final_cta_legal()}</p>
        </div>
      </Container>
    </section>
  );
}
