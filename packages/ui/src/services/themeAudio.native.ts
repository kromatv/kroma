// Detail-page theme playback on native. expo-video rather than expo-audio: its
// pod is already linked in, so a theme needs no extra native module.

import { useVideoPlayer, type VideoPlayer } from 'expo-video';
import { type RefObject, useCallback, useEffect, useRef, useState } from 'react';
import {
  FADE_IN_MS,
  FADE_OUT_MS,
  readThemeMuted,
  TARGET_VOLUME,
  writeThemeMuted,
} from '#ui/lib/theme-audio';

/** Same shape as the web half, so callers need no platform branch. */
export interface ThemeAudio {
  active: boolean;
  muted: boolean;
  toggle: () => void;
}

// Every touch of the player lives in these module-level helpers, for two
// reasons at once: expo-video releases the native object with the screen and a
// call after that throws out of the Swift bridge (React Native turns it into
// SIGABRT), and the React Compiler refuses a hook that mutates a value another
// hook returned.

function setLevel(player: VideoPlayer, level: RefObject<number>, value: number): void {
  level.current = Math.min(1, Math.max(0, value));
  try {
    player.volume = level.current;
  } catch {
    // Released with the screen; the fade that is running will stop itself.
  }
}

function pauseQuietly(player: VideoPlayer): void {
  try {
    player.pause();
  } catch {
    // Already gone.
  }
}

function playQuietly(player: VideoPlayer): boolean {
  try {
    player.play();
    return true;
  } catch {
    return false;
  }
}

// This interval owns itself: the screen is going, so nothing else clears it.
function fadeOutAlone(player: VideoPlayer, level: RefObject<number>): void {
  const steps = Math.max(1, Math.round(FADE_OUT_MS / 50));
  const from = level.current;
  let i = 0;
  const out = setInterval(() => {
    i += 1;
    level.current = Math.max(0, from * (1 - i / steps));
    try {
      player.volume = level.current;
      if (i < steps) return;
      player.pause();
    } catch {
      // Released before the fade finished; stop quietly.
    }
    if (i >= steps) clearInterval(out);
  }, 50);
}

/** Loops `themeUrl` quietly, fading in once it can play and out on the way out. */
export function useThemeAudio(themeUrl: string | null | undefined): ThemeAudio {
  const [muted, setMuted] = useState(readThemeMuted);
  const fade = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  // Nothing here may READ from the player (see the helpers above).
  const level = useRef(0);

  const player = useVideoPlayer(themeUrl ?? null, (p) => {
    p.loop = true;
    p.volume = 0;
  });

  const fadeTo = useCallback(
    (target: number, ms: number, thenPause = false) => {
      clearInterval(fade.current);
      const steps = Math.max(1, Math.round(ms / 50));
      const from = level.current;
      let i = 0;
      fade.current = setInterval(() => {
        i += 1;
        setLevel(player, level, from + (target - from) * (i / steps));
        if (i < steps) return;
        clearInterval(fade.current);
        if (thenPause) pauseQuietly(player);
      }, 50);
    },
    [player],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on the theme and its player only. Re-running when `fadeTo` changes identity would restart the film's theme from the top on an unrelated render.
  useEffect(() => {
    if (!themeUrl || readThemeMuted()) return;
    setLevel(player, level, 0);
    if (!playQuietly(player)) return;
    fadeTo(TARGET_VOLUME, FADE_IN_MS);
    return () => {
      clearInterval(fade.current);
      fadeOutAlone(player, level);
    };
  }, [themeUrl, player]);

  const toggle = useCallback(() => {
    const next = !readThemeMuted();
    writeThemeMuted(next);
    setMuted(next);
    if (next) {
      fadeTo(0, 250, true);
      return;
    }
    if (!playQuietly(player)) return;
    fadeTo(TARGET_VOLUME, 400);
  }, [fadeTo, player]);

  return { active: Boolean(themeUrl), muted, toggle };
}
