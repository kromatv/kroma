import type { KromaClient } from '@kromatv/client';
import type { MediaItem } from '@kromatv/client/media';
import { webDocument } from '@kromatv/ui/kit';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { getTauri } from '#tv/features/playback/player/engine';

// Hoisted so the `arrayBuffer().then().catch()` chain doesn't nest inside
// the canvas callback.
function deliverJpegBytes(jpeg: Blob | null, done: (out: Uint8Array | null) => void): void {
  if (!jpeg) {
    done(null);
    return;
  }
  jpeg
    .arrayBuffer()
    .then((buf) => done(new Uint8Array(buf)))
    .catch(() => done(null));
}

// Re-encodes any poster blob (WebP / JPEG / the generated SVG) as JPEG: a
// raster the OS's NSImage decodes reliably, since it can't render SVG at all.
function rasterize(blob: Blob, w = 342, h = 513): Promise<Uint8Array | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    const done = (out: Uint8Array | null) => {
      URL.revokeObjectURL(url);
      resolve(out);
    };
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return done(null);
        ctx.drawImage(img, 0, 0, w, h);
        // JPEG, not PNG: a poster is a photo, so this is far smaller on the Tauri IPC
        // (the bytes cross as a number[]); NSImage decodes it just the same.
        canvas.toBlob((jpeg) => deliverJpegBytes(jpeg, done), 'image/jpeg', 0.82);
      } catch {
        done(null);
      }
    };
    img.onerror = () => done(null);
    img.src = url;
  });
}

// Best-effort poster bytes for the OS widget: prefer the real cached art,
// falling back to a full-item fetch for a lightweight item missing its metadata.
async function resolveArtwork(client: KromaClient, item: MediaItem): Promise<number[]> {
  try {
    const full = item.metadata?.posterUrl
      ? item
      : await client.media.item(item.id).catch(() => item);
    const blob = await client.media.artwork.posterBlob(full);
    const jpeg = await rasterize(blob);
    return jpeg ? Array.from(jpeg) : [];
  } catch {
    return [];
  }
}

export interface NowPlayingInput {
  client: KromaClient;
  item: MediaItem;
  title: string;
  subtitle: string;
  durationSec: number;
  positionSec: number;
  playing: boolean;
  seekTo: (sec: number) => void;
  togglePlay: () => void;
  seek: (deltaSec: number) => void;
  seekNonce: number;
}

const HOLD_REPEAT_MS = 100;

const REMOTE_KEY: Record<string, string> = {
  next: 'MediaFastForward',
  prev: 'MediaRewind',
  'hold:forward:begin': 'MediaFastForward',
  'hold:back:begin': 'MediaRewind',
};

function pressRemoteKey(key: string, repeat: boolean): void {
  webDocument()?.dispatchEvent(new KeyboardEvent('keydown', { key, repeat, bubbles: true }));
}

function useHeldKey(): { press(key: string): void; hold(key: string): void; release(): void } {
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const release = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  }, []);
  useEffect(() => release, [release]);
  return useMemo(
    () => ({
      press: (key) => pressRemoteKey(key, false),
      hold: (key) => {
        release();
        pressRemoteKey(key, false);
        timer.current = setInterval(() => pressRemoteKey(key, true), HOLD_REPEAT_MS);
      },
      release,
    }),
    [release],
  );
}

function flips(action: string, playing: boolean): boolean {
  if (action === 'play') return !playing;
  if (action === 'pause') return playing;
  return true;
}

function useShellEvent(
  bridge: ReturnType<typeof getTauri>,
  active: boolean,
  name: string,
  handle: (payload: unknown) => void,
): void {
  const handleRef = useRef(handle);
  useEffect(() => {
    handleRef.current = handle;
  });
  useEffect(() => {
    if (!active || !bridge) return;
    let un: (() => void) | undefined;
    let dead = false;
    void bridge.event
      .listen(name, (e) => handleRef.current((e as { payload?: unknown }).payload))
      .then((u) => {
        if (dead) u();
        else un = u;
      })
      .catch(() => undefined);
    return () => {
      dead = true;
      un?.();
    };
  }, [active, bridge, name]);
}

/** Pushes the current item + playback progress to the OS "Now Playing" widget
 * via the native shell's `set_now_playing` command, and honors its scrubber and
 * the keyboard's media keys. Only active on the macOS libmpv shell; a no-op
 * everywhere else. */
export function useNowPlaying({
  client,
  item,
  title,
  subtitle,
  durationSec,
  positionSec,
  playing,
  seekTo,
  togglePlay,
  seek,
  seekNonce,
}: NowPlayingInput): void {
  const bridge = getTauri();
  const active = !!bridge && '__KROMA_MPV__' in globalThis;

  // Current values in refs so the poster effects don't re-run on every position tick
  // (they only care about item changes / play-pause), yet always send fresh data.
  const infoRef = useRef({ title, subtitle, durationSec, positionSec, playing });
  useEffect(() => {
    infoRef.current = { title, subtitle, durationSec, positionSec, playing };
  });

  // One place to build + send the payload (artwork empty = keep the current poster).
  const push = useCallback(
    (artwork: number[]) => {
      if (!bridge) return;
      const info = infoRef.current;
      void bridge.core
        .invoke('set_now_playing', {
          title: info.title,
          artist: info.subtitle,
          duration: info.durationSec,
          position: info.positionSec,
          playing: info.playing,
          artwork,
        })
        .catch(() => undefined);
    },
    [bridge],
  );

  useShellEvent(bridge, active, 'media-seek', (payload) => {
    const pos = Number(payload ?? Number.NaN);
    if (Number.isFinite(pos)) seekTo(pos);
  });

  const held = useHeldKey();
  useShellEvent(bridge, active, 'media-key', (payload) => {
    const action = String(payload ?? '');
    const skip = /^skip:(-?[\d.]+)$/.exec(action);
    const key = REMOTE_KEY[action];
    if (skip) seek(Number(skip[1]));
    else if (action.startsWith('hold:') && action.endsWith(':end')) held.release();
    else if (key && action.startsWith('hold:')) held.hold(key);
    else if (key) held.press(key);
    else if (flips(action, playing)) togglePlay();
  });

  // On item change ONLY: resolve + rasterize the poster, then push the full info.
  // oxlint-disable-next-line react-hooks/exhaustive-deps -- key on item.id (not identity); title/subtitle/duration are read via ref in push.
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    void resolveArtwork(client, item).then((artwork) => {
      if (!cancelled) push(artwork);
    });
    return () => {
      cancelled = true;
    };
  }, [active, client, item.id, push]);

  // On play/pause and after a seek: update the rate + elapsed time (keep the current poster).
  // oxlint-disable-next-line react-hooks/exhaustive-deps -- fire on play/pause and seeks; the value is read via ref in push.
  useEffect(() => {
    if (active) push([]);
  }, [active, playing, seekNonce, push]);
}
