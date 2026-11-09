import { TmdbKind } from '@kromatv/client/discovery';
import { playableTrailer } from '@kromatv/core';
import { Box, styles, useStyles } from '@kromatv/ui/kit';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, redirect, useRouter } from '@tanstack/react-router';
import { useEffect } from 'react';
import { TrailerPlayer } from '#web/features/playback/trailer-player';
import { isAuthed } from '#web/shared/lib/api';
import { useWebRuntime } from '#web/shared/lib/web-runtime';

const sDefinition = styles({ black: { position: 'fixed', inset: 0, bg: 'black' } });

interface TrailerSearch {
  title?: string;
}

export const Route = createFileRoute('/_app/_player/trailer/$kind/$tmdbId')({
  validateSearch: (s: Record<string, unknown>): TrailerSearch => ({
    title: typeof s.title === 'string' ? s.title : undefined,
  }),
  loader: async ({ params, context: { runtime, queryClient } }) => {
    if (!isAuthed()) throw redirect({ to: '/' });
    const kind = TmdbKind.safeParse(params.kind);
    if (!kind.success) throw redirect({ to: '/' });
    await queryClient.ensureQueryData(
      runtime.client.query.trailers.list(kind.data, Number(params.tmdbId)),
    );
  },
  pendingComponent: PendingTrailer,
  component: TrailerPage,
});

function TrailerPage() {
  const { client } = useWebRuntime();
  const { kind, tmdbId } = Route.useParams();
  const { title } = Route.useSearch();
  const router = useRouter();
  const tmdbKind = TmdbKind.parse(kind);
  const { data } = useSuspenseQuery(client.query.trailers.list(tmdbKind, Number(tmdbId)));
  const trailer = playableTrailer(data);
  const close = () => {
    if (router.history.canGoBack()) router.history.back();
    else void router.navigate({ to: '/', replace: true });
  };
  useEffect(() => {
    if (!trailer) close();
  });
  if (!trailer) return <PendingTrailer />;
  return (
    <TrailerPlayer
      key={trailer.video}
      kind={tmdbKind}
      tmdbId={Number(tmdbId)}
      trailer={trailer}
      title={title ?? trailer.name}
      onClose={close}
    />
  );
}

function PendingTrailer() {
  const s = useStyles(sDefinition);
  return <Box style={s.black} />;
}
