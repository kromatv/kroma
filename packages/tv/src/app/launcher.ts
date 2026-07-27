// The television's own home screen: what KROMA publishes OUT to the platform.
//
// Android TV / Google TV let an app put rows on the launcher home - the system
// "Continue watching" (Watch Next) row, and named "preview channels" of its own
// ("Recently added", "For you", ...). Apple TV shows the same lists as Top
// Shelf: the shortcut cards above the app icon when it is focused in the home
// screen's top row. Either way the rows persist after the app closes, and each
// entry deep-links straight back in, so they are how a television offers KROMA
// before KROMA is even running.
//
// The lists themselves are shared: the same `ContinueProvider` /
// `RecommendProvider` that feed the in-app rows push them here too. Only the
// publishing is platform work - `androidx.tvprovider` content-provider writes
// on Android, an App Group hand-off to the Top Shelf extension on tvOS. So a
// shell registers a backend and nothing else in the app has to know whether
// this television has a home screen worth publishing to.
//
// Registration is dependency injection, exactly like `app/voiceSearch`: no
// backend registered (Tizen, webOS, desktop, web) and both calls are silently
// no-ops.
//
// The payloads stay JSON STRINGS rather than structured values on purpose: the
// native side parses them with `org.json` and reconciles against what the
// provider actually holds, and keeping the wire format opaque here means the
// providers' `lastPushed` guard can compare two payloads with `===` - which is
// what stops a re-render from re-publishing an identical list and racing the
// native sync into duplicate rows.

export interface LauncherBackend {
  /** Publish the "continue watching" list into the launcher's system Watch Next
   * row. JSON array of `{id,title,subtitle?,imageUrl?,backdropUrl?,progressMs,durationMs,
   * kind,showId?,updatedAtMs}`; `[]` clears it. */
  setContinueWatching(json: string): void;
  /** Publish the home sections as KROMA preview channels (named rows on the
   * launcher home). JSON array of `{title, items:[{id,title,subtitle?,
   * imageUrl?,backdropUrl?,kind}]}` in display order; `[]` clears them. */
  setHomeChannel(json: string): void;
}

let current: LauncherBackend | null = null;

/** Register the shell's launcher backend. Call once at the app root, before the
 * first render. Passing null removes it (what a test does to get back to the
 * no-launcher default). */
export function setLauncherBackend(backend: LauncherBackend | null): void {
  current = backend;
}

/** The registered backend, or null on a television with no home screen to
 * publish to. */
export function launcherBackend(): LauncherBackend | null {
  return current;
}
