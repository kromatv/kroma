// A paginated grid of this week's trending movies OR shows, reached from the
// discover rails. TMDB-gated on `requests.create`.

import { hasPermission } from '@kroma/core';
import { useT } from '@kroma/ui';
import { Box, Button, EmptyState, Icon, PageHeader, Row, Text } from '@kroma/ui/kit';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { DiscoverCard } from '#web/features/requests/discover-card';
import {
  type TrendingPageState,
  useTrendingPage,
} from '#web/features/requests/use-discover-search';
import { useAuth } from '#web/shared/lib/auth';
import { PageFrame, SkeletonRow } from '#web/shared/ui';
import { TileGrid } from '#web/shared/ui/tile-grid';

const PAGE_COUNT = { fontVariant: ['tabular-nums' as const] };

const BACK_LINK = {
  display: 'inline-flex',
  alignItems: 'center',
  alignSelf: 'flex-start',
  gap: 6,
  marginBottom: 24,
  textDecoration: 'none',
} as const;

export function TrendingPage({ type }: Readonly<{ type: 'movie' | 'tv' }>) {
  const t = useT();
  const { user } = useAuth();
  const canDiscover = !!user && hasPermission(user, 'requests.create');
  const [page, setPage] = useState(1);
  const state = useTrendingPage(type, page, canDiscover);
  const title = type === 'movie' ? t('discover.trendingMovies') : t('discover.trendingShows');

  // Paging is the only page-change path, so the scroll-to-top belongs here
  // rather than in an effect.
  const go = (next: number) => {
    setPage(Math.min(Math.max(1, next), state.totalPages));
    window.scrollTo({ top: 0 });
  };

  return (
    <PageFrame>
      <Link to="/search" search={{ q: '', type: 'all' }} style={BACK_LINK}>
        <Icon name="arrow-left" size={16} thickness={2.2} color="textDim" />
        <Text variant="meta" color="textDim">
          {t('discover.back')}
        </Text>
      </Link>

      <PageHeader.Root>
        <PageHeader.Title icon="flame">{title}</PageHeader.Title>
      </PageHeader.Root>

      {!canDiscover ? (
        <EmptyState.Root icon="mood-empty">
          <EmptyState.Title>{t('discover.empty')}</EmptyState.Title>
        </EmptyState.Root>
      ) : (
        <>
          <Body state={state} />
          {/* totalPages is retained while the next page loads. */}
          <Pager page={page} totalPages={state.totalPages} onGo={go} />
        </>
      )}
    </PageFrame>
  );
}

function Body({ state }: Readonly<{ state: TrendingPageState }>) {
  const t = useT();
  if (state.loading) {
    return (
      <Box mt={32}>
        <SkeletonRow count={12} />
      </Box>
    );
  }
  if (state.entries.length === 0) {
    return (
      <EmptyState.Root icon="mood-empty">
        <EmptyState.Title>{t('discover.noResults')}</EmptyState.Title>
      </EmptyState.Root>
    );
  }
  return (
    <Box mt={32}>
      <TileGrid>
        {(width) =>
          state.entries.map((entry) => (
            <DiscoverCard key={`${entry.kind}-${entry.tmdbId}`} entry={entry} width={width} />
          ))
        }
      </TileGrid>
    </Box>
  );
}

function Pager({
  page,
  totalPages,
  onGo,
}: Readonly<{ page: number; totalPages: number; onGo: (n: number) => void }>) {
  const t = useT();
  if (totalPages <= 1) return null;
  return (
    <Row justify="center" gap={16} mt={40}>
      <Button
        variant="glass"
        size="sm"
        icon="chevron-left"
        label={t('discover.prev')}
        onPress={() => onGo(page - 1)}
        disabled={page <= 1}
      />
      <Text variant="meta" color="textDim" style={PAGE_COUNT}>
        {t('discover.pageOf', { page: String(page), total: String(totalPages) })}
      </Text>
      <Button
        variant="glass"
        size="sm"
        iconRight="chevron-right"
        label={t('discover.next')}
        onPress={() => onGo(page + 1)}
        disabled={page >= totalPages}
      />
    </Row>
  );
}
