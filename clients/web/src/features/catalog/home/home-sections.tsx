import { useSuspenseQuery } from '@tanstack/react-query';
import { SectionPoster } from '#web/features/catalog/cards';
import { entryId, type HomeSection } from '#web/features/catalog/home/entries';
import { RankedRail } from '#web/features/catalog/home/ranked-rail';
import { SectionHeading } from '#web/features/catalog/home/section-heading';
import { Spotlight } from '#web/features/catalog/home/spotlight';
import { WideRail } from '#web/features/catalog/home/wide-rail';
import { useWebRuntime } from '#web/shared/lib/web-runtime';
import { PosterRail, RailSkeleton } from '#web/shared/ui';

/** The two rails held while the server's sections are on their way. */
export function SectionsSkeleton() {
  return (
    <>
      <RailSkeleton />
      <RailSkeleton />
    </>
  );
}

function SectionRow({ section }: Readonly<{ section: HomeSection }>) {
  if (section.layout === 'ranked') return <RankedRail section={section} />;
  if (section.layout === 'wide') return <WideRail section={section} />;
  return (
    <PosterRail
      data={section.items}
      renderItem={(entry) => <SectionPoster key={entryId(entry)} entry={entry} />}
    />
  );
}

/** One section of the home, drawn the way it asks to be. The hero is not one
 * of these: the page places it itself, above the viewer's own rows. */
export function HomeSectionView({ section }: Readonly<{ section: HomeSection }>) {
  if (section.items.length === 0 || section.layout === 'hero') return null;
  if (section.layout === 'spotlight') return <Spotlight section={section} />;
  return (
    <section>
      <SectionHeading title={section.title} reason={section.reason} />
      <SectionRow section={section} />
    </section>
  );
}

/** Every section the server sent but the hero, in its order. */
export function HomeSections() {
  const { data: sections } = useSuspenseQuery(useWebRuntime().queries.userQueries.home());
  return (
    <>
      {sections.map((section) => (
        <HomeSectionView key={section.id} section={section} />
      ))}
    </>
  );
}
