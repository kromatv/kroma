// Reactive layer over devicePref: ONE shared, subscribable value per stored
// preference, so every mounted consumer (a menu row, the on-screen keyboard,
// the player) sees a change the moment any of them writes it. localStorage has
// no same-tab change events, so writes notify the in-process listeners here.

import { onDeviceStorageChange, setArtworkScale } from '@kroma/core';
import { setFrostEnabled } from '@kroma/ui/kit';
import { useSyncExternalStore } from 'react';
import { devicePref } from '#tv/app/devicePref';

/** A subscribable one-of-N device preference (devicePref + change notification). */
export interface ReactivePref<T extends string> {
  get(): T;
  set(value: T): void;
  subscribe(listener: () => void): () => void;
}

/** A reactive one-of-N preference stored under `key` (unknown stored values
 * read as `fallback`, writes never throw - see devicePref).
 *
 * Reads through to the device store until this session sets a value, because
 * the native shells install that store only once the session file has been
 * read: a value snapshot taken while this module is evaluated is always
 * `fallback`, and would pin the preference to it for the life of the process. A
 * value set here wins from then on, so a choice still holds where the write
 * could not land. */
export function reactivePref<T extends string>(
  key: string,
  values: readonly T[],
  fallback: T,
): ReactivePref<T> {
  const stored = devicePref(key, values, fallback);
  const listeners = new Set<() => void>();
  let chosen: T | null = null;
  return {
    get: () => chosen ?? stored.get(),
    set(value: T) {
      if (value === (chosen ?? stored.get())) return;
      chosen = value;
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
// something re-rendered it. The store reads through, but this is a PUSH, so it
// goes out again when a shell installs its device store late.
function applyArtworkScale(): void {
  setArtworkScale(ARTWORK_SCALE[artworkPrefStore.get()]);
}

applyArtworkScale();
artworkPrefStore.subscribe(applyArtworkScale);
onDeviceStorageChange(applyArtworkScale);

/** Whether glass surfaces blur what is behind them.
 *
 * Off by default on a television, and measured both ways: a 2024 Samsung panel
 * gave 40fps with the web tier's backdrop-filter and 60 without, and an Android
 * TV box drops to ~52fps with double-digit jank once every frosted control
 * blurs the screen behind it. The plain fill underneath is what the design
 * falls back to anyway, so the switch is there for whoever wants to pay. */
export const blurPrefStore = reactivePref('kroma:blur', ['on', 'off'] as const, 'off');

// Pushed, not read: the kit holds one flag for the whole app (see
// atoms/frost), so like the artwork scale it has to go out again when a shell
// installs its device store late.
function applyBlur(): void {
  setFrostEnabled(blurPrefStore.get() === 'on');
}

applyBlur();
blurPrefStore.subscribe(applyBlur);
onDeviceStorageChange(applyBlur);
