// Device-scoped preferences, persisted under the `kroma:*` keys, through the
// client's device store rather than `localStorage` directly: React Native has
// no localStorage, and the store's reads/writes never throw, so a locked-down
// profile or storage quota can't wedge a screen.

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
  get(): T;
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
