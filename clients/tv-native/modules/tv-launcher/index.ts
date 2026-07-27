// JS face of the local launcher module - the app's presence on the television's
// own home screen, on both native platforms: Android TV preview channels /
// Watch Next, and the Apple TV Top Shelf (the shortcut cards above the icon
// when it is focused in the top row).
//
// `requireOptionalNativeModule` rather than `requireNativeModule`: absence is
// this API's capability check - a platform that ships no implementation simply
// yields null and the shell registers no launcher backend. Both current
// platforms do ship one, but the null path stays: it is what a future shell
// without a home screen (or a test) relies on.

import { type NativeModule, requireOptionalNativeModule } from 'expo';

declare class TvLauncherNativeModule extends NativeModule {
  /** Publish the "continue watching" list into the launcher's system Watch Next
   * row. JSON array of `{id,title,subtitle?,imageUrl?,backdropUrl?,progressMs,durationMs,
   * kind,showId?,updatedAtMs}`; `[]` clears it. Returns immediately - the provider work
   * runs off the JS thread. */
  setContinueWatching(json: string): void;
  /** Publish the home sections as KROMA preview channels. JSON array of
   * `{title, items:[{id,title,subtitle?,imageUrl?,backdropUrl?,kind}]}` in display order;
   * `[]` clears them. */
  setHomeChannel(json: string): void;
  /** Drop every row KROMA published (sign-out). */
  clear(): void;
}

/** The native module, or null on a platform that does not ship it. */
export const TvLauncher = requireOptionalNativeModule<TvLauncherNativeModule>('TvLauncher');
