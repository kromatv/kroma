import { useT } from '@kroma/ui';
import { Box, Button, EmptyState, If } from '@kroma/ui/kit';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { MoviePoster, ShowPoster } from '#web/features/catalog/cards';
import {
  filterSavedTitles,
  SAVED_TAB_COPY,
  type SavedFilter,
  type SavedSort,
  type SavedSource,
  type SavedTab,
  type SavedTitle,
  type SavedTitles,
  savedFacets,
  sortSavedTitles,
} from '#web/features/catalog/saved-titles';
import { SavedTitlesBar } from '#web/features/catalog/saved-titles-bar';
import { SavedTitlesHero } from '#web/features/catalog/saved-titles-hero';
import { TileGrid } from '#web/features/catalog/tile-grid';
import { useSavedTitles } from '#web/features/catalog/use-saved-titles';
import { DiscoverCard } from '#web/features/requests/discover-card';
import { isAuthed } from '#web/shared/lib/api';
import { useMyList } from '#web/shared/lib/mylist';
import { catalogQueries } from '#web/shared/lib/queries';
import { useWatched } from '#web/shared/lib/watched';
import { PAGE_MAIN, SkeletonRow } from '#web/shared/ui';
import { TileCaption } from '#web/shared/ui/tile-caption';

const NO_FILTER: SavedFilter = { kind: 'all', unavailableOnly: false };

const NO_TITLES: readonly SavedTitle[] = [];

export const Route = createFileRoute('/_app/mylist')({
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
  return (
    <main className={PAGE_MAIN}>
      <SavedTitlesHero tab="toWatch" titles={NO_TITLES} />
      <SkeletonRow count={10} />
    </main>
  );
}

type LibrarySource = Exclude<SavedSource, { from: 'discover' }>;

function LibraryPoster({ source, width }: Readonly<{ source: LibrarySource; width: number }>) {
  if (source.from === 'movie') return <MoviePoster item={source.movie} width={width} />;
  return <ShowPoster show={source.show} width={width} />;
}

function SavedTile({ title, width }: Readonly<{ title: SavedTitle; width: number }>) {
  const { source } = title;
  if (source.from === 'discover') return <DiscoverCard entry={source.entry} width={width} />;
  return (
    <>
      <LibraryPoster source={source} width={width} />
      <TileCaption title={title.title} kind={title.kind} year={title.year} rating={title.rating} />
    </>
  );
}

function SavedGrid({ titles }: Readonly<{ titles: readonly SavedTitle[] }>) {
  return (
    <div className="captioned-grid">
      <TileGrid>
        {(width) =>
          titles.map((title) => <SavedTile key={title.key} title={title} width={width} />)
        }
      </TileGrid>
    </div>
  );
}

function NoMatches({ onClear }: Readonly<{ onClear: () => void }>) {
  const t = useT();
  return (
    <EmptyState.Root size="sm" icon="filter">
      <EmptyState.Title>{t('search.noResults')}</EmptyState.Title>
      <EmptyState.Actions>
        <Button size="sm" variant="glass" label={t('common.clear')} onPress={onClear} />
      </EmptyState.Actions>
    </EmptyState.Root>
  );
}

function TabEmpty({ tab }: Readonly<{ tab: SavedTab }>) {
  const t = useT();
  const navigate = useNavigate();
  const copy = SAVED_TAB_COPY[tab];
  return (
    <EmptyState.Root icon={copy.icon}>
      <EmptyState.Title>{t(copy.emptyTitle)}</EmptyState.Title>
      <EmptyState.Hint>{t(copy.emptyHint)}</EmptyState.Hint>
      <EmptyState.Actions>
        <Button
          icon="search"
          label={t('requests.myEmptyCta')}
          onPress={() => navigate({ to: '/search', search: { q: '', type: 'all' } })}
        />
      </EmptyState.Actions>
    </EmptyState.Root>
  );
}

interface SavedListProps {
  list: SavedTitles;
  tab: SavedTab;
  onTab: (tab: SavedTab) => void;
}

function SavedList({ list, tab, onTab }: Readonly<SavedListProps>) {
  const [filter, setFilter] = useState<SavedFilter>(NO_FILTER);
  const [sort, setSort] = useState<SavedSort>('recent');
  const facets = useMemo(() => savedFacets(list.titles), [list.titles]);
  const view = useMemo(
    () => sortSavedTitles(filterSavedTitles(list.titles, filter), sort),
    [list.titles, filter, sort],
  );

  return (
    <Box mt={28}>
      <SavedTitlesBar
        tab={tab}
        onTab={onTab}
        facets={facets}
        filter={filter}
        onFilter={setFilter}
        sort={sort}
        onSort={setSort}
      />
      <If
        condition={facets.total > 0}
        fallback={
          <If condition={list.settled}>
            <TabEmpty tab={tab} />
          </If>
        }
      >
        <If
          condition={view.length > 0}
          fallback={<NoMatches onClear={() => setFilter(NO_FILTER)} />}
        >
          <SavedGrid titles={view} />
        </If>
      </If>
    </Box>
  );
}

function isEmpty(list: SavedTitles): boolean {
  return list.settled && list.titles.length === 0;
}

function MyListPage() {
  const [tab, setTab] = useState<SavedTab>('toWatch');
  const { data: movies } = useSuspenseQuery(catalogQueries.moviesView());
  const { data: shows } = useSuspenseQuery(catalogQueries.showsView());
  const { ids: myListIds, ready: myListReady } = useMyList();
  const { ids: watchedIds, ready: watchedReady } = useWatched();

  const movieById = useMemo(() => new Map(movies.map((movie) => [movie.id, movie])), [movies]);
  const showById = useMemo(() => new Map(shows.map((show) => [show.id, show])), [shows]);

  const toWatch = useSavedTitles(myListIds, myListReady, movieById, showById);
  const watched = useSavedTitles(watchedIds, watchedReady, movieById, showById);

  const lists: Record<SavedTab, SavedTitles> = { toWatch, watched };
  const active = lists[tab];
  const nothingSaved = isEmpty(toWatch) && isEmpty(watched);

  return (
    <main className={PAGE_MAIN}>
      <SavedTitlesHero tab={tab} titles={active.titles} />
      <If
        condition={nothingSaved}
        fallback={<SavedList key={tab} list={active} tab={tab} onTab={setTab} />}
      >
        <TabEmpty tab="toWatch" />
      </If>
    </main>
  );
}
