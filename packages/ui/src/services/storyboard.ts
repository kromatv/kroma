// Shared scrub-bar "storyboard" hook: loads an item's sprite sheet of evenly-spaced
// thumbnails for the seek preview. The server builds it lazily, so this polls while
// `pending`, then preloads the image so the first hover/scrub doesn't flash empty.

import type { KromaClient } from '@kromatv/client';
import type { ItemId, StoryboardManifest } from '@kromatv/client/media';
import { drawnTileIndex } from '@kromatv/core';
import { useLoadedSheet } from '@kromatv/core/react';
import { useCallback, useEffect, useState } from 'react';
import { Image } from 'react-native';
import { webDocument } from '#ui/lib/dom';

/**
 * One preview tile, scaled to a requested display width, expressed as geometry
 * rather than CSS `background-position`: React Native's `experimental_backgroundImage`
 * takes gradients, not `url()`, so that spelling renders nothing on Apple TV.
 */
export interface StoryboardTile {
  width: number;
  height: number;
  sheet: string;
  /** The sheet's own pixel size - draw at this size and scale by `scale`; asking
   *  the decoder for `sheetWidth * scale` pixels can exceed the GPU's texture
   *  limit and the thumbnail comes out empty. */
  sheetWidth: number;
  sheetHeight: number;
  /** Offset to bring this tile into the window (<= 0). */
  offsetX: number;
  offsetY: number;
  /** Display size over source size: `width / tileW`. */
  scale: number;
}

export interface Storyboard {
  ready: boolean;
  tile: (sec: number, displayW: number) => StoryboardTile | null;
}

/** A sheet at an absolute `url`. `ready` marks, one character per tile, which
 * tiles a sheet still being drawn has drawn (`1`); a sheet without it is whole. */
export type StoryboardSheet = StoryboardManifest & { ready?: string };

// `Image.prefetch`, not `new Image()`: the DOM constructor doesn't exist on a
// television, and inside a promise chain the ReferenceError was swallowed by
// `.catch` - the scrub preview silently never got a picture.
const prefetchSheet = (url: string): Promise<boolean> => Image.prefetch(url);

const POLL_MS = 1500;
const FAST_POLLS = 40;
const SLOW_MS = 15000;
const MAX_TRIES = FAST_POLLS + 240; // ~1 h overall bound

/**
 * Loads an item's scrub-bar storyboard for the seek preview. `generate: false`
 * (dashboard thumbnails) does a single fetch and never awaits lazy generation.
 */
export function useStoryboard(
  client: KromaClient,
  itemId: ItemId,
  { generate = true }: { generate?: boolean } = {},
): Storyboard {
  const [manifest, setManifest] = useState<StoryboardSheet | null>(null);

  useEffect(() => {
    let cancelled = false;
    let resolved = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let tries = 0;
    setManifest(null);

    const poll = () => {
      client.media
        .storyboard(itemId)
        .then((res) => {
          if (cancelled || resolved) return;
          if (res === 'pending') {
            if (!generate) return;
            tries += 1;
            const delay = tries <= FAST_POLLS ? POLL_MS : SLOW_MS;
            if (tries <= MAX_TRIES) timer = setTimeout(poll, delay);
            return;
          }
          if (!res) return; // no usable file/duration: silently fall back to the time label
          resolved = true;
          setManifest({ ...res, url: client.media.artwork.resolve(res.url) ?? res.url });
        })
        .catch(() => undefined);
    };
    poll();

    // Re-check on tab visibility so a sheet that finished while backgrounded is
    // picked up without a tight interval.
    const doc = webDocument();
    const onVisible = () => {
      if (doc?.visibilityState !== 'visible' || cancelled || resolved) return;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      tries = 0;
      poll();
    };
    if (generate) doc?.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      if (generate) doc?.removeEventListener('visibilitychange', onVisible);
    };
  }, [client, itemId, generate]);

  return useStoryboardSheet(manifest);
}

/**
 * The tiles of one sheet, once its picture has loaded. A tile the sheet marks as
 * not drawn yet has no thumbnail, and a sheet at a new `url` takes over only once
 * its own picture has loaded.
 */
export function useStoryboardSheet(sheet: StoryboardSheet | null): Storyboard {
  const shown = useLoadedSheet(sheet, prefetchSheet);

  const tile = useCallback(
    (sec: number, displayW: number): StoryboardTile | null => {
      if (!shown) return null;
      const index = drawnTileIndex(shown, sec);
      if (index === null) return null;
      const { tileW, tileH, cols, rows } = shown;
      const col = index % cols;
      const row = Math.floor(index / cols);
      const scale = displayW / tileW;
      return {
        width: displayW,
        height: Math.round(tileH * scale),
        sheet: shown.url,
        sheetWidth: cols * tileW,
        sheetHeight: rows * tileH,
        offsetX: -Math.round(col * tileW * scale),
        offsetY: -Math.round(row * tileH * scale),
        scale,
      };
    },
    [shown],
  );

  return { ready: shown !== null, tile };
}
