// Where "play this now" lands: on the connected TV while one is driven, on this
// phone otherwise. Downloads deliberately do not use it - an offline file is on
// this device, and playing it here is the point.

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
        if (ok) {
          router.push('/cast' as never);
          return;
        }
        // The set did not take it (switched off, or it let this remote go):
        // fall through and play here rather than leave the tap doing nothing.
      }
      router.push(`/player/${itemId}` as never);
    },
    [active, playOn, router],
  );

  return { device: active, play };
}
