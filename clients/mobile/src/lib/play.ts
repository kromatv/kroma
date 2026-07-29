// Where "play this now" lands.
//
// While this phone is driving a TV, Play means play THERE - the whole point of
// being connected. Sending it to the phone's own player instead is the bug that
// makes casting feel broken: the bar says "Playing on Salon" and the film starts
// in your hand.
//
// One helper so every entry point (a title page, a hero, an episode row, a
// search result) makes the same decision. Downloads deliberately do NOT use it:
// an offline file is on this device, and playing it here is the point.

import type { ItemId } from '@kroma/core';
import { useCast } from '@kroma/ui';
import { useRouter } from 'expo-router';
import { useCallback } from 'react';

export function usePlay() {
  const router = useRouter();
  const { active, playOn } = useCast();

  const play = useCallback(
    async (itemId: string, positionMs = 0) => {
      if (active) {
        // The TV resumes from the account's own position when none is given.
        const ok = await playOn(active.id, itemId as ItemId, positionMs);
        // Land on the remote: the viewer just started something on another
        // screen, and this is where they say what happens to it next.
        if (ok) {
          router.push('/cast' as never);
          return;
        }
        // The set did not take it - switched off since the roster was drawn, or
        // it let this remote go. Fall through and play here rather than leave
        // the tap doing nothing at all, which is what it used to do: no
        // navigation, no message, and no screen on the phone that reads
        // `Cast.error`.
      }
      router.push(`/player/${itemId}` as never);
    },
    [active, playOn, router],
  );

  /** The TV that Play will land on, or null when it plays here. */
  return { device: active, play };
}
