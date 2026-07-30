// Subtitle appearance on the phone: the same @kroma/ui SubtitleAppearance the
// web and TV keep in localStorage, hydrated through the app's async pref store
// instead, because React Native has no synchronous storage.

import type { SubtitleAppearance } from '@kroma/ui';
import { DEFAULT_SUB_APPEARANCE, migrateAppearance } from '@kroma/ui';
import { useCallback, useEffect, useState } from 'react';
import { loadPref, savePref } from '#mobile/lib/storage';

const KEY = 'subtitleStyle';

export function useSubAppearance(): [
  SubtitleAppearance,
  (next: Partial<SubtitleAppearance>) => void,
] {
  const [style, setStyle] = useState<SubtitleAppearance>(DEFAULT_SUB_APPEARANCE);

  useEffect(() => {
    let cancelled = false;
    loadPref(KEY)
      .then((raw) => {
        if (cancelled || !raw) return;
        try {
          // Migrated, not spread: a pref written before the renderer took on
          // CEA-708 still names `box` or `outline`, and those reach
          // `CUE_EDGE[a.edge]` as undefined - a TypeError inside the cue render.
          setStyle(migrateAppearance(JSON.parse(raw)));
        } catch {
          // A corrupt pref falls back to the defaults it was seeded from.
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const update = useCallback((next: Partial<SubtitleAppearance>) => {
    setStyle((prev) => {
      const merged = { ...prev, ...next };
      void savePref(KEY, JSON.stringify(merged));
      return merged;
    });
  }, []);

  return [style, update];
}
