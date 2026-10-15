import { TmdbKind } from '@kromatv/client/discovery';
import { Box, styles } from '@kromatv/ui/kit';
import { createFileRoute } from '@tanstack/react-router';
import { loadWatchable, TmdbWatch } from '#web/features/playback/tmdb-watch';

const s = styles({ black: { position: 'fixed', inset: 0, bg: 'black' } });

export const Route = createFileRoute('/_app/_player/watch/$type/$tmdbId')({
  loader: ({ params, context: { queryClient } }) => loadWatchable(queryClient, params),
  pendingComponent: () => <Box style={s.black} />,
  component: TitleWatchRoute,
});

function TitleWatchRoute() {
  const { type, tmdbId } = Route.useParams();
  return <TmdbWatch type={TmdbKind.parse(type)} tmdbId={Number(tmdbId)} at={null} />;
}
