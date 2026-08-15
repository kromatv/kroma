import type { Metadata } from '@kroma/core';
import { creditsPerson, personInvolvement, posterColors, roleLabels } from '@kroma/core';
import { useT } from '@kroma/ui';
import { Box, Text, useFocusNav } from '@kroma/ui/kit';
import { useMemo } from 'react';
import { useConnection } from '#tv/app/providers/connection';
import { useClient, useNav, useParams } from '#tv/app/router';
import { type GridCard, PosterGrid } from '#tv/features/catalog/home/PosterGrid';
import { PersonHeader } from '#tv/features/catalog/person/PersonHeader';
import { usePersonDetail } from '#tv/features/catalog/person/usePersonDetail';
import { EMPTY } from '#tv/features/catalog/screenStyle';

/** Everything one cast/crew person is credited in. The filmography is filtered
 * out of the already-loaded catalogue (no request); the biography comes from the
 * metadata provider and lands a moment later. */
export function TvPerson() {
  const { name } = useParams('person');
  const { movies, shows } = useConnection();
  const client = useClient();
  const t = useT();
  const nav = useNav();
  useFocusNav({ onBack: nav.back, resetKey: name });

  const { cards, involvement } = useMemo(() => {
    const mine = (meta?: Metadata | null) => creditsPerson(meta, name);
    const rank = (a: { rating: number; year: number }, b: { rating: number; year: number }) =>
      b.rating - a.rating || b.year - a.year;

    const matchedMovies = movies.filter((m) => mine(m.metadata));
    const matchedShows = shows.filter((s) => mine(s.metadata));

    const movieCards = matchedMovies.map((m) => ({
      sort: { rating: m.metadata?.rating ?? 0, year: m.year ?? 0 },
      card: {
        id: m.id,
        title: m.title,
        poster: (width: number) => client.posterFor(m, width),
        colors: posterColors(m.id),
        onClick: () => nav.go('movie', { item: m }),
      } satisfies GridCard,
    }));
    const showCards = matchedShows.map((s) => ({
      sort: { rating: s.metadata?.rating ?? 0, year: s.year ?? 0 },
      card: {
        id: s.id,
        title: s.title,
        poster: (width: number) => client.showPosterFor(s, width),
        colors: posterColors(s.id),
        onClick: () => nav.go('show', { show: s }),
      } satisfies GridCard,
    }));

    const cards = [...movieCards, ...showCards]
      .sort((a, b) => rank(a.sort, b.sort))
      .map((c) => c.card);
    const metas = [...matchedMovies, ...matchedShows].map((it) => it.metadata);
    return { cards, involvement: personInvolvement(metas, name) };
  }, [movies, shows, name, client, nav]);

  const detail = usePersonDetail(name);
  // The provider's portrait is the better one; the credit's photo is the instant
  // one.
  const photo = client.resolveArt(detail?.profileUrl ?? involvement.profileUrl, PORTRAIT_W);
  const roles = roleLabels(t, involvement);

  return (
    <Box fill bg="bg" overflow="hidden">
      <PersonHeader
        name={detail?.name ?? name}
        roles={roles}
        photo={photo}
        titleCount={cards.length}
        detail={detail}
      />

      {cards.length ? (
        <PosterGrid cards={cards} />
      ) : (
        <Box flex center px={64}>
          <Text style={EMPTY} color="textDim">
            {t('person.empty')}
          </Text>
        </Box>
      )}
    </Box>
  );
}

const PORTRAIT_W = 220;
