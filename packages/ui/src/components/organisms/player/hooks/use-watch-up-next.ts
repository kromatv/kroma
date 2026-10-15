import { type WatchableTarget, type WatchNext, watchNextId } from '@kromatv/core';
import { useWatchFollowing, type WatchGuideReader } from '@kromatv/core/react';
import { useMemo } from 'react';
import { useT } from '#ui/services/i18n';
import { type WatchUpNext, watchUpNext } from '../lib/watch-up-next';
import type { UpNextItem } from '../parts/up-next-card';

export interface WatchUpNextParts extends WatchUpNext {
  playNext: (() => void) | undefined;
  playCard: (card: UpNextItem) => void;
}

export interface WatchUpNextParams {
  discovery: WatchGuideReader | null | undefined;
  target: WatchableTarget;
  art: (stillUrl: string | null) => string | null;
  onPlay: (next: WatchNext) => void;
}

/**
 * The next episode of a file still arriving, as the parts the catalogue writes:
 * `next` and `playNext` for `<Player.Credits>`, `data` and `playCard` for
 * `<Player.UpNext>`. `playNext` is undefined after the last episode, so the
 * countdown never runs with nothing to advance to.
 */
export function useWatchUpNext(params: Readonly<WatchUpNextParams>): WatchUpNextParts {
  const { discovery, target, art, onPlay } = params;
  const t = useT();
  const following = useWatchFollowing({ discovery, target });
  return useMemo(() => {
    const [first] = following;
    return {
      ...watchUpNext(following, { t, art }),
      playNext: first ? () => onPlay(first) : undefined,
      playCard: (card: UpNextItem) => {
        const picked = following.find((next) => watchNextId(next) === card.id);
        if (picked) onPlay(picked);
      },
    };
  }, [following, t, art, onPlay]);
}
