import { createFileRoute } from '@tanstack/react-router';
import { BlogTeaser } from '#site/components/home/blog-teaser.component';
import { DirectPlay } from '#site/components/home/direct-play.component';
import { FeatureGrid } from '#site/components/home/feature-grid.component';
import { FinalCta } from '#site/components/home/final-cta.component';
import { Hero } from '#site/components/home/hero.component';
import { Modules } from '#site/components/home/modules.component';
import { OneBinary } from '#site/components/home/one-binary.component';
import { Platforms } from '#site/components/home/platforms.component';
import { SelfHostBand } from '#site/components/home/self-host-band.component';
import { getLocale } from '#site/lib/i18n';
import { seo } from '#site/lib/seo';
import { m } from '#site/paraglide/messages';

// The meta description reads the same message the hero renders, so the two
// cannot drift apart.
export const Route = createFileRoute('/')({
  head: () => seo({ lang: getLocale(), path: '/', description: m.home_hero_description() }),
  component: Home,
});

function Home() {
  return (
    <>
      <Hero />
      <OneBinary />
      <FeatureGrid />
      <Modules />
      <DirectPlay />
      <Platforms />
      <SelfHostBand />
      <BlogTeaser />
      <FinalCta />
    </>
  );
}
