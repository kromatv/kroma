import type { SessionStorage } from '@kromatv/client';
import { useDeviceStore } from '@kromatv/ui/device-store';
// Reactive layer over devicePref: ONE shared, subscribable value per stored
// preference, so every mounted consumer (a menu row, the on-screen keyboard,
// the player) sees a change the moment any of them writes it. localStorage has
// no same-tab change events, so writes notify the in-process listeners here.

import { createContext, useContext, useState, useSyncExternalStore } from 'react';
import { clientHardware } from '#tv/app/clientHardware';
import { devicePref } from '#tv/app/devicePref';

/** A subscribable one-of-N device preference (devicePref + change notification). */
export interface ReactivePref<T extends string> {
  get(): T;
  set(value: T): void;
  subscribe(listener: () => void): () => void;
}

/** A reactive one-of-N preference stored under `key` (unknown stored values
 * read as `fallback`, writes never throw - see devicePref). A function
 * `fallback` is called on each read, for a default that depends on something
 * the shell installs after this module is evaluated.
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
  fallback: T | (() => T),
  storage?: SessionStorage | null,
): ReactivePref<T> {
  const stored = () =>
    devicePref(key, values, typeof fallback === 'string' ? fallback : fallback(), storage);
  const listeners = new Set<() => void>();
  let chosen: T | null = null;
  return {
    get: () => chosen ?? stored().get(),
    set(value: T) {
      if (value === (chosen ?? stored().get())) return;
      chosen = value;
      stored().set(value);
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

export function createPerfHudPref(storage?: SessionStorage | null) {
  return reactivePref('kroma:perf-hud', ['off', 'on'] as const, 'off', storage);
}

/** How much artwork to ask the server for, as a fraction of the width the
 * surface would otherwise request. `full` is the right answer on any panel that
 * can keep up; the lower steps trade sharpness for decode time and texture
 * memory, which is what a set with a weak SoC runs out of first while scrolling
 * a grid. Each step lands on its own rendition bucket at a rail tile (320 →
 * 320/240/160) and at the hero (1280 → 1280/960/780).
 *
 * The default is `full`, and `high` on a set reporting no more RAM than
 * `LOW_MEMORY_GB` - the one capability read that tells a 2 GB Android TV box
 * from a panel that keeps up, where a model name would tell nothing. A quality
 * chosen in settings wins over both. */
export const ARTWORK_SCALE = { full: 1, high: 0.75, medium: 0.5 } as const;

export type ArtworkQuality = keyof typeof ARTWORK_SCALE;

const LOW_MEMORY_GB = 2;

// Hardware adapters are selected by the bundler, before this module loads.
// Total RAM is immutable, so probe once without a late-registration latch.
const MEMORY_GB = clientHardware().memoryGb;
function defaultArtworkQuality(): ArtworkQuality {
  return MEMORY_GB !== null && MEMORY_GB <= LOW_MEMORY_GB ? 'high' : 'full';
}

/** One root owns the reactive quality choice and the client's URL getter. */
export function createArtworkPref(storage?: SessionStorage | null): ReactivePref<ArtworkQuality> {
  return reactivePref(
    'kroma:artwork',
    Object.keys(ARTWORK_SCALE) as readonly ArtworkQuality[],
    defaultArtworkQuality,
    storage,
  );
}
const ArtworkContext = createContext<ReactivePref<ArtworkQuality> | null>(null);
export const ArtworkPrefProvider = ArtworkContext.Provider;
export function useArtworkPref(): ReactivePref<ArtworkQuality> {
  const storage = useDeviceStore();
  const provided = useContext(ArtworkContext);
  const [owned] = useState(() => (provided ? null : createArtworkPref(storage)));
  const pref = provided ?? owned;
  if (!pref) throw new Error('Artwork preference requires its owning root');
  return pref;
}

/** Whether glass surfaces blur what is behind them.
 *
 * Off by default on a television, and measured both ways: a 2024 Samsung panel
 * gave 40fps with the web tier's backdrop-filter and 60 without, and an Android
 * TV box drops to ~52fps with double-digit jank once every frosted control
 * blurs the screen behind it. The plain fill underneath is what the design
 * falls back to anyway, so the switch is there for whoever wants to pay. */
export function createBlurPref(storage?: SessionStorage | null): ReactivePref<'on' | 'off'> {
  return reactivePref('kroma:blur', ['on', 'off'] as const, 'off', storage);
}
const BlurContext = createContext<ReactivePref<'on' | 'off'> | null>(null);
export const BlurPrefProvider = BlurContext.Provider;
export function useBlurPref(): ReactivePref<'on' | 'off'> {
  const storage = useDeviceStore();
  const provided = useContext(BlurContext);
  const [owned] = useState(() => (provided ? null : createBlurPref(storage)));
  const pref = provided ?? owned;
  if (!pref) throw new Error('Blur preference requires its owning root');
  return pref;
}
