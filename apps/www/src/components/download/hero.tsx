import { Container } from '#site/components/container';
import { ArchiveLink } from '#site/components/download/archive-link';
import { ReleaseSummary } from '#site/components/download/release-summary';
import { YourPlatform } from '#site/components/download/your-platform';
import { Rich } from '#site/components/rich';
import { m } from '#site/paraglide/messages';

export function DownloadHero() {
  return (
    <section className="relative overflow-hidden">
      <div className="glow-amber pointer-events-none absolute inset-x-0 top-0 h-[420px]" />
      <Container>
        <div className="relative max-w-3xl py-20 sm:py-24">
          <p className="mb-3 font-sans text-xs font-bold uppercase tracking-[0.18em] text-accent-text">
            {m.download_hero_eyebrow()}
          </p>
          <h1 className="text-balance font-display text-4xl font-extrabold leading-[1.03] text-text sm:text-5xl">
            <Rich>{m.download_hero_h1()}</Rich>
          </h1>
          <p className="mt-5 max-w-2xl text-pretty text-lg leading-relaxed text-muted">
            {m.download_hero_lede()}
          </p>
          <ReleaseSummary />
          <ArchiveLink />
          <YourPlatform />
        </div>
      </Container>
    </section>
  );
}
