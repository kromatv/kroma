import type { KromaClient } from '@kromatv/client';
import type { WatchableProbe, WatchItem } from '@kromatv/client/watchable';
import { usePlaybackHeartbeat } from '@kromatv/ui';
import { useMemo, useState } from 'react';
import { watchPlan } from '#tv/features/playback/player/backend';
import type { WatchPlayback } from '#tv/features/playback/watch/useWatchPlayback';

/** Keeps a file of a watch download on the admin's "now playing" while this
 * television plays it, and pauses it once an admin stops it: the message to
 * show from then on, empty for the default one, null before. */
export function useWatchSession({
  client,
  item,
  probe,
  pb,
  audioLabel,
}: Readonly<{
  client: KromaClient;
  item: WatchItem;
  probe: WatchableProbe;
  pb: WatchPlayback;
  audioLabel: string | undefined;
}>): string | null {
  const [stopped, setStopped] = useState<string | null>(null);
  const plan = useMemo(() => watchPlan(probe), [probe]);
  usePlaybackHeartbeat({
    client,
    enabled: client.hasAuth,
    eventsToken: () => client.sessionToken,
    subject: { watch: item },
    durationMs: probe.durationMs,
    getPosition: () => pb.cur,
    getState: () => {
      if (!pb.playing) return 'paused';
      return pb.waiting ? 'buffering' : 'playing';
    },
    getAudio: () => audioLabel,
    pingSignal: `${pb.playing}|${pb.waiting}|${audioLabel ?? ''}`,
    mode: plan.playbackMode,
    player: 'KROMA TV',
    device: plan.deviceLabel,
    eventsBaseUrl: client.baseUrl,
    idPrefix: 'tv',
    onTerminated: (message) => {
      pb.engineRef.current?.pause();
      setStopped(message.trim());
    },
  });
  return stopped;
}
