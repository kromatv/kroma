import { useKitSettings } from './kit-settings';

// Native roots supply hydrated storage through KitProvider. Pure callers take
// the store explicitly; browsers may use their platform's localStorage.

/**
 * The three calls the kit needs from a key/value store. `localStorage`
 * satisfies it, and so does a native app's own device store.
 */
export interface DeviceStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** The store this platform is using, or null where there is none. */
export function deviceStore(provided?: DeviceStore | null): DeviceStore | null {
  if (provided !== undefined) return provided;
  try {
    // oxlint-disable-next-line no-restricted-globals -- audited - this IS the capability probe, and it returns null on every native target, where a host installs its own device store instead.
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    // Reading it can throw outright (privacy mode, a sandboxed iframe).
    return null;
  }
}

/** Native roots supply their hydrated store before mounting preferences. */
export function useDeviceStore(): DeviceStore | null {
  return deviceStore(useKitSettings().deviceStore);
}
