// Shared scrub-bar "storyboard" hook: loads an item's sprite sheet of evenly-spaced
// thumbnails for the seek preview. The server builds it lazily, so this polls while
// `pending`, then preloads the image so the first hover/scrub doesn't flash empty.

import type { KromaClient, StoryboardManifest } from '@kroma/core';
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
  itemId: string,
  { generate = true }: { generate?: boolean } = {},
): Storyboard {
  const [manifest, setManifest] = useState<StoryboardManifest | null>(null);
  const [sheetUrl, setSheetUrl] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let resolved = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let tries = 0;
    setManifest(null);
    setSheetUrl(null);
    setLoaded(false);

    // `Image.prefetch`, not `new Image()`: the DOM constructor doesn't exist on
    // a television, and inside this poll's promise chain the ReferenceError was
    // swallowed by `.catch` - the scrub preview silently never got a picture.
    const preload = (url: string) => {
      Image.prefetch(url)
        .then(() => {
          if (!cancelled) setLoaded(true);
        })
        .catch(() => undefined); // unreachable sheet: fall back to the time label
    };

    const poll = () => {
      client
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
          const url = client.resolveArt(res.url) ?? res.url;
          setManifest(res);
          setSheetUrl(url);
          preload(url);
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

  const tile = useCallback(
    (sec: number, displayW: number): StoryboardTile | null => {
      if (!manifest || !sheetUrl || !loaded) return null;
      const { interval, tileW, tileH, cols, rows, count } = manifest;
      const idx = Math.max(0, Math.min(count - 1, Math.floor(sec / interval)));
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      const scale = displayW / tileW;
      return {
        width: displayW,
        height: Math.round(tileH * scale),
        sheet: sheetUrl,
        sheetWidth: cols * tileW,
        sheetHeight: rows * tileH,
        offsetX: -Math.round(col * tileW * scale),
        offsetY: -Math.round(row * tileH * scale),
        scale,
      };
    },
    [manifest, sheetUrl, loaded],
  );

  return { ready: loaded && manifest != null, tile };
}
