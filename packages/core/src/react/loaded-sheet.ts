import { useEffect, useState } from 'react';

/**
 * The last sheet whose picture has loaded, so a scrub bar keeps drawing from it
 * while a newer version loads and never shows a blank tile in between. `prefetch`
 * is the platform's image loader and must keep its identity across renders. It
 * fails by rejecting or by answering `false`, as expo-image does; react-native-web
 * answers nothing at all once the picture is in.
 */
export function useLoadedSheet<T extends { url: string }>(
  sheet: T | null,
  prefetch: (url: string) => Promise<boolean | undefined>,
): T | null {
  const [shown, setShown] = useState<T | null>(null);
  const shownUrl = shown?.url ?? null;

  useEffect(() => {
    if (!sheet) {
      setShown(null);
      return;
    }
    if (sheet.url === shownUrl) return;
    let cancelled = false;
    prefetch(sheet.url)
      .then((loaded) => {
        if (loaded !== false && !cancelled) setShown(sheet);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [sheet, shownUrl, prefetch]);

  return shown;
}
