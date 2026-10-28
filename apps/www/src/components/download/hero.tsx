import { IconCircleCheck } from '@tabler/icons-react';
import { Container } from '#site/components/container';
import { AppPlatforms } from '#site/components/download/app-platforms';
import { ArchiveLink } from '#site/components/download/archive-link';
import { ChannelToggle } from '#site/components/download/channel';
import { ReleaseSummary } from '#site/components/download/release-summary';
import { Rich } from '#site/components/rich';
import { m } from '#site/paraglide/messages';

export function DownloadHero() {
  return (
    <section className="relative overflow-hidden">
      <div className="glow-amber pointer-events-none absolute inset-x-0 top-0 h-[500px] opacity-50" />
      <Container>
        <div className="relative mx-auto max-w-4xl pb-8 pt-10 sm:pb-10 sm:pt-16">
          <header className="text-center">
            <p className="mb-4 font-sans text-[0.65rem] font-bold uppercase tracking-[0.24em] text-accent-text sm:text-xs">
              {m.download_hero_eyebrow()}
            </p>
            <h1 className="font-display text-5xl font-extrabold leading-none tracking-[-0.055em] text-text sm:text-7xl">
              <Rich>{m.download_hero_h1()}</Rich>
            </h1>
            <p className="mx-auto mt-5 max-w-lg text-pretty text-base leading-relaxed text-muted sm:text-lg">
              {m.download_hero_lede()}
            </p>
            <div className="mt-6 flex justify-center sm:mt-7">
              <ChannelToggle />
            </div>
          </header>
          <div className="mt-7 sm:mt-9">
            <AppPlatforms />
          </div>
          <div className="mt-5">
            <ReleaseSummary />
          </div>
          <div className="mt-7 flex flex-col items-center justify-between gap-3 border-t border-border/60 pt-5 text-sm sm:flex-row">
            <p className="flex items-start gap-2 text-xs leading-relaxed text-muted sm:text-sm">
              <IconCircleCheck
                size={17}
                stroke={1.6}
                className="mt-0.5 shrink-0 text-accent-text"
                aria-hidden
              />
              {m.download_connect_hint()}
            </p>
            <ArchiveLink />
          </div>
        </div>
      </Container>
    </section>
  );
}
