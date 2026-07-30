// The player, on the browser targets: the heaviest screen, split out so the
// browse-first initial bundle stays lean. Its <Suspense> lives in <TvOutlet>.
// Legacy-tier IIFE builds inline dynamic imports back into one classic file, so
// only the modern tiers actually split.

import { lazy } from 'react';

export const TvPlayer = lazy(() =>
  import('#tv/features/playback/TvPlayer').then((m) => ({ default: m.TvPlayer })),
);
