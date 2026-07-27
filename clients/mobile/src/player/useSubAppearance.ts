// Subtitle appearance on the phone: the design system's OWN model
// (@kroma/ui SubtitleAppearance - size / colour / edge / font / opacities),
// persisted per device. The web and TV persist through localStorage
// (useSubtitleAppearance); React Native has no synchronous storage, so this is
// the same contract hydrated through the app's async pref store instead.

import type { SubtitleAppearance } from '@kroma/ui';
import { DEFAULT_SUB_APPEARANCE } from '@kroma/ui';
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
          setStyle({ ...DEFAULT_SUB_APPEARANCE, ...JSON.parse(raw) });
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
