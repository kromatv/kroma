// Detail-page theme playback, web (Tizen / webOS / desktop / browser).
//
// Built on `new Audio()`, which is the whole reason this file exists separately:
// React Native has no such constructor, and reaching for it there threw a
// ReferenceError the runtime turned into SIGABRT, so opening a series page
// killed the app outright. The native half (themeAudio.ts) is the same feature
// on an expo-video player.
//
// Everything the DESIGN specifies - the quiet level, the fade timings, the mute
// preference and the key it lives under - is shared with the native half in
// ./lib/theme-audio. Only the machinery differs.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FADE_IN_MS,
  FADE_OUT_MS,
  readThemeMuted,
  TARGET_VOLUME,
  writeThemeMuted,
} from '#ui/lib/theme-audio';

/** Fade a (detached) audio element to silence over `ms`, then pause it owning a
 * private interval so it always completes. Used on unmount/theme change: the
 * in-component `fadeTo` shares one ref, so the *next* theme's fade-in would clear
 * a shared fade-out before it paused the previous element, leaving it looping. */
function fadeOutAndStop(a: HTMLAudioElement, ms: number): void {
  const steps = Math.max(1, Math.round(ms / 50));
  const from = a.volume;
  let i = 0;
  const id = setInterval(() => {
    i += 1;
    a.volume = Math.max(0, from * (1 - i / steps));
    if (i >= steps) {
      clearInterval(id);
      a.pause();
    }
  }, 50);
}

/** Same shape as the native half, so callers need no platform branch. */
export interface ThemeAudio {
  /** Whether a theme is available gates whether the mute toggle renders. */
  active: boolean;
  muted: boolean;
  toggle: () => void;
}

/**
 * Plex-style theme playback for a detail page: loops `themeUrl` at a low volume,
 * fading in once it can play and fading out + stopping on unmount (i.e. when the
 * user hits Play or navigates away).
 *
 * Browsers gate autoplay-with-sound behind a user gesture arriving on this page
 * via a click usually satisfies that, and a one-shot pointer/key fallback covers
 * the rest. The mute preference is persisted per device so it survives the trip
 * between pages; React state mirrors it only for the toggle icon (kept SSR-safe
 * by starting unmuted and syncing on mount).
 */
export function useThemeAudio(themeUrl: string | null | undefined): ThemeAudio {
  const [muted, setMuted] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fadeRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  // Reflect the stored preference once mounted (no storage read during SSR).
  useEffect(() => setMuted(readThemeMuted()), []);

  // Ramp the element volume toward `target` over `ms`, then optionally pause.
  const fadeTo = useCallback((target: number, ms: number, thenPause = false) => {
    const a = audioRef.current;
    if (!a) return;
    clearInterval(fadeRef.current);
    const steps = Math.max(1, Math.round(ms / 50));
    const from = a.volume;
    let i = 0;
    fadeRef.current = setInterval(() => {
      i += 1;
      a.volume = Math.min(1, Math.max(0, from + (target - from) * (i / steps)));
      if (i >= steps) {
        clearInterval(fadeRef.current);
        if (thenPause) a.pause();
      }
    }, 50);
  }, []);

  // (Re)create the audio element for the current theme.
  useEffect(() => {
    if (!themeUrl) return;
    const a = new Audio(themeUrl);
    a.loop = true;
    a.preload = 'auto';
    a.volume = 0;
    audioRef.current = a;

    const start = () => {
      if (readThemeMuted()) return;
      const p = a.play();
      if (p != null && typeof p.then === 'function')
        p.then(() => fadeTo(TARGET_VOLUME, FADE_IN_MS)).catch(() => undefined);
      else fadeTo(TARGET_VOLUME, FADE_IN_MS);
    };

    // Autoplay-with-sound may still be blocked; unblock on the first gesture.
    const unblock = () => {
      if (a.paused) start();
    };
    document.addEventListener('pointerdown', unblock, { once: true });
    document.addEventListener('keydown', unblock, { once: true });

    start();

    return () => {
      document.removeEventListener('pointerdown', unblock);
      document.removeEventListener('keydown', unblock);
      // Stop any in-flight in-component fade (shared ref), then fade THIS element
      // out on its own interval so a remount's fade-in can't cancel it before it
      // pauses otherwise the old <audio loop> keeps playing forever.
      clearInterval(fadeRef.current);
      audioRef.current = null;
      fadeOutAndStop(a, FADE_OUT_MS);
    };
  }, [themeUrl, fadeTo]);

  const toggle = useCallback(() => {
    const next = !readThemeMuted();
    writeThemeMuted(next);
    setMuted(next);
    const a = audioRef.current;
    if (!a) return;
    if (next) {
      fadeTo(0, 250, true);
      return;
    }
    const p = a.play();
    if (p != null && typeof p.then === 'function') p.catch(() => undefined);
    fadeTo(TARGET_VOLUME, 400);
  }, [fadeTo]);

  return { active: Boolean(themeUrl), muted, toggle };
}
