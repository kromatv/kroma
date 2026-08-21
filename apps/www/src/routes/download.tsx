import { createFileRoute } from '@tanstack/react-router';
import { AppPlatforms } from '#site/components/download/app-platforms';
import { Closing } from '#site/components/download/closing';
import { DownloadHero } from '#site/components/download/hero';
import { InstallStep } from '#site/components/download/install-step';
import { docs, ProseLink } from '#site/components/download/links';
import { ServerOptions } from '#site/components/download/server-options';
import { Rich } from '#site/components/rich';
import { getLocale } from '#site/lib/i18n';
import { seo } from '#site/lib/seo';
import { m } from '#site/paraglide/messages';

export const Route = createFileRoute('/download')({
  // `head` runs outside React, but a Paraglide message still resolves from the
  // ambient locale there, so one head serves both languages.
  head: () => seo({ lang: getLocale(), title: m.download_head_title(), path: '/download' }),
  component: Download,
});

/** Shared with /fr/download, which renders this component under the French locale. */
function Download() {
  return (
    <>
      <DownloadHero />

      <InstallStep
        id="serveur"
        step="01"
        title={m.download_server_step_title()}
        intro={m.download_server_step_intro()}
      >
        <ServerOptions />
      </InstallStep>

      <InstallStep
        id="apps"
        step="02"
        title={m.download_apps_step_title()}
        intro={
          <>
            <Rich>{m.download_apps_step_intro()}</Rich>{' '}
            <ProseLink href={docs.releases}>{m.download_apps_step_link()}</ProseLink>
          </>
        }
      >
        <AppPlatforms />
      </InstallStep>

      <Closing />
    </>
  );
}
