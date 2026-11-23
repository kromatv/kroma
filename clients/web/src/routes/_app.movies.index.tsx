import { useT } from '@kromatv/ui';
import { Box } from '@kromatv/ui/kit';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { BrowseTitle } from '#web/features/catalog/browse-hero.component';
import { BrowseScreen } from '#web/features/catalog/browse-screen.component';
import { validateBrowseSearch } from '#web/features/catalog/browse-search';
import { MovieGrid } from '#web/features/catalog/cards.component';
import { isAuthed } from '#web/shared/lib/api';
import { useWebRuntime } from '#web/shared/lib/web-runtime';

import { PageFrame, SkeletonRow } from '#web/shared/ui';

export const Route = createFileRoute('/_app/movies/')({
  validateSearch: validateBrowseSearch,
  loader: async ({ context: { runtime: webRuntime, queryClient } }) => {
    if (!isAuthed()) {
      return;
    }
    await queryClient.ensureQueryData(webRuntime.queries.catalogQueries.moviesView());
  },
  pendingComponent: MoviesPending,
  component: MoviesPage,
});

function MoviesPending() {
  const t = useT();
  return (
    <PageFrame>
      <BrowseTitle>{t('nav.films')}</BrowseTitle>
      <Box mt={24}>
        <SkeletonRow count={14} />
      </Box>
    </PageFrame>
  );
}

function MoviesPage() {
  const webRuntime = useWebRuntime();

  const t = useT();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const { data: movies } = useSuspenseQuery(webRuntime.queries.catalogQueries.moviesView());

  return (
    <BrowseScreen
      heading={t('nav.films')}
      items={movies}
      countKey="browse.count.movies"
      emptyIcon="movie"
      emptyTitle={t('content.filmsEmpty')}
      search={search}
      onSearch={(next, opts) =>
        navigate({ search: (p) => ({ ...p, ...next }), resetScroll: opts?.resetScroll })
      }
      renderGrid={(view) => <MovieGrid movies={view} />}
    />
  );
}
