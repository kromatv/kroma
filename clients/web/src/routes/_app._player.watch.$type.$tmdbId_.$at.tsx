import { TmdbKind } from '@kromatv/client/discovery';
import { Box, styles } from '@kromatv/ui/kit';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { loadWatchable, TmdbWatch } from '#web/features/playback/tmdb-watch';
import { episodeAt } from '#web/shared/lib/watch-route';

const s = styles({ black: { position: 'fixed', inset: 0, bg: 'black' } });

export const Route = createFileRoute('/_app/_player/watch/$type/$tmdbId_/$at')({
  loader: async ({ params, context: { queryClient } }) => {
    const at = episodeAt(params.at);
    if (!at) throw redirect({ to: '/search', search: { q: '', type: 'all' } });
    await loadWatchable(queryClient, params, at);
  },
  pendingComponent: () => <Box style={s.black} />,
  component: EpisodeWatchRoute,
});

function EpisodeWatchRoute() {
  const { type, tmdbId, at } = Route.useParams();
  return (
    <TmdbWatch key={at} type={TmdbKind.parse(type)} tmdbId={Number(tmdbId)} at={episodeAt(at)} />
  );
}
