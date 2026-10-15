import type { DownloadId, WatchableApi, WatchableProgress } from '@kromatv/client/watchable';
import type { WatchableTarget } from '../watchable';
import type { WatchReady, WatchStage } from '../watchable-stage';
import { useWatchProgress } from './watch-progress';
import { usePlayableStage, useWatchStage } from './watch-stage';

const WAITING_MS = 2_000;
const PLAYING_MS = 5_000;

export interface WatchScreenOptions {
  watchable: WatchableApi | null | undefined;
  target: WatchableTarget | null;
  release?: string | null;
  downloadId?: DownloadId | null;
}

export interface WatchScreen {
  stage: WatchStage;
  playable: WatchReady | null;
  progress: WatchableProgress | null;
  target: WatchableTarget | null;
}

/**
 * `playable` and the `target` it names keep their identity for as long as the
 * file does, so a player built from them is built once.
 */
export function useWatchScreen(opts: Readonly<WatchScreenOptions>): WatchScreen {
  const { watchable, target, release = null, downloadId = null } = opts;
  const stage = useWatchStage({ watchable, target, release, downloadId });
  const playable = usePlayableStage(stage);
  const followed = playable?.target ?? target;
  const progress = useWatchProgress({
    watchable,
    target: followed,
    everyMs: playable ? PLAYING_MS : WAITING_MS,
  });
  return { stage, playable, progress, target: followed };
}
