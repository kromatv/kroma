// Detail-page theme playback, native (Apple TV / Android TV / phones).
//
// The browser half (themeAudio.web.ts) is built on `new Audio()`, which does not
// exist in React Native: reaching for it threw a ReferenceError that the runtime
// turned into SIGABRT, so opening a series page killed the app outright. This is
// the same feature, built on what the native targets actually have.
//
// expo-video rather than expo-audio: its pod is ALREADY linked into the tvOS and
// mobile binaries (the player uses it), so a theme plays without adding a native
// module and without anyone having to rebuild before they can sign in again. A
// player with no view attached is audio-only, which is what a theme is.
//
// Everything the DESIGN specifies is shared with the web half in
// ./lib/theme-audio: the quiet level, the fade timings, the mute preference.
// Only the machinery differs.

import { useVideoPlayer } from 'expo-video';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FADE_IN_MS,
  FADE_OUT_MS,
  readThemeMuted,
  TARGET_VOLUME,
  writeThemeMuted,
} from '#ui/lib/theme-audio';

/** Same shape as the web half, so callers need no platform branch. */
export interface ThemeAudio {
  /** Whether a theme is available gates whether the mute toggle renders. */
  active: boolean;
  muted: boolean;
  toggle: () => void;
}

/**
 * Plex-style theme playback for a detail page: loops `themeUrl` quietly, fading
 * in once it can play and fading out on the way out (the user hits Play, or
 * leaves the page).
 *
 * There is no autoplay gate to work around here, which is why this is shorter
 * than the browser half: a television app is allowed to make sound.
 */
export function useThemeAudio(themeUrl: string | null | undefined): ThemeAudio {
  const [muted, setMuted] = useState(readThemeMuted);
  const fade = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  // Our own notion of the level, so nothing here ever READS from the player.
  // expo-video releases the native object when the screen goes, and a read after
  // that is not a soft failure - it throws
  //   NotFoundException: Unable to find the native shared object
  // out of the Swift bridge, which React Native turns into SIGABRT. Writes are
  // guarded one by one; reads are simply never made.
  const level = useRef(0);

  const player = useVideoPlayer(themeUrl ?? null, (p) => {
    p.loop = true;
    p.volume = 0;
  });

  /** Set the level, tolerating a player the platform has already released. */
  const setLevel = useCallback(
    (value: number) => {
      level.current = Math.min(1, Math.max(0, value));
      try {
        player.volume = level.current;
      } catch {
        // Released with the screen; the fade that is running will stop itself.
      }
    },
    [player],
  );

  /** Ramp the volume toward `target` over `ms`, then optionally stop. */
  const fadeTo = useCallback(
    (target: number, ms: number, thenPause = false) => {
      clearInterval(fade.current);
      const steps = Math.max(1, Math.round(ms / 50));
      const from = level.current;
      let i = 0;
      fade.current = setInterval(() => {
        i += 1;
        setLevel(from + (target - from) * (i / steps));
        if (i < steps) return;
        clearInterval(fade.current);
        if (!thenPause) return;
        try {
          player.pause();
        } catch {
          // Already gone.
        }
      }, 50);
    },
    [player, setLevel],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on the theme and its player only. Re-running when `fadeTo` changes identity would restart the film's theme from the top on an unrelated render.
  useEffect(() => {
    if (!themeUrl || readThemeMuted()) return;
    setLevel(0);
    try {
      player.play();
    } catch {
      return;
    }
    fadeTo(TARGET_VOLUME, FADE_IN_MS);
    return () => {
      // Fade out on the way out. This interval owns itself: the screen is going
      // away, so nothing else will clear it before it reaches silence.
      clearInterval(fade.current);
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
    };
  }, [themeUrl, player, setLevel]);

  const toggle = useCallback(() => {
    const next = !readThemeMuted();
    writeThemeMuted(next);
    setMuted(next);
    if (next) {
      fadeTo(0, 250, true);
      return;
    }
    try {
      player.play();
    } catch {
      return;
    }
    fadeTo(TARGET_VOLUME, 400);
  }, [fadeTo, player]);

  return { active: Boolean(themeUrl), muted, toggle };
}
