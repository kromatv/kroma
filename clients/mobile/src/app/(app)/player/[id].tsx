// The player screen: portrait-first expo-video surface + Kroma chrome. Keeps
// the screen awake, resumes from saved progress,
// reports the playback heartbeat, and autoplays the next episode on end.

import { ItemId } from '@kromatv/client/media';
import { useQuery } from '@tanstack/react-query';
import { useKeepAwake } from 'expo-keep-awake';
import { useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  type ErrorBoundaryProps,
  Redirect,
  useIsFocused,
  useLocalSearchParams,
  useRouter,
} from 'expo-router';
import { useDownloads } from '#mobile/lib/downloads';
import { useT } from '#mobile/lib/i18n';
import { goBack, routeParam } from '#mobile/lib/nav';
import { useClient } from '#mobile/lib/session';
import { PlayerBody } from '#mobile/player/PlayerBody';
import { PlayerStatusScreen } from '#mobile/player/player-status-screen';
import { nativePlaybackFailure, playbackFailureCopy } from '#mobile/player/playback-failure';

const RESUME_MIN_MS = 30_000;
const RESUME_NEAR_END_RATIO = 0.95;

function resumeSec(positionMs: number | undefined, durationMs: number | null): number {
  if (!positionMs || positionMs < RESUME_MIN_MS) return 0;
  if (durationMs && positionMs > durationMs * RESUME_NEAR_END_RATIO) return 0;
  return positionMs / 1000;
}

export default function PlayerRoute() {
  const id = routeParam(useLocalSearchParams<{ id?: string }>().id);
  return id ? (
    <SafeAreaProvider>
      <PlayerScreen key={id} id={ItemId.parse(id)} />
    </SafeAreaProvider>
  ) : (
    <Redirect href="/" />
  );
}

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const t = useT();
  const router = useRouter();
  const failure = nativePlaybackFailure(error);
  const copy = playbackFailureCopy(failure, t);
  return (
    <SafeAreaProvider>
      <PlayerStatusScreen
        {...copy}
        detail={failure.detail}
        onBack={() => goBack(router)}
        onRetry={retry}
      />
    </SafeAreaProvider>
  );
}

function PlayerScreen({ id }: Readonly<{ id: ItemId }>) {
  // `start` (seconds) is set when playback is handed BACK from a TV: the remote
  // knows the exact position, which is better than the last persisted beat.
  const { start } = useLocalSearchParams<{ start?: string }>();
  const handedBack = start ? Number(start) : null;
  const t = useT();
  const client = useClient();
  const router = useRouter();
  const focused = useIsFocused();
  const [lastPosition, setLastPosition] = useState<number | null>(null);
  const [attempt, setAttempt] = useState(0);
  const retryPlayback = (position: number) => {
    setLastPosition(position);
    setAttempt((value) => value + 1);
  };
  useKeepAwake();

  const downloads = useDownloads();
  const dl = downloads.stateFor(id);
  const offline = dl.status === 'done' ? dl.entry : null;

  const item = useQuery({ ...client.query.media.item(id), enabled: !offline });
  const progress = useQuery({
    ...client.query.playback.itemProgress(id),
    staleTime: 0,
    retry: 0,
  });

  if (!focused) return null;

  // A downloaded title plays from its on-device snapshot, network or not.
  if (offline) {
    return (
      <PlayerBody
        key={`${offline.itemId}:${attempt}`}
        item={offline.item}
        startSec={
          lastPosition ??
          handedBack ??
          resumeSec(progress.data?.positionMs, offline.item.durationMs)
        }
        localUri={offline.fileUri}
        offline={offline}
        onRetry={retryPlayback}
        onPosition={setLastPosition}
      />
    );
  }

  if (item.isError) {
    const failure = nativePlaybackFailure(item.error);
    return (
      <PlayerStatusScreen
        {...playbackFailureCopy(failure, t)}
        detail={failure.detail}
        onBack={() => goBack(router)}
        onRetry={() => item.refetch()}
      />
    );
  }

  if (item.isPending || progress.isPending) {
    return (
      <PlayerStatusScreen loading message={t('common.loading')} onBack={() => goBack(router)} />
    );
  }

  return (
    <PlayerBody
      key={`${item.data.id}:${attempt}`}
      item={item.data}
      startSec={
        lastPosition ?? handedBack ?? resumeSec(progress.data?.positionMs, item.data.durationMs)
      }
      onRetry={retryPlayback}
      onPosition={setLastPosition}
    />
  );
}
