import { type MediaCard, type MediaItem, ItemId } from '@kromatv/client/media';
import { genreSlugs } from '@kromatv/core';
import { useT } from '@kromatv/ui';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { TitleDetail } from '#web/features/catalog/title-detail';
import { isAuthed } from '#web/shared/lib/api';
import { useAuth } from '#web/shared/lib/auth';
import { buildTitleView } from '#web/shared/lib/titleView';
import { useCatalogLiveRefresh } from '#web/shared/lib/use-live-refresh';
import { useWebRuntime } from '#web/shared/lib/web-runtime';
import { DetailSkeleton } from '#web/shared/ui';

const ENOUGH_NEIGHBOURS = 3;
const SIMILAR_COUNT = 12;

export const Route = createFileRoute('/_app/movies/$id')({
  loader: async ({ params, context: { runtime: webRuntime, queryClient } }) => {
    // Catalogue is auth-gated: a signed-out deep-link goes to the gate (the
    // AuthGate overlay covers /, and its loader is guarded too).
    if (!isAuthed()) throw redirect({ to: '/' });
    const id = ItemId.parse(params.id);
    const { catalogQueries } = webRuntime.queries;
    const [, neighbours] = await Promise.all([
      queryClient.ensureQueryData(catalogQueries.item(id)),
      queryClient.ensureQueryData(catalogQueries.similar(id)),
    ]);
    if (neighbours.length < ENOUGH_NEIGHBOURS) {
      await queryClient.ensureQueryData(catalogQueries.moviesView());
    }
  },
  pendingComponent: DetailSkeleton,
  component: MovieDetailPage,
});

function MovieDetailPage() {
  const webRuntime = useWebRuntime();

  const id = ItemId.parse(Route.useParams().id);
  // Re-enrichment (incl. a corrected TMDB match) lands via the event stream.
  useCatalogLiveRefresh('item', id);
  const { data: item } = useSuspenseQuery(webRuntime.queries.catalogQueries.item(id));
  const { data: neighbours } = useSuspenseQuery(webRuntime.queries.catalogQueries.similar(id));
  if (neighbours.length >= ENOUGH_NEIGHBOURS) {
    return <MovieDetail item={item} similar={neighbours.slice(0, SIMILAR_COUNT)} />;
  }
  return <MovieDetailByGenre item={item} />;
}

function MovieDetailByGenre({ item }: Readonly<{ item: MediaItem }>) {
  const webRuntime = useWebRuntime();

  const { data: movies } = useSuspenseQuery(webRuntime.queries.catalogQueries.moviesView());
  const genres = new Set(genreSlugs(item.metadata));
  const others = movies.filter((m) => m.id !== item.id);
  const related = others.filter((m) => genreSlugs(m.metadata).some((g) => genres.has(g)));
  const pool = related.length >= ENOUGH_NEIGHBOURS ? related : others;
  return <MovieDetail item={item} similar={pool.slice(0, SIMILAR_COUNT)} />;
}

function MovieDetail({ item, similar }: Readonly<{ item: MediaItem; similar: MediaCard[] }>) {
  const t = useT();
  const { client, user } = useAuth();
  const view = buildTitleView(client, t, user, { source: 'movie', item, similar, discover: null });
  return <TitleDetail key={item.id} initial={view} />;
}
