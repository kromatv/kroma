import { canary, releases } from 'virtual:kroma-releases';
import { IconAlertTriangle, IconFlask, IconRosetteDiscountCheck } from '@tabler/icons-react';
import { createFileRoute } from '@tanstack/react-router';
import { CanaryRuns } from '#site/components/archive/canary-runs';
import { ChannelBuilds } from '#site/components/archive/channel-builds';
import { ChannelNav } from '#site/components/archive/channel-nav';
import { ChannelSection } from '#site/components/archive/channel-section';
import { ReleaseBuilds } from '#site/components/archive/release-builds';
import { Button } from '#site/components/button';
import { Container } from '#site/components/container';
import { docs } from '#site/components/download/links';
import { NO_FILTER, selectBuilds } from '#site/lib/build-select';
import { getLocale } from '#site/lib/i18n';
import { seo } from '#site/lib/seo';
import { m } from '#site/paraglide/messages';

export const Route = createFileRoute('/download_/archive')({
  head: () =>
    seo({
      lang: getLocale(),
      title: m.archive_head_title(),
      description: m.archive_hero_lead(),
      path: '/download/archive',
    }),
  component: Archive,
});

const readRelease = (r: (typeof releases)[number]) => ({
  version: r.version,
  downloads: r.downloads,
});
const readBuild = (b: (typeof canary)[number]) => ({ version: b.version, downloads: b.downloads });

// Counted the way the lists below count, not off the raw feed: a release whose
// every asset this site offers no platform for renders no row, and a channel
// must not advertise a number its own list does not show.
const OFFERED = {
  stable: selectBuilds(releases, readRelease, NO_FILTER).length,
  canary: selectBuilds(canary, readBuild, NO_FILTER).length,
};

const stable = releases[0] ?? null;
const [newestCanary] = canary;

/** Shared with /fr/download/archive, which renders this under the French locale. */
function Archive() {
  return (
    <>
      <section className="pt-20 pb-10 sm:pt-28">
        <Container size="prose">
          <h1 className="text-balance font-display text-4xl font-extrabold leading-[1.05] text-text sm:text-5xl">
            {m.archive_hero_title()}
          </h1>
          <p className="mt-5 text-pretty text-lg leading-relaxed text-muted">
            {m.archive_hero_lead()}
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button to="/download" variant="outline">
              {m.archive_back()}
            </Button>
            <Button href={docs.releases} variant="ghost">
              {m.archive_on_github()}
            </Button>
          </div>
          <div className="mt-10">
            <ChannelNav
              cards={[
                {
                  id: 'stable',
                  icon: IconRosetteDiscountCheck,
                  title: m.channel_stable_title(),
                  version: stable?.version ?? null,
                  at: stable?.publishedAt ?? null,
                  cadence: m.channel_stable_cadence(),
                  count: OFFERED.stable,
                },
                {
                  id: 'canary',
                  icon: IconFlask,
                  title: m.channel_canary_title(),
                  version: newestCanary?.version ?? null,
                  at: newestCanary?.builtAt ?? null,
                  cadence: m.channel_canary_cadence(),
                  count: OFFERED.canary,
                },
              ]}
            />
          </div>
        </Container>
      </section>

      <section className="pb-20 pt-12">
        <Container size="prose">
          <div className="space-y-16">
            <ChannelSection
              id="stable"
              icon={IconRosetteDiscountCheck}
              title={m.channel_stable_title()}
              lead={m.channel_stable_lead()}
              count={OFFERED.stable}
            >
              <ReleaseBuilds releases={releases} />
            </ChannelSection>

            <ChannelSection
              id="canary"
              icon={IconFlask}
              title={m.channel_canary_title()}
              lead={m.channel_canary_lead()}
              count={OFFERED.canary}
              note={{
                icon: IconAlertTriangle,
                tag: m.channel_canary_note_tag(),
                body: m.channel_canary_note_body(),
              }}
            >
              <ChannelBuilds builds={canary} />
              <CanaryRuns />
            </ChannelSection>
          </div>
        </Container>
      </section>
    </>
  );
}
