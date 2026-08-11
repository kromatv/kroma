import { ItemId, ShowId } from '@kroma/core';
import { useT } from '@kroma/ui';
import { EmptyState } from '@kroma/ui/kit';

import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { type CatalogEntry, CatalogGrid } from '#web/features/catalog/cards';
import { isAuthed } from '#web/shared/lib/api';
import { useMyList } from '#web/shared/lib/mylist';
import { catalogQueries } from '#web/shared/lib/queries';
import { PAGE_MAIN, PAGE_TITLE, SkeletonRow } from '#web/shared/ui';

export const Route = createFileRoute('/_app/mylist')({
  // The catalogue is public/SSR while the per-user list hydrates client-side,
  // so everything loads here and the component filters by the user's ids.
  loader: async ({ context: { queryClient } }) => {
    if (!isAuthed()) return;
    await Promise.all([
      queryClient.ensureQueryData(catalogQueries.moviesView()),
      queryClient.ensureQueryData(catalogQueries.showsView()),
    ]);
  },
  pendingComponent: MyListPending,
  component: MyListPage,
});

function MyListPending() {
  const t = useT();
  return (
    <main className={PAGE_MAIN}>
      <h1 className={PAGE_TITLE}>{t('nav.myList')}</h1>
      <div className="mt-6">
        <SkeletonRow count={10} />
      </div>
    </main>
  );
}

function MyListPage() {
  const t = useT();
  const { data: movies } = useSuspenseQuery(catalogQueries.moviesView());
  const { data: shows } = useSuspenseQuery(catalogQueries.showsView());
  const { ids, ready } = useMyList();

  const movieById = new Map(movies.map((m) => [m.id, m]));
  const showById = new Map(shows.map((s) => [s.id, s]));
  const entries: CatalogEntry[] = [];
  for (const id of ids) {
    const movie = movieById.get(ItemId.of(id));
    if (movie) {
      entries.push({ kind: 'movie', movie });
      continue;
    }
    const show = showById.get(ShowId.of(id));
    if (show) entries.push({ kind: 'show', show });
  }

  return (
    <main className={PAGE_MAIN}>
      <h1 className={PAGE_TITLE}>{t('nav.myList')}</h1>
      {ready && entries.length === 0 ? (
        <EmptyState.Root icon="list-details" title={t('content.myListEmpty')} />
      ) : (
        <div className="mt-6">
          <CatalogGrid entries={entries} />
        </div>
      )}
    </main>
  );
}
