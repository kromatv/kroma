// The player, on the browser targets: loaded on demand.
//
// It is the app's heaviest screen (four playback engines plus the seek,
// subtitle and stats stack) and is only reached once the user starts playback,
// so splitting it keeps the browse-first initial bundle lean. `TvPlayer` is a
// named export, so it is shimmed to a default for React.lazy. The <Suspense>
// that catches it lives in <TvOutlet>. Legacy-tier IIFE builds inline dynamic
// imports back into their single classic file, so only the modern tiers split.

import { lazy } from 'react';

export const TvPlayer = lazy(() =>
  import('#tv/features/playback/TvPlayer').then((m) => ({ default: m.TvPlayer })),
);
