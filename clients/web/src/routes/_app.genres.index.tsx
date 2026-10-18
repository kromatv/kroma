import { collectGenres, genreShowcases } from '@kromatv/core';
import { useT } from '@kromatv/ui';
import { Box, EmptyState, Grid, PageHeader } from '@kromatv/ui/kit';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useMemo } from 'react';
import { useWindowDimensions } from 'react-native';
import { GenreTile } from '#web/features/catalog/genre-tile';
import { isAuthed } from '#web/shared/lib/api';
import { useWebRuntime } from '#web/shared/lib/web-runtime';

import { PageFrame, SkeletonRow } from '#web/shared/ui';

const CELL_SHARE = 0.22;
const CELL_MIN = 176;
const CELL_MAX = 304;
const CELL_GAP = 16;

export const Route = createFileRoute('/_app/genres/')({
  loader: async ({ context: { runtime: webRuntime, queryClient } }) => {
    if (!isAuthed()) return;
    await Promise.all([
      queryClient.ensureQueryData(webRuntime.queries.catalogQueries.moviesView()),
      queryClient.ensureQueryData(webRuntime.queries.catalogQueries.showsView()),
    ]);
  },
  pendingComponent: GenresPending,
  component: GenresPage,
});

function GenresPending() {
  const t = useT();
  return (
    <PageFrame>
      <PageHeader.Root>
        <PageHeader.Title>{t('nav.genres')}</PageHeader.Title>
      </PageHeader.Root>
      <Box mt={24}>
        <SkeletonRow count={10} />
      </Box>
    </PageFrame>
  );
}

function GenresPage() {
  const webRuntime = useWebRuntime();

  const t = useT();
  const { width } = useWindowDimensions();
  const { data: movies } = useSuspenseQuery(webRuntime.queries.catalogQueries.moviesView());
  const { data: shows } = useSuspenseQuery(webRuntime.queries.catalogQueries.showsView());

  const catalogue = useMemo(() => [...movies, ...shows], [movies, shows]);
  const genres = useMemo(() => collectGenres(catalogue), [catalogue]);
  const showcases = useMemo(() => genreShowcases(catalogue), [catalogue]);
  const cellMin = Math.round(Math.min(Math.max(width * CELL_SHARE, CELL_MIN), CELL_MAX));

  return (
    <PageFrame>
      <PageHeader.Root>
        <PageHeader.Title>{t('nav.genres')}</PageHeader.Title>
      </PageHeader.Root>
      {genres.length === 0 ? (
        <EmptyState.Root icon="category">
          <EmptyState.Title>{t('genres.empty')}</EmptyState.Title>
        </EmptyState.Root>
      ) : (
        <Box mt={24}>
          <Grid min={cellMin} gap={CELL_GAP}>
            {genres.map((g) => (
              <GenreTile
                key={g.slug}
                genre={g}
                count={t('person.titleCount', { count: g.count })}
                backdrop={showcases.get(g.slug)?.backdrop ?? null}
              />
            ))}
          </Grid>
        </Box>
      )}
    </PageFrame>
  );
}
