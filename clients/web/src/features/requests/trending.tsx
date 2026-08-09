// The browse-first empty state: trending movies + shows as home-style rails,
// so the discovery page is a place to browse, not just a search box. Filtered
// by the active type chip.

import type { DiscoverEntry, DiscoverType } from '@kroma/core';
import { useT } from '@kroma/ui';
import { Box, Icon, Row, Txt } from '@kroma/ui/kit';
import { IconChevronRight } from '@tabler/icons-react';
import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { DiscoverCard } from '#web/features/requests/discover-card';
import { PosterRail, SkeletonRow } from '#web/shared/ui';

// DiscoverCard's caption strip under the 2:3 art (title + kind/year lines).
const CAPTION_H = 52;

function RailHeading({ title, action }: Readonly<{ title: string; action?: ReactNode }>) {
  return (
    <Row between gap={12} mt={36} mb={16}>
      {/* Still an <h2>: <Txt accessibilityRole="header"> can only render an h1. */}
      <h2 className="flex items-center gap-2">
        <Icon name="flame" size={20} stroke={2} color="accent" />
        <Txt variant="h2">{title}</Txt>
      </h2>
      {action}
    </Row>
  );
}

function TrendRail({
  title,
  entries,
  linkType,
}: Readonly<{ title: string; entries: DiscoverEntry[]; linkType: 'movie' | 'tv' }>) {
  const t = useT();
  if (entries.length === 0) return null;
  return (
    <section>
      <RailHeading
        title={title}
        action={
          <Link
            to="/trending/$type"
            params={{ type: linkType }}
            className="inline-flex shrink-0 items-center gap-1 text-[13px] font-semibold text-dim transition-colors hover:text-accent"
          >
            {t('discover.seeAll')}
            <IconChevronRight size={15} stroke={2.4} />
          </Link>
        }
      />
      <PosterRail data={entries} extra={CAPTION_H} renderItem={(e) => <DiscoverCard entry={e} />} />
    </section>
  );
}

export function TrendingBrowse({
  entries,
  loading,
  type,
}: Readonly<{ entries: DiscoverEntry[]; loading: boolean; type: DiscoverType }>) {
  const t = useT();

  if (loading) {
    return (
      <Box>
        <RailHeading title={t('discover.trending')} />
        <SkeletonRow />
      </Box>
    );
  }

  const movies = entries.filter((e) => e.kind === 'movie');
  const shows = entries.filter((e) => e.kind === 'show');
  const wantMovies = type !== 'tv';
  const wantShows = type !== 'movie';

  return (
    <div className="animate-[fade-in_.3s_var(--ease-out)]">
      {wantMovies ? (
        <TrendRail title={t('discover.trendingMovies')} entries={movies} linkType="movie" />
      ) : null}
      {wantShows ? (
        <TrendRail title={t('discover.trendingShows')} entries={shows} linkType="tv" />
      ) : null}
    </div>
  );
}
