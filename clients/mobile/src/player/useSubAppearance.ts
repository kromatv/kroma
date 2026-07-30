// Subtitle appearance on the phone: the design system's OWN model
// (@kroma/ui SubtitleAppearance - size / colour / edge / font / opacities),
// persisted per device. The web and TV persist through localStorage
// (useSubtitleAppearance); React Native has no synchronous storage, so this is
// the same contract hydrated through the app's async pref store instead.

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
          // Through the shared migration, NOT a raw spread: a pref written
          // before the renderer took on CEA-708 still names `box` or `outline`,
          // and those reach `CUE_EDGE[a.edge]` as undefined - a TypeError inside
          // the cue's render, which unmounts the player with no boundary to
          // catch it. It also rescues the background the old `box` edge drew.
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
