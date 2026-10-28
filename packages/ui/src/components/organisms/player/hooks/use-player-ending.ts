import { useState } from 'react';
import type { PostPlayItem } from '#ui/components/organisms/player/parts/post-play';
import type { UpNextItem } from '#ui/components/organisms/player/parts/up-next-sheet';
import type { PlayerController } from '#ui/components/organisms/player/types';
import type { PlayerMarker } from '../media-types';
import { type CreditsState, usePlayerCredits } from './use-player-credits';
import { usePlayerOutro } from './use-player-outro';

export interface PlayerEnding {
  credits: CreditsState;
  /** Whether the end screen has the stage, which it only ever takes with a film
   *  to offer on it. */
  over: boolean;
  playOffer: () => void;
  goHome: () => void;
}

/**
 * Everything the player does as a film runs out (§10, §11), which is two
 * mutually exclusive things: with an episode queued the credits card counts
 * down to it, and with none the end raises the post-play screen or leaves.
 * Both hang off the same `endedNonce`, which is why they are one hook.
 */
export function usePlayerEnding(opts: {
  controller: PlayerController;
  markers?: readonly PlayerMarker[];
  postPlay?: PostPlayItem | null;
  onPlayNext?: () => void;
  onPlayItem?: (item: UpNextItem) => void;
  onGoHome?: () => void;
  /** Leave the player: the post-play's fallback home, and where an end with
   *  nothing to offer goes. */
  onLeave: () => void;
  /** Called before the end screen rises, so it never covers an open panel. */
  onClearOverlay: () => void;
}): PlayerEnding {
  const { controller: c, markers, postPlay, onPlayNext, onPlayItem, onGoHome, onLeave } = opts;
  const hasNext = Boolean(onPlayNext);

  const credits = usePlayerCredits({
    markers,
    dur: c.dur,
    cur: c.cur,
    seeking: c.seekPreview != null,
    endedNonce: c.endedNonce,
    hasNext,
    onAdvance: () => onPlayNext?.(),
  });

  const [over, setOver] = useState(false);
  const goHome = onGoHome ?? onLeave;
  const playOffer = () => {
    if (postPlay) onPlayItem?.({ id: postPlay.id, title: postPlay.title });
  };

  usePlayerOutro({
    endedNonce: c.endedNonce,
    hasNext,
    canOffer: postPlay != null,
    onOffer: () => {
      opts.onClearOverlay();
      setOver(true);
    },
    onLeave,
  });

  return {
    credits,
    over: over && postPlay != null,
    playOffer,
    goHome,
  };
}
