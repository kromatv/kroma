// Search results: "Dans votre bibliotheque" (local catalog hits) + "A
// decouvrir" (TMDB, gated), each a counted grid. Skeletons while loading, a
// friendly empty state when nothing matches.

import { posterColors, type SearchHit } from '@kroma/core';
import { useT } from '@kroma/ui';
import { Box, EmptyState, Row, Text } from '@kroma/ui/kit';

import { useNavigate } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { DiscoverCard } from '#web/features/requests/discover-card';
import type { DiscoverSearchState } from '#web/features/requests/use-discover-search';
import { useAuth } from '#web/shared/lib/auth';
import { POSTER_GRID, SkeletonRow } from '#web/shared/ui';
import { Poster } from '#web/shared/ui/poster';

const COUNT = { fontVariant: ['tabular-nums' as const] };

function Section({
  title,
  count,
  children,
}: Readonly<{ title: string; count: number; children: ReactNode }>) {
  return (
    <section style={BAND}>
      {/* Still an <h2>: <Text accessibilityRole="header"> can only render an h1. */}
      <h2 style={HEADING}>
        <Row align="baseline" gap={10} mb={16}>
          <Text variant="title">{title}</Text>
          <Text variant="meta" color="textDim" style={COUNT}>
            {count}
          </Text>
        </Row>
      </h2>
      <div className={POSTER_GRID}>{children}</div>
    </section>
  );
}

const BAND = { marginBottom: 36, animation: 'fade-in .25s var(--ease-out)' } as const;

const HEADING = { margin: 0 } as const;

function LocalHit({ hit }: Readonly<{ hit: SearchHit }>) {
  const { client } = useAuth();
  const navigate = useNavigate();
  if (hit.type === 'show') {
    const show = hit.show;
    return (
      <Poster
        title={show.title}
        colors={posterColors(show.id)}
        poster={client.showPosterFor(show)}
        onClick={() => navigate({ to: '/show/$id', params: { id: show.id } })}
      />
    );
  }
  const item = hit.item;
  // Episodes route to their show; movies to their own fiche.
  const to = hit.type === 'episode' && item.showId ? '/show/$id' : '/movie/$id';
  const id = hit.type === 'episode' && item.showId ? item.showId : item.id;
  return (
    <Poster
      title={item.title}
      colors={posterColors(item.id)}
      poster={client.posterFor(item)}
      onClick={() => navigate({ to, params: { id } })}
    />
  );
}

export function SearchResults({ state }: Readonly<{ state: DiscoverSearchState }>) {
  const t = useT();

  if (state.loading) {
    return (
      <Box mt={32}>
        <SkeletonRow count={10} />
      </Box>
    );
  }

  const nothing = state.local.length === 0 && state.discover.length === 0;
  if (nothing) {
    return (
      <EmptyState.Root
        icon="mood-empty"
        title={t('discover.noResults')}
        hint={t('discover.noResultsHint')}
      />
    );
  }

  return (
    <Box mt={28}>
      {state.local.length > 0 ? (
        <Section title={t('discover.sectionLibrary')} count={state.local.length}>
          {state.local.map((hit) => {
            // Stable, unique key from the hit's own id (show vs item/episode).
            const id = hit.type === 'show' ? hit.show.id : hit.item.id;
            return <LocalHit key={`${hit.type}-${id}`} hit={hit} />;
          })}
        </Section>
      ) : null}
      {state.canDiscover && state.discover.length > 0 ? (
        <Section title={t('discover.sectionDiscover')} count={state.discover.length}>
          {state.discover.map((entry) => (
            <DiscoverCard key={`${entry.kind}-${entry.tmdbId}`} entry={entry} />
          ))}
        </Section>
      ) : null}
    </Box>
  );
}
