import type { VideoPlayer } from 'expo-video';
import { type RefObject, useCallback, useEffect, useRef, useState } from 'react';
import { Animated } from 'react-native';
import { EXIT_MS, SAFETY_SLACK_MS } from '#ui/lib/intro-timing';

const FALLBACK_HOLD_MS = 15_000;
const AUDIO_FADE_STEPS = 8;

interface FilmTimers {
  safety?: ReturnType<typeof setTimeout>;
  handoff?: ReturnType<typeof setTimeout>;
  fade?: ReturnType<typeof setInterval>;
}

/** How the native film ends: faded, at once, or by its safety timer. */
export interface FilmExit {
  /** Fades picture and sound out, then hands off. */
  exit: () => void;
  /** Hands off now, with no fade. */
  handOff: () => void;
  /** Ends the film its own length plus slack from now, or after a long hold while that is unknown. */
  armSafety: (durationSec?: number) => void;
  veil: Animated.Value;
}

function fadeVolume(player: VideoPlayer): ReturnType<typeof setInterval> {
  let step = 0;
  const fade = setInterval(() => {
    step += 1;
    try {
      player.volume = Math.max(0, 1 - step / AUDIO_FADE_STEPS);
    } catch {}
    if (step >= AUDIO_FADE_STEPS) {
      clearInterval(fade);
    }
  }, EXIT_MS / AUDIO_FADE_STEPS);
  return fade;
}

function safetyMs(durationSec?: number): number {
  return durationSec && Number.isFinite(durationSec) && durationSec > 0
    ? durationSec * 1000 + SAFETY_SLACK_MS
    : FALLBACK_HOLD_MS;
}

function useClearedOnUnmount(timers: RefObject<FilmTimers>): void {
  useEffect(() => {
    const pending = timers.current;
    return () => {
      clearTimeout(pending.safety);
      clearTimeout(pending.handoff);
      clearInterval(pending.fade);
    };
  }, [timers]);
}

function useOneHandOff(onDone: () => void, timers: RefObject<FilmTimers>) {
  const exited = useRef(false);
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  });
  const claim = useCallback(() => {
    const first = !exited.current;
    exited.current = true;
    clearTimeout(timers.current.safety);
    return first;
  }, [timers]);
  const done = useCallback(() => onDoneRef.current(), []);
  return { claim, done };
}

/** The native film's ending, each path at most once: a fade then the hand-off, or the hand-off alone. */
export function useFilmExit(player: VideoPlayer, onDone: () => void): FilmExit {
  const [veil] = useState(() => new Animated.Value(0));
  const timers = useRef<FilmTimers>({});
  useClearedOnUnmount(timers);
  const { claim, done } = useOneHandOff(onDone, timers);

  const exit = useCallback(() => {
    if (claim()) {
      timers.current.fade = fadeVolume(player);
      Animated.timing(veil, { toValue: 1, duration: EXIT_MS, useNativeDriver: true }).start();
      timers.current.handoff = setTimeout(done, EXIT_MS);
    }
  }, [claim, done, timers, player, veil]);

  const armSafety = useCallback(
    (durationSec?: number) => {
      clearTimeout(timers.current.safety);
      timers.current.safety = setTimeout(exit, safetyMs(durationSec));
    },
    [timers, exit],
  );

  const handOff = useCallback(() => {
    if (claim()) {
      done();
    }
  }, [claim, done]);

  return { exit, handOff, armSafety, veil };
}
