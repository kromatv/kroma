// Shared scrub-bar "storyboard" hook, behind each client's seek preview. Loads an
// item's single sprite sheet of evenly-spaced thumbnails for the YouTube-style
// hover / 10-foot scrub preview. The server builds the sheet lazily, so this polls
// while it is `pending`, then preloads the image so the first hover/scrub paints
// instantly. Per-position cost is a CSS `background-position` lookup: no canvas,
// no per-frame decode.
//
// The client is injected so the web (global `kromaClient()`) and the TV (its auth
// client) can share the exact same logic. `generate: false` (dashboard thumbs)
// does a single fetch and never polls/awaits lazy generation, so it cannot compete
// with live-playback IO.

import type { KromaClient, StoryboardManifest } from '@kroma/core';
import { useCallback, useEffect, useState } from 'react';
import { Image } from 'react-native';
import { webDocument } from '#ui/lib/dom';

/**
 * One preview tile, scaled to a requested display width.
 *
 * Geometry rather than CSS: the tile is a window onto a sprite sheet, and it is
 * described here as "draw the whole sheet at this size, offset by this much,
 * and clip it to width x height". A browser could express that as a
 * `background-position`, but React Native has no such thing - its
 * `experimental_backgroundImage` takes gradients, not `url()` - so the CSS
 * spelling rendered nothing at all on Apple TV. The offsets below draw
 * identically on both.
 */
export interface StoryboardTile {
  /** Display size of the visible tile. */
  width: number;
  height: number;
  /** The sprite sheet holding every thumbnail. */
  sheet: string;
  /** The sheet's OWN pixel size. Draw it at this size and scale the result by
   *  `scale` - never ask the decoder for `sheetWidth * scale` pixels. A 2560px
   *  sheet blown up to a 4096pt view is 8192px of texture on a 2x display, which
   *  is where the GPU stops drawing and the thumbnail silently comes out empty. */
  sheetWidth: number;
  sheetHeight: number;
  /** Where to move the scaled sheet to bring this tile into the window (<= 0). */
  offsetX: number;
  offsetY: number;
  /** Display size over source size: `width / tileW`. */
  scale: number;
}

export interface Storyboard {
  /** True once the manifest is resolved AND the sprite sheet has finished loading. */
  ready: boolean;
  /** CSS for the tile at `sec`, scaled to `displayW` px wide; null until ready. */
  tile: (sec: number, displayW: number) => StoryboardTile | null;
}

const POLL_MS = 1500;
const FAST_POLLS = 40; // ~60 s of fast polling while ffmpeg builds the sheet
const SLOW_MS = 15000; // then back off, so a late finish on a slow NAS is still caught
const MAX_TRIES = FAST_POLLS + 240; // overall bound (~1 h) so we never dead-stop early

/**
 * Loads an item's scrub-bar storyboard for the seek preview. Polls while the sheet
 * is `pending`, then preloads it so the first hover/scrub never flashes an empty or
 * half-loaded sheet.
 *
 * `generate: false` (dashboard thumbnails) does a single fetch and never
 * polls/awaits lazy generation, so it can't compete with live-playback IO.
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

    // Preload so the first hover never flashes an empty/half-loaded sheet.
    //
    // React Native's own prefetch rather than `new Image()`: the DOM constructor
    // does not exist on a television, and because this runs inside the poll's
    // promise chain the ReferenceError was swallowed by its `.catch` - the sheet
    // silently never became `loaded`, so the Apple TV scrub preview showed a
    // timecode and never a picture. `Image.prefetch` is implemented by both React
    // Native and react-native-web.
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
            if (!generate) return; // dashboard thumbs never kick/await generation
            tries += 1;
            // Fast poll for the first ~60 s, then slow poll (never a dead stop).
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

    // Re-check when the tab becomes visible again, so a sheet that finished while
    // backgrounded is picked up without a tight interval. (Only for the real
    // player: dashboard thumbs stay a single fetch.)
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
