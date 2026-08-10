// Reactive layer over devicePref: ONE shared, subscribable value per stored
// preference, so every mounted consumer (a menu row, the on-screen keyboard,
// the player) sees a change the moment any of them writes it. localStorage has
// no same-tab change events, so writes notify the in-process listeners here.

import { setArtworkScale } from '@kroma/core';
import { useSyncExternalStore } from 'react';
import { devicePref } from '#tv/app/devicePref';

/** A subscribable one-of-N device preference (devicePref + change notification). */
export interface ReactivePref<T extends string> {
  get(): T;
  set(value: T): void;
  subscribe(listener: () => void): () => void;
}

/** A reactive one-of-N preference stored under `key` (unknown stored values
 * read as `fallback`, writes never throw - see devicePref). */
export function reactivePref<T extends string>(
  key: string,
  values: readonly T[],
  fallback: T,
): ReactivePref<T> {
  const stored = devicePref(key, values, fallback);
  const listeners = new Set<() => void>();
  let snapshot = stored.get();
  return {
    get: () => snapshot,
    set(value: T) {
      if (value === snapshot) return;
      snapshot = value;
      stored.set(value);
      for (const listener of listeners) listener();
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** React binding: the component re-renders whenever the pref changes, from any
 * writer. Returns the `[value, set]` pair settings rows expect. */
export function useStoredPref<T extends string>(
  pref: ReactivePref<T>,
): readonly [T, (value: T) => void] {
  const value = useSyncExternalStore(pref.subscribe, pref.get, pref.get);
  return [value, pref.set] as const;
}

export const perfHudPrefStore = reactivePref('kroma:perf-hud', ['off', 'on'] as const, 'off');

/** How much artwork to ask the server for, as a fraction of the width the
 * surface would otherwise request. `full` is the right answer on any panel that
 * can keep up; the lower steps trade sharpness for decode time and texture
 * memory, which is what a set with a weak SoC runs out of first while scrolling
 * a grid. Each step lands on its own rendition bucket at a rail tile (320 →
 * 320/240/160) and at the hero (960 → 960/780/480). */
export const ARTWORK_SCALE = { full: 1, high: 0.75, medium: 0.5 } as const;

export type ArtworkQuality = keyof typeof ARTWORK_SCALE;

export const artworkPrefStore = reactivePref(
  'kroma:artwork',
  Object.keys(ARTWORK_SCALE) as readonly ArtworkQuality[],
  'full',
);

// Applied on import rather than from an effect, and this module is loaded by the
// router at boot: the scale is read when a URL is MINTED, so a screen that
// rendered before it was applied would go on asking for full-size art until
// something re-rendered it.
function applyArtworkScale(): void {
  setArtworkScale(ARTWORK_SCALE[artworkPrefStore.get()]);
}

applyArtworkScale();
artworkPrefStore.subscribe(applyArtworkScale);
