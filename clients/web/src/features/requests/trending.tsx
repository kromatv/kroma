// The browse-first empty state: trending movies + shows as home-style rails,
// so the discovery page is a place to browse, not just a search box. Filtered
// by the active type chip.

import type { DiscoverEntry, DiscoverType } from '@kroma/core';
import { useT } from '@kroma/ui';
import { Box, Icon, Row, Text } from '@kroma/ui/kit';
import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { DiscoverCard } from '#web/features/requests/discover-card';
import { PosterRail, SkeletonRow } from '#web/shared/ui';

// DiscoverCard's caption strip under the 2:3 art (title + kind/year lines).
const CAPTION_H = 52;

function RailHeading({ title, action }: Readonly<{ title: string; action?: ReactNode }>) {
  return (
    <Row between gap={12} mt={36} mb={16}>
      {/* Still an <h2>: <Text accessibilityRole="header"> can only render an h1. */}
      <h2 style={HEADING}>
        <Row gap={8}>
          <Icon name="flame" size={20} thickness={2} color="accent" />
          <Text variant="h2">{title}</Text>
        </Row>
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
          <Link to="/trending/$type" params={{ type: linkType }} style={INLINE_LINK}>
            <Text variant="meta" color="textDim">
              {t('discover.seeAll')}
            </Text>
            <Icon name="chevron-right" size={15} thickness={2.4} color="textDim" />
          </Link>
        }
      />
      <PosterRail
        data={entries}
        extraHeight={CAPTION_H}
        renderItem={(e) => <DiscoverCard entry={e} />}
      />
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
    <div style={FADE_IN}>
      {wantMovies ? (
        <TrendRail title={t('discover.trendingMovies')} entries={movies} linkType="movie" />
      ) : null}
      {wantShows ? (
        <TrendRail title={t('discover.trendingShows')} entries={shows} linkType="tv" />
      ) : null}
    </div>
  );
}

const HEADING = { margin: 0 } as const;

// The focus ring is an outline and takes the corners of what it rings, so a bare
// inline link states a radius rather than being boxed square.
const INLINE_LINK = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  flexShrink: 0,
  textDecoration: 'none',
  borderRadius: 'var(--radius-sm)',
} as const;

const FADE_IN = { animation: 'fade-in .3s var(--ease-out)' } as const;
