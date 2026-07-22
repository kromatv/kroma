// Storyboard scrub previews: lazily fetch the sprite-sheet manifest (202 while
// the server generates it) and resolve a tile for any absolute time.

import type { KromaClient, MediaItem, StoryboardManifest } from '@kroma/core';
import { useEffect, useState } from 'react';
import type { DownloadEntry } from '#mobile/lib/downloads';

export interface StoryboardTile {
  /** Sprite sheet URL. */
  sheet: string;
  /** Pixel offset of the tile inside the sheet. */
  x: number;
  y: number;
  tileW: number;
  tileH: number;
  sheetW: number;
  sheetH: number;
}

export function useStoryboard(
  client: KromaClient,
  item: MediaItem,
  enabled: boolean,
  /** Offline entry: previews come from its local sprite sidecar. */
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
      client
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
    if (!manifest || manifest.count === 0 || manifest.interval <= 0) return null;
    const index = Math.min(manifest.count - 1, Math.max(0, Math.floor(absSec / manifest.interval)));
    return {
      sheet: localSprite ?? client.resolveArt(manifest.url) ?? manifest.url,
      x: (index % manifest.cols) * manifest.tileW,
      y: Math.floor(index / manifest.cols) * manifest.tileH,
      tileW: manifest.tileW,
      tileH: manifest.tileH,
      sheetW: manifest.cols * manifest.tileW,
      sheetH: manifest.rows * manifest.tileH,
    };
  };
}
