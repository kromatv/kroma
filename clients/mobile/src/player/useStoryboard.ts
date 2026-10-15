// Storyboard scrub previews. The manifest answers 202 while the server is still
// generating it, hence the poll.

import type { KromaClient } from '@kromatv/client';
import type { MediaItem, StoryboardManifest } from '@kromatv/client/media';
import { drawnTileIndex } from '@kromatv/core';
import { useEffect, useState } from 'react';
import type { DownloadEntry } from '#mobile/lib/downloads';

export interface StoryboardTile {
  sheet: string;
  x: number;
  y: number;
  tileW: number;
  tileH: number;
  sheetW: number;
  sheetH: number;
}

/** The tile under a second, cut from a sheet at an absolute `url`: none for a
 * tile a sheet still being drawn has not reached. */
export function sheetTile(
  sheet: StoryboardManifest & { ready?: string },
  absSec: number,
): StoryboardTile | null {
  const index = drawnTileIndex(sheet, absSec);
  if (index === null) return null;
  return {
    sheet: sheet.url,
    x: (index % sheet.cols) * sheet.tileW,
    y: Math.floor(index / sheet.cols) * sheet.tileH,
    tileW: sheet.tileW,
    tileH: sheet.tileH,
    sheetW: sheet.cols * sheet.tileW,
    sheetH: sheet.rows * sheet.tileH,
  };
}

export function useStoryboard(
  client: KromaClient,
  item: MediaItem,
  enabled: boolean,
  offline?: DownloadEntry,
): (absSec: number) => StoryboardTile | null {
  const [manifest, setManifest] = useState<StoryboardManifest | null>(
    offline?.storyboard?.manifest ?? null,
  );
  const localSprite = offline?.storyboard?.spritePath ?? null;

  useEffect(() => {
    if (!enabled || localSprite) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const poll = () => {
      client.media
        .storyboard(item.id)
        .then((m) => {
          if (cancelled) return;
          if (m === 'pending') timer = setTimeout(poll, 5000);
          else if (m) setManifest(m);
        })
        .catch(() => undefined);
    };
    poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [client, item.id, enabled, localSprite]);

  return (absSec: number): StoryboardTile | null => {
    if (!manifest) return null;
    const url = localSprite ?? client.media.artwork.resolve(manifest.url) ?? manifest.url;
    return sheetTile({ ...manifest, url }, absSec);
  };
}
