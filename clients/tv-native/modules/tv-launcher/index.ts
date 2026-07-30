// JS face of the local launcher module - the app's presence on the television's
// own home screen: Android TV preview channels / Watch Next, and the Apple TV
// Top Shelf.
//
// `requireOptionalNativeModule` because absence is this API's capability check:
// a platform that ships no implementation yields null, and the shell then
// registers no launcher backend.

import { type NativeModule, requireOptionalNativeModule } from 'expo';

declare class TvLauncherNativeModule extends NativeModule {
  // JSON array of `{id,title,subtitle?,imageUrl?,backdropUrl?,progressMs,
  // durationMs,kind,showId?,updatedAtMs}`; `[]` clears the row.
  setContinueWatching(json: string): void;
  // JSON array of `{title, items:[{id,title,subtitle?,imageUrl?,backdropUrl?,
  // kind}]}` in display order; `[]` clears them.
  setHomeChannel(json: string): void;
  clear(): void;
}

export const TvLauncher = requireOptionalNativeModule<TvLauncherNativeModule>('TvLauncher');
