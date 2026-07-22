import { collectGenres, hasGenre, sortTitles } from '@kroma/core';
import { useT } from '@kroma/ui';
import { IconDeviceTv } from '@tabler/icons-react';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useMemo } from 'react';
import { BrowseBar } from '#web/features/catalog/browse-bar';
import { validateBrowseSearch } from '#web/features/catalog/browse-search';
import { ShowGrid } from '#web/features/catalog/cards';
import { isAuthed } from '#web/shared/lib/api';
import { catalogQueries } from '#web/shared/lib/queries';
import { EmptyState, PAGE_MAIN, PAGE_TITLE, SkeletonRow } from '#web/shared/ui';

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
      <h1 className={PAGE_TITLE}>{t('nav.series')}</h1>
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

  const genres = useMemo(() => collectGenres(shows), [shows]);
  const view = useMemo(() => {
    const filtered = genre ? shows.filter((s) => hasGenre(s, genre)) : shows;
    return sortTitles(filtered, sort);
  }, [shows, genre, sort]);

  return (
    <main className={PAGE_MAIN}>
      <h1 className={PAGE_TITLE}>{t('nav.series')}</h1>
      {shows.length === 0 ? (
        <EmptyState
          icon={<IconDeviceTv size={32} stroke={1.5} />}
          title={t('content.seriesEmpty')}
        />
      ) : (
        <>
          <BrowseBar
            sort={sort}
            onSort={(mode) => navigate({ search: (p) => ({ ...p, sort: mode }) })}
            genres={genres}
            genre={genre}
            onGenre={(g) => navigate({ search: (p) => ({ ...p, genre: g }) })}
          />
          {view.length === 0 ? (
            <EmptyState
              icon={<IconDeviceTv size={32} stroke={1.5} />}
              title={t('search.noResults')}
            />
          ) : (
            <ShowGrid shows={view} />
          )}
        </>
      )}
    </main>
  );
}
