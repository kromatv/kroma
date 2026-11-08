import type { TmdbKind } from '@kromatv/client/discovery';
import { playableTrailer } from '@kromatv/core';
import { useQuery } from '@tanstack/react-query';
import { useKeepAwake } from 'expo-keep-awake';
import {
  type ErrorBoundaryProps,
  Redirect,
  useIsFocused,
  useLocalSearchParams,
  useRouter,
} from 'expo-router';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useT } from '#mobile/lib/i18n';
import { goBack } from '#mobile/lib/nav';
import { useClient } from '#mobile/lib/session';
import { trailerListQuery, trailerRoute } from '#mobile/lib/trailer';
import { PlayerStatusScreen } from '#mobile/player/player-status-screen';
import { TrailerPlayer } from '#mobile/player/trailer-player';

export default function TrailerRoute() {
  const route =
    trailerRoute(useLocalSearchParams<{ kind?: string; tmdbId?: string; title?: string }>());
  return route ? (
    <SafeAreaProvider>
      <TrailerScreen
        key={`${route.kind}:${route.tmdbId}`}
        kind={route.kind}
        tmdbId={route.tmdbId}
        title={route.title}
      />
    </SafeAreaProvider>
  ) : (
    <Redirect href="/" />
  );
}

export function ErrorBoundary({ retry }: ErrorBoundaryProps) {
  const t = useT();
  const router = useRouter();
  return (
    <SafeAreaProvider>
      <PlayerStatusScreen
        message={t('trailer.failed')}
        onBack={() => goBack(router)}
        onRetry={retry}
      />
    </SafeAreaProvider>
  );
}

function TrailerScreen({
  kind,
  tmdbId,
  title,
}: Readonly<{ kind: TmdbKind; tmdbId: number; title: string | null }>) {
  const t = useT();
  const client = useClient();
  const router = useRouter();
  const focused = useIsFocused();
  useKeepAwake();

  const list = useQuery(trailerListQuery(client, kind, tmdbId));
  const trailer = playableTrailer(list.data);
  const missing = list.isSuccess && !trailer;
  useEffect(() => {
    if (missing) goBack(router);
  }, [missing, router]);

  if (!focused) return null;

  if (list.isError) {
    return (
      <PlayerStatusScreen
        message={t('trailer.failed')}
        onBack={() => goBack(router)}
        onRetry={() => void list.refetch()}
      />
    );
  }

  if (!trailer) {
    return (
      <PlayerStatusScreen loading message={t('common.loading')} onBack={() => goBack(router)} />
    );
  }

  return (
    <TrailerPlayer
      key={trailer.video}
      kind={kind}
      tmdbId={tmdbId}
      trailer={trailer}
      title={title ?? trailer.name}
      onClose={() => goBack(router)}
    />
  );
}
