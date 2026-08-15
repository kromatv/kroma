import { compareTitles, hasGenre, posterColors, type SortMode } from '@kroma/core';
import { useT } from '@kroma/ui';
import { Box, Text, useFocusNav } from '@kroma/ui/kit';
import { useEffect, useMemo, useState } from 'react';
import { useConnection } from '#tv/app/providers/connection';
import { useClient, useNav, useParams } from '#tv/app/router';
import {
  AMBIENT_FALLBACK,
  AmbientBackdrop,
  type CatalogEntry as Entry,
  entryBackdrop,
  entryPoster,
} from '#tv/features/catalog/home/AmbientBackdrop';
import { type GridCard, PosterGrid } from '#tv/features/catalog/home/PosterGrid';
import { EMPTY, TITLE } from '#tv/features/catalog/screenStyle';

// Best-known titles first (rating, then year) the same ranking as the person grid.
const SORT: SortMode = 'rating';

/** Every movie + show in one genre (reached from {@link TvGenres}). Filters the
 * already-loaded catalogue locally, ranked best-rated first, with the browse
 * screens' ambient backdrop following the focused tile. */
export function TvGenreGrid() {
  const { name } = useParams('genre');
  const { movies, shows } = useConnection();
  const client = useClient();
  const t = useT();
  const nav = useNav();
  useFocusNav({ onBack: nav.back, resetKey: name });

  const [focusId, setFocusId] = useState<string | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: name is an intentional re-run key (a genre switch clears the focus echo), not read inside the effect
  useEffect(() => setFocusId(null), [name]);

  const entries = useMemo<Entry[]>(() => {
    const tagged: Entry[] = [
      ...movies.filter((m) => hasGenre(m, name)).map((m): Entry => ({ kind: 'movie', item: m })),
      ...shows.filter((s) => hasGenre(s, name)).map((s): Entry => ({ kind: 'show', item: s })),
    ];
    const cmp = compareTitles(SORT);
    return tagged.sort((a, b) => cmp(a.item, b.item));
  }, [movies, shows, name]);

  const cards = useMemo<GridCard[]>(
    () =>
      entries.map((e) => ({
        id: e.item.id,
        title: e.item.title,
        poster: (width: number) => entryPoster(client, e, width),
        colors: posterColors(e.item.id),
        progress: e.kind === 'show' ? (e.item.progress ?? null) : null,
        onClick: () =>
          e.kind === 'movie' ? nav.go('movie', { item: e.item }) : nav.go('show', { show: e.item }),
        onFocus: () => setFocusId(e.item.id),
      })),
    [entries, client, nav],
  );

  const focused = useMemo<Entry | null>(
    () => entries.find((e) => e.item.id === focusId) ?? entries[0] ?? null,
    [entries, focusId],
  );
  const backdrop = entryBackdrop(client, focused);

  return (
    <Box fill bg="bg" overflow="hidden" isolate>
      <AmbientBackdrop
        src={backdrop}
        colors={focused ? posterColors(focused.item.id) : AMBIENT_FALLBACK}
      />
      <Box px={64} pt={112} pb={24} gap={8}>
        <Text variant="overlineTv" color="accentText">
          {t('nav.genres')}
        </Text>
        <Text variant="hero" style={TITLE}>
          {name}
        </Text>
        <Text variant="labelTv" color="textMuted">
          {t('person.titleCount', { count: cards.length })}
        </Text>
      </Box>

      {cards.length ? (
        <PosterGrid cards={cards} />
      ) : (
        <Box flex center px={64}>
          <Text style={EMPTY} color="textDim">
            {t('genres.empty')}
          </Text>
        </Box>
      )}
    </Box>
  );
}
