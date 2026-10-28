import { createFileRoute } from '@tanstack/react-router';
import { IconChevronDown, IconServer } from '@tabler/icons-react';
import { Container } from '#site/components/container';
import { DownloadChannelProvider } from '#site/components/download/channel';
import { Closing } from '#site/components/download/closing';
import { DownloadHero } from '#site/components/download/hero';
import { ServerOptions } from '#site/components/download/server-options';
import { getLocale } from '#site/lib/i18n';
import { seo } from '#site/lib/seo';
import { m } from '#site/paraglide/messages';

export const Route = createFileRoute('/download')({
  head: () => seo({ lang: getLocale(), title: m.download_head_title(), path: '/download' }),
  component: Download,
});

/** Shared with /fr/download under the French locale. */
function Download() {
  return (
    <DownloadChannelProvider>
      <DownloadHero />
      <section id="serveur" className="scroll-mt-24 pb-5">
        <Container>
          <details className="group mx-auto max-w-4xl rounded-2xl border border-border bg-surface-1/40 p-5 sm:p-6">
            <summary className="flex cursor-pointer list-none items-center gap-4 [&::-webkit-details-marker]:hidden">
              <IconServer
                size={24}
                stroke={1.5}
                className="shrink-0 text-accent-text"
                aria-hidden
              />
              <span className="min-w-0 flex-1">
                <span className="block font-display text-lg font-bold text-text">
                  {m.download_server_prompt()}
                </span>
                <span className="mt-1 block text-sm text-muted">
                  {m.download_server_prompt_body()}
                </span>
              </span>
              <IconChevronDown
                size={20}
                className="shrink-0 text-muted transition-transform group-open:rotate-180"
                aria-hidden
              />
            </summary>
            <div className="mt-6">
              <ServerOptions />
            </div>
          </details>
        </Container>
      </section>
      <Closing />
    </DownloadChannelProvider>
  );
}
