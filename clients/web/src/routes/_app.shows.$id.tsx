import { ShowId } from '@kromatv/client/media';
import { useT } from '@kromatv/ui';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { validateShowSearch } from '#web/shared/lib/show-search';
import { TitleDetail } from '#web/features/catalog/title-detail';
import { isAuthed } from '#web/shared/lib/api';
import { useAuth } from '#web/shared/lib/auth';
import { buildTitleView } from '#web/shared/lib/titleView';
import { useCatalogLiveRefresh } from '#web/shared/lib/use-live-refresh';
import { useWebRuntime } from '#web/shared/lib/web-runtime';
import { DetailSkeleton } from '#web/shared/ui';

export const Route = createFileRoute('/_app/shows/$id')({
  validateSearch: validateShowSearch,
  loader: async ({ params, context: { runtime: webRuntime, queryClient } }) => {
    if (!isAuthed()) throw redirect({ to: '/' });
    await queryClient.ensureQueryData(
      webRuntime.queries.catalogQueries.showBundle(ShowId.parse(params.id)),
    );
  },
  pendingComponent: DetailSkeleton,
  component: ShowDetailPage,
});

function ShowDetailPage() {
  const webRuntime = useWebRuntime();

  const t = useT();
  const { client, user } = useAuth();
  const id = ShowId.parse(Route.useParams().id);
  const { season } = Route.useSearch();
  // Re-enrichment (incl. a corrected TMDB match) lands via the event stream.
  useCatalogLiveRefresh('show', id);
  const {
    data: { detail, similarShows, upNext, discover },
  } = useSuspenseQuery(webRuntime.queries.catalogQueries.showBundle(id));
  const view = buildTitleView(client, t, user, {
    source: 'show',
    detail,
    similarShows,
    upNext,
    discover,
  });
  return <TitleDetail key={detail.show.id} initial={view} season={season} />;
}
