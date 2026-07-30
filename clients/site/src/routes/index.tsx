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

// The meta description reads the same message the hero renders, so the two
// cannot drift apart.
export const Route = createFileRoute('/')({
  head: () => seo({ lang: getLocale(), path: '/', description: m.home_hero_description() }),
  component: Home,
});

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
