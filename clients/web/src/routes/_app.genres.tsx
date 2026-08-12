import {
  collectGenres,
  type GenreCount,
  genreAccent,
  genreColors,
  genreShowcases,
  genreTint,
  sizedImageUrl,
} from '@kroma/core';
import { useT } from '@kroma/ui';
import { Box, EmptyState, PageHeader, Text } from '@kroma/ui/kit';

import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useMemo } from 'react';
import { isAuthed } from '#web/shared/lib/api';
import { catalogQueries } from '#web/shared/lib/queries';
import { Image, PAGE_MAIN, SkeletonRow } from '#web/shared/ui';

export const Route = createFileRoute('/_app/genres')({
  loader: async ({ context: { queryClient } }) => {
    if (!isAuthed()) return;
    await Promise.all([
      queryClient.ensureQueryData(catalogQueries.moviesView()),
      queryClient.ensureQueryData(catalogQueries.showsView()),
    ]);
  },
  pendingComponent: GenresPending,
  component: GenresPage,
});

function GenresPending() {
  const t = useT();
  return (
    <main className={PAGE_MAIN}>
      <PageHeader.Root>
        <PageHeader.Title>{t('nav.genres')}</PageHeader.Title>
      </PageHeader.Root>
      <Box mt={24}>
        <SkeletonRow count={10} />
      </Box>
    </main>
  );
}

function GenresPage() {
  const t = useT();
  const { data: movies } = useSuspenseQuery(catalogQueries.moviesView());
  const { data: shows } = useSuspenseQuery(catalogQueries.showsView());

  // Genres are derived from the whole catalogue (movies + shows), already
  // localized server-side, ranked most-common first; each card is fronted by
  // the genre's best-rated backdrop from the library.
  const catalogue = useMemo(() => [...movies, ...shows], [movies, shows]);
  const genres = useMemo(() => collectGenres(catalogue), [catalogue]);
  const showcases = useMemo(() => genreShowcases(catalogue), [catalogue]);

  return (
    <main className={PAGE_MAIN}>
      <PageHeader.Root>
        <PageHeader.Title>{t('nav.genres')}</PageHeader.Title>
      </PageHeader.Root>
      {genres.length === 0 ? (
        <EmptyState.Root icon="category">
          <EmptyState.Title>{t('genres.empty')}</EmptyState.Title>
        </EmptyState.Root>
      ) : (
        <Box mt={24}>
          <div className="genre-grid">
            {genres.map((g) => (
              <GenreTile
                key={g.name}
                genre={g}
                count={t('person.titleCount', { count: g.count })}
                backdrop={showcases.get(g.name)?.backdrop ?? null}
              />
            ))}
          </div>
        </Box>
      )}
    </main>
  );
}

function GenreTile({
  genre,
  count,
  backdrop,
}: Readonly<{ genre: GenreCount; count: string; backdrop: string | null }>) {
  const [c1, c2] = genreColors(genre.name);
  return (
    <Link
      to="/genre/$genre"
      params={{ genre: genre.name }}
      className="genre-tile"
      style={{ background: `linear-gradient(150deg, ${c1}, ${c2})` }}
    >
      <Image
        src={backdrop ? sizedImageUrl(backdrop, 420) : null}
        fit="cover"
        position="50% 25%"
        fill
        className="genre-tile-art"
      />
      <div style={{ position: 'absolute', inset: 0, background: genreTint(genre.name) }} />
      <Box
        absolute
        left={{ base: 16, md: 20 }}
        right={{ base: 16, md: 20 }}
        bottom={{ base: 14, md: 16 }}
      >
        <Box w={24} h={4} mb={6} radius="pill" bg={genreAccent(genre.name)} />
        <Text variant="cardTitle" color="white">
          {genre.name}
        </Text>
        <Text variant="meta" color="white/70" mt={2}>
          {count}
        </Text>
      </Box>
    </Link>
  );
}
