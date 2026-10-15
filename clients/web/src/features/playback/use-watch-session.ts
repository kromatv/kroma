import type { WatchItem } from '@kromatv/client/watchable';
import { useT } from '@kromatv/ui';
import { useState } from 'react';
import { usePlaybackSession } from '#web/features/playback/use-playback-session';
import type { WebController } from '#web/features/playback/use-web-controller';

/** Keeps a file of a watch download on the admin's "now playing" while it
 * plays, and pauses it once an admin stops it: the message to show from then
 * on, null before. */
export function useWatchSession({
  item,
  durationMs,
  web,
  subtitleLabel,
}: Readonly<{
  item: WatchItem;
  durationMs: number | null;
  web: WebController;
  subtitleLabel: string;
}>): string | null {
  const t = useT();
  const [stopped, setStopped] = useState<string | null>(null);
  const { pb, videoRef } = web;
  usePlaybackSession({
    subject: { watch: item },
    durationMs,
    getPosition: pb.getPosition,
    videoRef,
    baseSec: pb.baseSec,
    playing: pb.playing,
    waiting: pb.waiting,
    mode: web.playbackMode,
    audioLabel: web.audioLabel,
    subtitleLabel,
    onTerminated: (message) => {
      videoRef.current?.pause();
      setStopped(message.trim() || t('player.stoppedDefault'));
    },
  });
  return stopped;
}
