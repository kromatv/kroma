import { site } from '@kromatv/site-meta';
import { IconArrowUpRight } from '@tabler/icons-react';
import { Container } from '#site/components/container';
import { docs } from '#site/components/download/links';
import { L } from '#site/components/localized-link';
import { m } from '#site/paraglide/messages';

export function Closing() {
  return (
    <section className="pb-12 pt-2 sm:pb-16">
      <Container>
        <div className="mx-auto flex max-w-4xl flex-col items-center justify-between gap-4 px-1 text-xs sm:flex-row">
          <p className="text-dim">{m.download_closing_note()}</p>
          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-3 text-muted">
            <a
              href={docs.installGuide}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1 transition-colors hover:text-accent-text"
            >
              {m.download_closing_guide()}
              <IconArrowUpRight size={12} aria-hidden />
            </a>
            <a href={site.tvUrl} className="transition-colors hover:text-accent-text">
              {m.download_closing_tv_demo()}
            </a>
            <L to="/support" className="transition-colors hover:text-accent-text">
              {m.download_closing_help()}
            </L>
          </div>
        </div>
      </Container>
    </section>
  );
}
