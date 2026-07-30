import { createFileRoute } from '@tanstack/react-router';
import { BlogTeaser } from '#site/components/home/blog-teaser';
import { DirectPlay } from '#site/components/home/direct-play';
import { FeatureGrid } from '#site/components/home/feature-grid';
import { FinalCta } from '#site/components/home/final-cta';
import { Hero } from '#site/components/home/hero';
import { OneBinary } from '#site/components/home/one-binary';
import { Platforms } from '#site/components/home/platforms';
import { SelfHostBand } from '#site/components/home/self-host-band';
import { getLocale } from '#site/lib/i18n';
import { seo } from '#site/lib/seo';
import { m } from '#site/paraglide/messages';

// The meta description is the hero's own lead, read from the same message the
// section renders, so the two can never drift apart.
export const Route = createFileRoute('/')({
  head: () => seo({ lang: getLocale(), path: '/', description: m.home_hero_description() }),
  component: Home,
});

// The home page is a composition, not a wall of markup: each band is a single
// self-contained section under components/home. The order tells the story: the
// promise, the one-binary differentiator, the full capability set, the playback
// moment, where it runs, why you'd own it, what we're writing, then the ask.
export function Home() {
  return (
    <>
      <Hero />
      <OneBinary />
      <FeatureGrid />
      <DirectPlay />
      <Platforms />
      <SelfHostBand />
      <BlogTeaser />
      <FinalCta />
    </>
  );
}
