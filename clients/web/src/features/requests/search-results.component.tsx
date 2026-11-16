// Search results: "Dans votre bibliotheque" (local catalog hits) + "A
// decouvrir" (TMDB, gated), each a counted grid. Skeletons while loading, a
// friendly empty state when nothing matches.

import type { PersonHit, SearchHit } from '@kromatv/client/media';
import { episodeTag, personSegment, posterColors, sizedImageUrl } from '@kromatv/core';
import { useT } from '@kromatv/ui';
import {
  Avatar,
  Box,
  classes,
  EmptyState,
  Focusable,
  Row,
  styles,
  Text,
  useStyles,
} from '@kromatv/ui/kit';

import type { ReactNode } from 'react';
import { DiscoverCard } from '#web/features/requests/discover-card.component';
import type { DiscoverSearchState } from '#web/features/requests/use-discover-search.hook';
import { imageUrl } from '#web/shared/lib/api';
import { useAuth } from '#web/shared/lib/auth';
import { SkeletonRow } from '#web/shared/ui';
import { Poster } from '#web/shared/ui/poster.component';
import { EPISODES_ANCHOR } from '#web/shared/lib/show-search';
import { RouteLink } from '#web/shared/ui/route-link.component';
import { TileGrid } from '#web/shared/ui/tile-grid.component';

const sDefinition = styles({
  count: { fontVariant: ['tabular-nums'] },
  band: {
    mb: 36,
    animationKeyframes: 'fade-in',
    animationDuration: '250ms',
    animationTimingFunction: 'var(--ease-out)',
  },
  heading: { m: 0 },
  person: {
    row: true,
    align: 'center',
    gap: 12,
    pl: 6,
    pr: 18,
    py: 6,
    radius: 'pill',
    bg: 'white/6',
    borderWidth: 1,
    borderColor: 'white/10',
    maxW: 280,
  },
});

function Section({
  title,
  count,
  children,
}: Readonly<{ title: string; count: number; children: (width: number) => ReactNode }>) {
  const s = useStyles(sDefinition);

  return (
    <section className={classes(s.band)}>
      {/* Still an <h2>: <Text accessibilityRole="header"> can only render an h1. */}
      <h2 className={classes(s.heading)}>
        <Row align="baseline" gap={10} mb={16}>
          <Text variant="title">{title}</Text>
          <Text variant="meta" color="textDim" style={s.count}>
            {count}
          </Text>
        </Row>
      </h2>
      <TileGrid>{children}</TileGrid>
    </section>
  );
}

function LocalHit({ hit, width }: Readonly<{ hit: SearchHit; width: number }>) {
  const { client } = useAuth();
  if (hit.type === 'show') {
    const show = hit.show;
    return (
      <Poster
        title={show.title}
        colors={posterColors(show.id)}
        poster={client.media.artwork.showPosterFor(show)}
        width={width}
        asChild
      >
        <RouteLink to="/shows/$id" params={{ id: show.id }} />
      </Poster>
    );
  }
  const item = hit.item;
  // Episodes route to their show; movies to their own fiche.
  const episode = hit.type === 'episode' && item.showId ? item.showId : null;
  const to = episode ? '/shows/$id' : '/movies/$id';
  return (
    <Poster
      title={item.episodeTitle ?? item.title}
      // An episode wears its show's poster, so it has to say which one it is.
      genre={episode ? [item.showTitle, episodeTag(item)].filter(Boolean).join(' · ') : undefined}
      colors={posterColors(item.id)}
      poster={client.media.artwork.posterFor(item)}
      width={width}
      asChild
    >
      <RouteLink
        to={to}
        params={{ id: episode ?? item.id }}
        search={episode && item.season !== null ? { season: item.season } : {}}
        hash={episode ? EPISODES_ANCHOR : undefined}
      />
    </Poster>
  );
}

const FACE_W = 56;

function PersonChip({ person }: Readonly<{ person: PersonHit }>) {
  const s = useStyles(sDefinition);
  const t = useT();
  return (
    <Focusable label={person.name} style={s.person} asChild>
      <RouteLink to="/people/$person" params={{ person: personSegment(person) }}>
        <Avatar
          name={person.name}
          src={sizedImageUrl(imageUrl(person.profileUrl ?? null), FACE_W)}
          size={FACE_W}
          circle
        />
        <Box minW={0}>
          <Text variant="label" lines={1}>
            {person.name}
          </Text>
          <Text variant="meta" color="textMuted" lines={1}>
            {t('person.titleCount', { count: person.titles })}
          </Text>
        </Box>
      </RouteLink>
    </Focusable>
  );
}

function People({ people }: Readonly<{ people: readonly PersonHit[] }>) {
  const s = useStyles(sDefinition);
  const t = useT();
  return (
    <section className={classes(s.band)} aria-label={t('search.people')}>
      <h2 className={classes(s.heading)}>
        <Text variant="title" mb={16}>
          {t('search.people')}
        </Text>
      </h2>
      <Row wrap gap={12}>
        {people.map((person) => (
          <PersonChip key={person.tmdbId ?? person.name} person={person} />
        ))}
      </Row>
    </section>
  );
}

function foundNothing({ local, discover, people }: Readonly<DiscoverSearchState>): boolean {
  return local.length === 0 && discover.length === 0 && people.length === 0;
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

  if (foundNothing(state)) {
    return (
      <EmptyState.Root icon="mood-empty">
        <EmptyState.Title>{t('discover.noResults')}</EmptyState.Title>
        <EmptyState.Hint>{t('discover.noResultsHint')}</EmptyState.Hint>
      </EmptyState.Root>
    );
  }

  return (
    <Box mt={28}>
      {state.people.length > 0 ? <People people={state.people} /> : null}
      {state.local.length > 0 ? (
        <Section title={t('discover.sectionLibrary')} count={state.local.length}>
          {(width) =>
            state.local.map((hit) => {
              // Stable, unique key from the hit's own id (show vs item/episode).
              const id = hit.type === 'show' ? hit.show.id : hit.item.id;
              return <LocalHit key={`${hit.type}-${id}`} hit={hit} width={width} />;
            })
          }
        </Section>
      ) : null}
      {state.canDiscover && state.discover.length > 0 ? (
        <Section title={t('discover.sectionDiscover')} count={state.discover.length}>
          {(width) =>
            state.discover.map((entry) => (
              <DiscoverCard key={`${entry.kind}-${entry.tmdbId}`} entry={entry} width={width} />
            ))
          }
        </Section>
      ) : null}
    </Box>
  );
}
