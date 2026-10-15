import type { WatchableApi, WatchableProgress } from '@kromatv/client/watchable';
import { useMemo } from 'react';
import type { WatchableTarget } from '../watchable';
import { type FileRead, useFileAnswer } from './file-answer';

const SLICES = 120;
const ALWAYS = (): boolean => true;

export interface WatchProgressOptions {
  watchable: Pick<WatchableApi, 'progress'> | null | undefined;
  target: WatchableTarget | null;
  everyMs: number;
}

export function useWatchProgress(opts: Readonly<WatchProgressOptions>): WatchableProgress | null {
  const { watchable, target, everyMs } = opts;
  const read = useMemo<FileRead<WatchableProgress> | undefined>(
    () => (watchable ? (id, file) => watchable.progress(id, file, SLICES) : undefined),
    [watchable],
  );
  return useFileAnswer<WatchableProgress | null>({
    read,
    target,
    none: null,
    everyMs,
    asksAgain: ALWAYS,
  });
}
