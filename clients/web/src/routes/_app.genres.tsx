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
      <PageHeader.Root title={t('nav.genres')} />
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
      <PageHeader.Root title={t('nav.genres')} />
      {genres.length === 0 ? (
        <EmptyState.Root icon="category" title={t('genres.empty')} />
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
          {genres.map((g) => (
            <GenreTile
              key={g.name}
              genre={g}
              count={t('person.titleCount', { count: g.count })}
              backdrop={showcases.get(g.name)?.backdrop ?? null}
            />
          ))}
        </div>
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
      className="group relative block aspect-video overflow-hidden rounded-2xl border border-white/6 no-underline transition-colors hover:border-accent/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      style={{ background: `linear-gradient(150deg, ${c1}, ${c2})` }}
    >
      <Image
        src={backdrop ? sizedImageUrl(backdrop, 420) : null}
        fit="cover"
        position="50% 25%"
        fill
        className="transition-transform duration-500 group-hover:scale-105"
      />
      <div style={{ position: 'absolute', inset: 0, background: genreTint(genre.name) }} />
      <Box
        absolute
        left={{ base: 16, md: 20 }}
        right={{ base: 16, md: 20 }}
        bottom={{ base: 14, md: 16 }}
      >
        <Box w={24} h={4} mb={6} radius="pill" bg={genreAccent(genre.name)} />
        <div className="font-display text-[16px] font-bold leading-tight tracking-[-.01em] text-white sm:text-[19px]">
          {genre.name}
        </div>
        <Text variant="meta" color="white/70" mt={2}>
          {count}
        </Text>
      </Box>
    </Link>
  );
}
