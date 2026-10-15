import { WATCH_RESUME_STORE_KEY, watchResumeOf, watchResumeWith } from '@kromatv/core';
import { useEffect, useRef } from 'react';
import { deviceStore } from '#ui/lib/device-store';

const SAVE_EVERY_MS = 10_000;

/** Where this device last left one file of one download, read synchronously so
 * a caller can anchor its first playlist at it. 0 for a file it has not played,
 * and on a platform with no device store. */
export function watchResumeAt(id: string): number {
  return watchResumeOf(deviceStore()?.getItem(WATCH_RESUME_STORE_KEY) ?? null, id);
}

export function keepWatchPosition(id: string, positionSec: number, durationSec: number): void {
  const store = deviceStore();
  if (!store) return;
  store.setItem(
    WATCH_RESUME_STORE_KEY,
    watchResumeWith(store.getItem(WATCH_RESUME_STORE_KEY), id, positionSec, durationSec),
  );
}

/**
 * Keeps `positionSec` for `id` while the player is mounted, saving every ten
 * seconds and once more on the way out. Nothing is written until the picture
 * reports a time of its own: a clock still reading zero would write the file out
 * of the ledger and lose the position it was going to resume at.
 */
export function useRememberWatchPosition(
  id: string,
  positionSec: number,
  durationSec: number,
): void {
  const live = useRef({ id, positionSec, durationSec, started: false });
  const started = live.current.id === id && (live.current.started || positionSec > 0);
  live.current = { id, positionSec, durationSec, started };
  useEffect(() => {
    const save = () => {
      const { positionSec: at, durationSec: total, started } = live.current;
      if (started) keepWatchPosition(id, at, total);
    };
    const timer = setInterval(save, SAVE_EVERY_MS);
    return () => {
      clearInterval(timer);
      save();
    };
  }, [id]);
}
