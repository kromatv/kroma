import type { ContinueItem } from '@kromatv/client/media';
import { Box } from '@kromatv/ui/kit';
import { useWindowDimensions } from 'react-native';
import { MediaRail, sectionCard } from '#mobile/components/cards';
import { SectionTitle } from '#mobile/components/ui';
import { entryId, type HomeRow } from '#mobile/lib/home-sections';
import { useClient } from '#mobile/lib/session';
import { posterWidth } from '#mobile/lib/theme';
import { HeroCarousel } from './hero-carousel.component';
import { RankedRail } from './ranked-rail.component';
import { SpotlightCard } from './spotlight-card.component';
import { WideRail } from './wide-rail.component';

function PosterRail({ row }: Readonly<{ row: HomeRow }>) {
  const client = useClient();
  const { width } = useWindowDimensions();
  const cardW = posterWidth(width);
  return <MediaRail cards={row.entries.map(({ entry }) => sectionCard(entry, client, cardW))} />;
}

function SectionBody({ row }: Readonly<{ row: HomeRow }>) {
  const [lead] = row.entries;
  if (row.layout === 'wide') {
    return <WideRail entries={row.entries} />;
  }
  if (row.layout === 'ranked') {
    return <RankedRail entries={row.entries} />;
  }
  if (row.layout === 'spotlight') {
    return lead ? <SpotlightCard row={lead} /> : null;
  }
  return <PosterRail row={row} />;
}

const pagedTitles = (row: HomeRow) => row.entries.map(({ entry }) => entryId(entry)).join(' ');

/** One section of the home, drawn the way its layout asks. A carousel starts
 *  over on its first page when a filter or a refresh hands it other titles. */
export function HomeSection({
  row,
  resumable,
}: Readonly<{ row: HomeRow; resumable: readonly ContinueItem[] }>) {
  if (row.layout === 'hero') {
    return <HeroCarousel key={pagedTitles(row)} row={row} resumable={resumable} />;
  }
  return (
    <Box>
      <SectionTitle reason={row.reason}>{row.title}</SectionTitle>
      <SectionBody row={row} />
    </Box>
  );
}
