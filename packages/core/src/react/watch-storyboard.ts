import type { WatchableApi, WatchableStoryboard } from '@kromatv/client/watchable';
import { useMemo } from 'react';
import type { WatchableTarget } from '../watchable';
import { STORYBOARD_REFETCH_MS, storyboardAsksAgain } from '../watchable-storyboard';
import { type FileRead, useFileAnswer } from './file-answer';

type StoryboardAnswer = WatchableStoryboard | 'pending' | null;

export interface WatchStoryboardOptions {
  watchable: Pick<WatchableApi, 'storyboard'> | null | undefined;
  target: WatchableTarget | null;
}

/**
 * Asked for again every ten seconds until it is complete; null while the module
 * has not begun it and where it offers none.
 */
export function useWatchStoryboard(
  opts: Readonly<WatchStoryboardOptions>,
): WatchableStoryboard | null {
  const { watchable, target } = opts;
  const read = useMemo<FileRead<StoryboardAnswer> | undefined>(
    () => (watchable ? (id, file) => watchable.storyboard(id, file) : undefined),
    [watchable],
  );
  const answer = useFileAnswer<StoryboardAnswer>({
    read,
    target,
    none: null,
    everyMs: STORYBOARD_REFETCH_MS,
    asksAgain: storyboardAsksAgain,
  });
  return answer === 'pending' ? null : answer;
}
