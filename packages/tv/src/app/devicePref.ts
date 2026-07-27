// Device-scoped preferences, persisted under the `kroma:*` keys.
//
// Through the client's device store rather than straight to `localStorage`: the
// browsers get exactly that, and React Native (which has no localStorage) gets
// the file-backed store its shell installs. Reaching for localStorage here is
// why the TV's language and keyboard layout did not survive a relaunch on Apple
// TV, silently.
//
// One place owns the storage rules every pref shares: reads and writes NEVER
// throw (a TV in a locked-down profile, private mode, or a storage quota can
// make localStorage unavailable at any moment), and an unknown stored value is
// treated as "unset" so a downgrade or a hand-edited key can't wedge a screen.
//
// Built on by enginePref, keyboardLayoutPref and the search history.

import { deviceStorage } from '@kroma/core';

/** The raw stored value for a device key, or null when absent/unavailable. */
export function readDeviceValue(key: string): string | null {
  try {
    return deviceStorage()?.getItem(key) ?? null;
  } catch {
    return null; /* storage unavailable */
  }
}

/** Persist a device key, best effort (a failed write is not worth an error). */
export function writeDeviceValue(key: string, value: string): void {
  try {
    deviceStorage()?.setItem(key, value);
  } catch {
    /* storage unavailable */
  }
}

/** A persisted one-of-N device preference. */
export interface DevicePref<T extends string> {
  /** The stored choice, or `fallback` when unset / unknown / unreadable. */
  get(): T;
  /** Persist a choice (best effort). */
  set(value: T): void;
}

/** A device preference whose value is one of `values` (else `fallback`), stored
 * as-is under `key`. Callers wrap it in named get/set functions so each pref
 * keeps its own documented, typed surface. */
export function devicePref<T extends string>(
  key: string,
  values: readonly T[],
  fallback: T,
): DevicePref<T> {
  return {
    get() {
      const v = readDeviceValue(key);
      return v && (values as readonly string[]).includes(v) ? (v as T) : fallback;
    },
    set(value: T) {
      writeDeviceValue(key, value);
    },
  };
}
