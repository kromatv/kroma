import { useT } from '@kroma/ui';
import { Box } from '@kroma/ui/kit';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { BrowseTitle } from '#web/features/catalog/browse-hero';
import { BrowseScreen } from '#web/features/catalog/browse-screen';
import { validateBrowseSearch } from '#web/features/catalog/browse-search';
import { ShowGrid } from '#web/features/catalog/cards';
import { isAuthed } from '#web/shared/lib/api';
import { catalogQueries } from '#web/shared/lib/queries';
import { PageFrame, SkeletonRow } from '#web/shared/ui';

export const Route = createFileRoute('/_app/shows/')({
  validateSearch: validateBrowseSearch,
  loader: async ({ context: { queryClient } }) => {
    if (!isAuthed()) return;
    await queryClient.ensureQueryData(catalogQueries.showsView());
  },
  pendingComponent: ShowsPending,
  component: ShowsPage,
});

function ShowsPending() {
  const t = useT();
  return (
    <PageFrame>
      <BrowseTitle>{t('nav.series')}</BrowseTitle>
      <Box mt={24}>
        <SkeletonRow count={14} />
      </Box>
    </PageFrame>
  );
}

function ShowsPage() {
  const t = useT();
  const { sort = 'added', genre } = Route.useSearch();
  const navigate = Route.useNavigate();
  const { data: shows } = useSuspenseQuery(catalogQueries.showsView());

  return (
    <BrowseScreen
      heading={t('nav.series')}
      items={shows}
      countKey="browse.count.series"
      emptyIcon="device-tv"
      emptyTitle={t('content.seriesEmpty')}
      sort={sort}
      genre={genre}
      onSort={(mode, opts) =>
        navigate({ search: (p) => ({ ...p, sort: mode }), resetScroll: opts?.resetScroll })
      }
      onGenre={(g) => navigate({ search: (p) => ({ ...p, genre: g }) })}
      renderGrid={(view) => <ShowGrid shows={view} />}
    />
  );
}
