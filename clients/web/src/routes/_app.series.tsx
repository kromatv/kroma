import { useT } from '@kroma/ui';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { BROWSE_TITLE } from '#web/features/catalog/browse-hero';
import { BrowseScreen } from '#web/features/catalog/browse-screen';
import { validateBrowseSearch } from '#web/features/catalog/browse-search';
import { ShowGrid } from '#web/features/catalog/cards';
import { isAuthed } from '#web/shared/lib/api';
import { catalogQueries } from '#web/shared/lib/queries';
import { PAGE_MAIN, SkeletonRow } from '#web/shared/ui';

export const Route = createFileRoute('/_app/series')({
  validateSearch: validateBrowseSearch,
  loader: async ({ context: { queryClient } }) => {
    if (!isAuthed()) return;
    await queryClient.ensureQueryData(catalogQueries.showsView());
  },
  pendingComponent: SeriesPending,
  component: SeriesPage,
});

function SeriesPending() {
  const t = useT();
  return (
    <main className={PAGE_MAIN}>
      <h1 className={BROWSE_TITLE}>{t('nav.series')}</h1>
      <div className="mt-6">
        <SkeletonRow count={14} />
      </div>
    </main>
  );
}

function SeriesPage() {
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
