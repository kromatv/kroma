import type { KromaClient } from '@kromatv/client';
import type { WatchableTarget, WatchNext } from '@kromatv/core';
import { useWatchFollowing } from '@kromatv/core/react';
import { useCallback, useEffect } from 'react';

const CARD_TAIL_SEC = 30;

interface EndOfPicture {
  addListener(event: 'playToEnd', listener: () => void): { remove(): void };
}

/** The episode after the one playing, whether its card is due, and the way to
 * it, which stops this picture first. */
export interface WatchNextOffer {
  next: WatchNext | null;
  due: boolean;
  playNext: (next: WatchNext) => void;
}

/** The next episode of a file still arriving, as the catalogue player offers
 * its own: the card in the last thirty seconds, and the move on once the
 * picture plays to its end. `onPlay` is handed the episode to open. */
export function useWatchNext({
  client,
  target,
  engine,
  onPlay,
}: Readonly<{
  client: KromaClient;
  target: WatchableTarget;
  engine: { player: EndOfPicture; cur: number; dur: number; shutdown(): void };
  onPlay: (next: WatchNext) => void;
}>): WatchNextOffer {
  const following = useWatchFollowing({ discovery: client.discovery, target });
  const next = following[0] ?? null;
  const { player, cur, dur, shutdown } = engine;
  const playNext = useCallback(
    (picked: WatchNext) => {
      shutdown();
      onPlay(picked);
    },
    [shutdown, onPlay],
  );

  useEffect(() => {
    if (!next) return;
    const ended = player.addListener('playToEnd', () => playNext(next));
    return () => ended.remove();
  }, [player, next, playNext]);

  return {
    next,
    due: next !== null && dur > CARD_TAIL_SEC && cur >= dur - CARD_TAIL_SEC,
    playNext,
  };
}
