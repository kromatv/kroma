// Publishes KROMA's rows OUT to the television's home screen (Android TV Watch
// Next and preview channels, tvOS Top Shelf). With no backend registered (Tizen,
// webOS, desktop, web), both calls are silent no-ops. Payloads stay JSON strings
// so a provider's `lastPushed` guard can compare two of them with `===`.

export interface LauncherBackend {
  // JSON array of `{id,title,subtitle?,imageUrl?,backdropUrl?,progressMs,
  // durationMs,kind,showId?,updatedAtMs}`; `[]` clears it.
  setContinueWatching(json: string): void;
  // JSON array of `{title, items:[{id,title,subtitle?,imageUrl?,backdropUrl?,
  // kind}]}` in display order; `[]` clears them.
  setHomeChannel(json: string): void;
}

let current: LauncherBackend | null = null;

/** Call once at the app root, before the first render; null restores the no-op default. */
export function setLauncherBackend(backend: LauncherBackend | null): void {
  current = backend;
}

export function launcherBackend(): LauncherBackend | null {
  return current;
}
