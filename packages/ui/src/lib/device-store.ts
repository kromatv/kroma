// Where the kit's own per-device preferences are kept: the audio filter mode,
// how subtitles look. The player reads them synchronously, before React has
// hydrated and from outside a component (a native engine applies the remembered
// mode at construction), so this is an installed store rather than a context.

/**
 * The three calls the kit needs from a key/value store. `localStorage`
 * satisfies it, and so does a native app's own device store.
 */
export interface DeviceStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

let installed: DeviceStore | null = null;

/** Install the store for a platform with no `localStorage`. React Native has
 * none, so without this every preference the kit saves is a silent no-op. Call
 * it once, before a screen reads one. */
export function setDeviceStore(store: DeviceStore | null): void {
  installed = store;
}

/** The store this platform is using, or null where there is none. */
export function deviceStore(): DeviceStore | null {
  if (installed) return installed;
  try {
    // biome-ignore lint/style/noRestrictedGlobals: audited - this IS the capability probe, and it returns null on every native target, where a host installs its own device store instead.
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    // Reading it can throw outright (privacy mode, a sandboxed iframe).
    return null;
  }
}
