import type { StoryboardManifest } from '@kromatv/client/media';
import { useLoadedSheet } from '@kromatv/core/react';
import { Image } from 'expo-image';
import { useCallback } from 'react';
import { type StoryboardTile, sheetTile } from '#mobile/player/useStoryboard';

const prefetchSheet = (url: string): Promise<boolean> => Image.prefetch(url);

/** Scrub-bar tiles from a sheet still being drawn, cut from the last version
 * expo-image holds, so a thumbnail never blanks while a newer one loads. */
export function useSheetTiles(
  sheet: (StoryboardManifest & { ready?: string }) | null,
): (absSec: number) => StoryboardTile | null {
  const shown = useLoadedSheet(sheet, prefetchSheet);
  return useCallback((absSec: number) => (shown ? sheetTile(shown, absSec) : null), [shown]);
}
