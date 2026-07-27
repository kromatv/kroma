// The launcher backend: the rows KROMA publishes onto the television's own
// home screen, on both native platforms.
//
// The lists are the app's (the same `ContinueProvider` / `RecommendProvider`
// that feed the in-app rows); only the publishing is platform work, which the
// native module hides. On Android TV / Google TV it is a content-provider
// write into the launcher's Watch Next row and preview channels. On Apple TV
// it is a hand-off: the JSON is parked in the App Group's UserDefaults, where
// the KromaTopShelf extension reads it when the home screen asks for Top Shelf
// content (the shortcut cards above the focused icon - see
// targets/top-shelf/ContentProvider.swift). Either way this is the thin half:
// hand the JSON over and return.
//
// A platform that ships no module (a future shell, a test) yields
// `TvLauncher === null` and registers no backend - the correct answer there.

import type { LauncherBackend } from '@kroma/tv';
import { TvLauncher } from '../../modules/tv-launcher';

/** The Android TV launcher backend, or null on a platform without one. */
function launcherFor(module: NonNullable<typeof TvLauncher>): LauncherBackend {
  // Bound to a NON-NULL local: the module is read once here, so neither method
  // has to re-narrow the optional import every time it is called.
  return {
    setContinueWatching: (json) => module.setContinueWatching(json),
    setHomeChannel: (json) => module.setHomeChannel(json),
  };
}

export const nativeLauncher: LauncherBackend | null = TvLauncher ? launcherFor(TvLauncher) : null;
