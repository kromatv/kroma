// The player screen: full-screen expo-video surface + Kroma chrome. Locks
// landscape on phones, keeps the screen awake, resumes from saved progress,
// reports the playback heartbeat, and autoplays the next episode on end.

import { useQuery } from '@tanstack/react-query';
import { useKeepAwake } from 'expo-keep-awake';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { ErrorView, Loading } from '#mobile/components/ui';
import { useDownloads } from '#mobile/lib/downloads';
import { useT } from '#mobile/lib/i18n';
import { routeParam } from '#mobile/lib/nav';
import { useClient } from '#mobile/lib/session';
import { PlayerBody } from '#mobile/player/PlayerBody';

const RESUME_MIN_MS = 30_000;
const RESUME_NEAR_END_RATIO = 0.95;

function resumeSec(positionMs: number | undefined, durationMs: number | null): number {
  if (!positionMs || positionMs < RESUME_MIN_MS) return 0;
  if (durationMs && positionMs > durationMs * RESUME_NEAR_END_RATIO) return 0;
  return positionMs / 1000;
}

export default function PlayerRoute() {
  const id = routeParam(useLocalSearchParams<{ id?: string }>().id);
  return id ? <PlayerScreen id={id} /> : <Redirect href="/" />;
}

function PlayerScreen({ id }: Readonly<{ id: string }>) {
  // `start` (seconds) is set when playback is handed BACK from a TV: the remote
  // knows the exact position, which is better than the last persisted beat.
  const { start } = useLocalSearchParams<{ start?: string }>();
  const handedBack = start ? Number(start) : null;
  const t = useT();
  const client = useClient();
  useKeepAwake();

  const downloads = useDownloads();
  const dl = downloads.stateFor(id);
  const offline = dl.status === 'done' ? dl.entry : null;

  const item = useQuery({
    queryKey: ['item', id],
    queryFn: () => client.item(id),
    enabled: !offline,
  });
  const progress = useQuery({
    queryKey: ['progress', id],
    queryFn: () => client.itemProgress(id),
    staleTime: 0,
    retry: 0,
  });

  // A downloaded title plays from its on-device snapshot, network or not.
  if (offline) {
    return (
      <PlayerBody
        key={offline.itemId}
        item={offline.item}
        startSec={handedBack ?? resumeSec(progress.data?.positionMs, offline.item.durationMs)}
        localUri={offline.fileUri}
        offline={offline}
      />
    );
  }

  if (item.isPending || progress.isPending) return <Loading label={t('common.loading')} />;
  if (item.isError)
    return (
      <ErrorView
        // Dev builds say WHAT failed; release keeps the friendly copy.
        message={
          __DEV__ && item.error instanceof Error
            ? `${t('error.serverBody')}\n\n[dev] ${item.error.message}`
            : t('error.serverBody')
        }
        retryLabel={t('error.retry')}
        onRetry={() => item.refetch()}
      />
    );

  return (
    <PlayerBody
      key={item.data.id}
      item={item.data}
      startSec={handedBack ?? resumeSec(progress.data?.positionMs, item.data.durationMs)}
    />
  );
}
