// The heaviest screen, split out so the browse-first initial bundle stays lean.
// Its <Suspense> lives in <TvOutlet>. Legacy-tier IIFE builds inline dynamic
// imports back into one classic file, so only the modern tiers actually split.

import { lazy } from 'react';
import type { PlaybackPlatform } from '#tv/features/playback/player/playbackBackend';

/** Playback on the browser shells, the player and the trailer each loaded as
 * their own chunk. */
export const BROWSER_PLAYBACK: PlaybackPlatform = {
  Player: lazy(() =>
    import('#tv/features/playback/browser/BrowserPlayer').then((m) => ({
      default: m.BrowserPlayer,
    })),
  ),
  Trailer: lazy(() =>
    import('#tv/features/playback/browser/BrowserTrailer').then((m) => ({
      default: m.BrowserTrailer,
    })),
  ),
};
