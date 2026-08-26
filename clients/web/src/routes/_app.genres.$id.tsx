import {
  compareTitles,
  genreLabel,
  genreOfSegment,
  genreSegment,
  hasGenre,
  isSortMode,
  type Sortable,
  type SortMode,
} from '@kroma/core';
import { useT } from '@kroma/ui';
import { Box, EmptyState, genreIcon, PageHeader } from '@kroma/ui/kit';

import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { useMemo } from 'react';
import { BrowseBar } from '#web/features/catalog/browse-bar';
import { type CatalogEntry, CatalogGrid } from '#web/features/catalog/cards';
import { isAuthed } from '#web/shared/lib/api';

import { catalogQueries } from '#web/shared/lib/queries';
import { PageFrame, SkeletonRow } from '#web/shared/ui';

interface GenreSearch {
  sort?: SortMode;
}

export const Route = createFileRoute('/_app/genres/$id')({
  validateSearch: (s: Record<string, unknown>): GenreSearch =>
    isSortMode(s.sort) ? { sort: s.sort } : {},
  // A slug and a display name are both bookmarkable: `/genre/Family` and
  // `/genre/family` both predate the id and may sit in a history.
  beforeLoad: ({ params, search }) => {
    const slug = genreOfSegment(params.id);
    if (!slug) throw redirect({ to: '/genres', replace: true });
    const canonical = genreSegment(slug);
    if (canonical !== params.id) {
      throw redirect({ to: '/genres/$id', params: { id: canonical }, search, replace: true });
    }
  },
  loader: async ({ context: { queryClient } }) => {
    if (!isAuthed()) return;
    await Promise.all([
      queryClient.ensureQueryData(catalogQueries.moviesView()),
      queryClient.ensureQueryData(catalogQueries.showsView()),
    ]);
  },
  pendingComponent: GenrePending,
  component: GenrePage,
});

function GenreHeader({ genre }: Readonly<{ genre: string }>) {
  const t = useT();
  const navigate = useNavigate();
  return (
    <PageHeader.Root>
      <PageHeader.Back label={t('nav.genres')} onPress={() => void navigate({ to: '/genres' })} />
      <PageHeader.Title icon={genreIcon(genre)}>{genreLabel(t, genre)}</PageHeader.Title>
    </PageHeader.Root>
  );
}

function GenrePending() {
  const genre = genreOfSegment(Route.useParams().id);
  return (
    <PageFrame>
      <GenreHeader genre={genre} />
      <Box mt={24}>
        <SkeletonRow count={14} />
      </Box>
    </PageFrame>
  );
}

function GenrePage() {
  const t = useT();
  const genre = genreOfSegment(Route.useParams().id);
  const { sort = 'added' } = Route.useSearch();
  const navigate = Route.useNavigate();
  const { data: movies } = useSuspenseQuery(catalogQueries.moviesView());
  const { data: shows } = useSuspenseQuery(catalogQueries.showsView());

  // Every movie + show carrying this genre, mixed and ordered by the chosen sort.
  const entries = useMemo<CatalogEntry[]>(() => {
    const matched: { entry: CatalogEntry; item: Sortable }[] = [
      ...movies
        .filter((m) => hasGenre(m, genre))
        .map((m) => ({ entry: { kind: 'movie' as const, movie: m }, item: m })),
      ...shows
        .filter((s) => hasGenre(s, genre))
        .map((s) => ({ entry: { kind: 'show' as const, show: s }, item: s })),
    ];
    const cmp = compareTitles(sort);
    return [...matched].sort((a, b) => cmp(a.item, b.item)).map((x) => x.entry);
  }, [movies, shows, genre, sort]);

  return (
    <PageFrame>
      <GenreHeader genre={genre} />
      {entries.length === 0 ? (
        <EmptyState.Root icon="category">
          <EmptyState.Title>{t('search.noResults')}</EmptyState.Title>
        </EmptyState.Root>
      ) : (
        <>
          <BrowseBar
            sort={sort}
            onSort={(mode) => navigate({ search: (p) => ({ ...p, sort: mode }) })}
            genres={[]}
            onGenre={() => {}}
          />
          <CatalogGrid entries={entries} />
        </>
      )}
    </PageFrame>
  );
}
