import { useT } from '@kroma/ui';
import { Box } from '@kroma/ui/kit';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { BROWSE_TITLE } from '#web/features/catalog/browse-hero';
import { BrowseScreen } from '#web/features/catalog/browse-screen';
import { validateBrowseSearch } from '#web/features/catalog/browse-search';
import { MovieGrid } from '#web/features/catalog/cards';
import { isAuthed } from '#web/shared/lib/api';
import { catalogQueries } from '#web/shared/lib/queries';
import { PAGE_MAIN, SkeletonRow } from '#web/shared/ui';

export const Route = createFileRoute('/_app/films')({
  validateSearch: validateBrowseSearch,
  loader: async ({ context: { queryClient } }) => {
    if (!isAuthed()) return;
    await queryClient.ensureQueryData(catalogQueries.moviesView());
  },
  pendingComponent: FilmsPending,
  component: FilmsPage,
});

function FilmsPending() {
  const t = useT();
  return (
    <main className={PAGE_MAIN}>
      <h1 className={BROWSE_TITLE}>{t('nav.films')}</h1>
      <Box mt={24}>
        <SkeletonRow count={14} />
      </Box>
    </main>
  );
}

function FilmsPage() {
  const t = useT();
  const { sort = 'added', genre } = Route.useSearch();
  const navigate = Route.useNavigate();
  const { data: movies } = useSuspenseQuery(catalogQueries.moviesView());

  return (
    <BrowseScreen
      heading={t('nav.films')}
      items={movies}
      countKey="browse.count.movies"
      emptyIcon="movie"
      emptyTitle={t('content.filmsEmpty')}
      sort={sort}
      genre={genre}
      onSort={(mode, opts) =>
        navigate({ search: (p) => ({ ...p, sort: mode }), resetScroll: opts?.resetScroll })
      }
      onGenre={(g) => navigate({ search: (p) => ({ ...p, genre: g }) })}
      renderGrid={(view) => <MovieGrid movies={view} />}
    />
  );
}
