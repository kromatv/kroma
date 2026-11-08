import { type MediaCard, type MediaItem, ItemId } from '@kromatv/client/media';
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

const SIMILAR_COUNT = 12;

export const Route = createFileRoute('/_app/movies/$id')({
  loader: async ({ params, context: { runtime: webRuntime, queryClient } }) => {
    // Catalogue is auth-gated: a signed-out deep-link goes to the gate (the
    // AuthGate overlay covers /, and its loader is guarded too).
    if (!isAuthed()) throw redirect({ to: '/' });
    const id = ItemId.parse(params.id);
    const { catalogQueries } = webRuntime.queries;
    await Promise.all([
      queryClient.ensureQueryData(catalogQueries.item(id)),
      queryClient.ensureQueryData(catalogQueries.similar(id)),
    ]);
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
  const { data: similar } = useSuspenseQuery(webRuntime.queries.catalogQueries.similar(id));
  return <MovieDetail item={item} similar={similar.slice(0, SIMILAR_COUNT)} />;
}

function MovieDetail({ item, similar }: Readonly<{ item: MediaItem; similar: MediaCard[] }>) {
  const t = useT();
  const { client, user } = useAuth();
  const view = buildTitleView(client, t, user, { source: 'movie', item, similar, discover: null });
  return <TitleDetail key={item.id} initial={view} />;
}
