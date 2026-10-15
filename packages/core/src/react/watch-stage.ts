import type {
  DownloadId,
  WatchableApi,
  WatchableProbe,
  WatchableTicket,
} from '@kromatv/client/watchable';
import { useMemo, useState } from 'react';
import type { WatchableTarget } from '../watchable';
import {
  downloadStage,
  type Settled,
  WATCH_UNSUPPORTED,
  type WatchReady,
  type WatchStage,
} from '../watchable-stage';
import { type FileRead, useFileAnswer } from './file-answer';

const PROBE_RETRY_MS = 1_500;
const WHILE_PENDING = (answer: unknown): boolean => answer === 'pending';
const NEVER = (): boolean => false;

function useSettled<T>(
  read: FileRead<T | 'pending'> | undefined,
  target: WatchableTarget | null,
  asksAgain: (answer: Settled<T>) => boolean,
): Settled<T> {
  const settling = useMemo<FileRead<Settled<T>> | undefined>(
    () => (read ? (id, file) => read(id, file).catch((): Settled<T> => 'failed') : undefined),
    [read],
  );
  return useFileAnswer<Settled<T>>({
    read: settling,
    target,
    none: 'pending',
    everyMs: PROBE_RETRY_MS,
    asksAgain,
  });
}

export interface WatchStageOptions {
  watchable: Pick<WatchableApi, 'probe' | 'ticket'> | null | undefined;
  target: WatchableTarget | null;
  release?: string | null;
  downloadId?: DownloadId | null;
}

export function useWatchStage(opts: Readonly<WatchStageOptions>): WatchStage {
  const { watchable, target, release = null, downloadId = null } = opts;
  const probe = useSettled<WatchableProbe>(watchable?.probe, target, WHILE_PENDING);
  const ticket = useSettled<WatchableTicket>(watchable?.ticket, target, NEVER);
  if (watchable === null) return WATCH_UNSUPPORTED;
  return downloadStage({ downloadId, release, target, probe, ticket });
}

/**
 * The first stage that could be played, kept whatever `stage` says afterwards:
 * a download that finishes leaves the listing, and the picture must not leave
 * with it.
 */
export function usePlayableStage(stage: WatchStage): WatchReady | null {
  const [playable, setPlayable] = useState<WatchReady | null>(null);
  if (stage.stage === 'ready' && playable === null) setPlayable(stage);
  return playable;
}
