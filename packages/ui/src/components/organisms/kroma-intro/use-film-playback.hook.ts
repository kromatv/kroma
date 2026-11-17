import { type RefObject, useEffect, useEffectEvent } from 'react';
import { armStallSafety, playSoundFirst, restart, whenVisible } from './film-playback';
import type { IntroExit } from './use-intro-exit.hook';
import { useIntroKeys } from './use-intro-keys.hook';

const UNMUTE_REWIND_S = 0.4;

interface FilmPlaybackParams {
  video: RefObject<HTMLVideoElement | null>;
  intro: IntroExit;
  loop: boolean;
  playable: boolean;
}

export interface FilmPlayback {
  /** Re-arms the stall-safety timer, from the film's own length once its metadata is in. */
  rearm: () => void;
  /** The film reached its last frame: it replays when looping, else exits. */
  ended: () => void;
}

interface FilmControls extends FilmPlayback {
  replay: () => void;
  unblock: () => void;
}

function filmControls({ video, intro, loop }: FilmPlaybackParams): FilmControls {
  const rearm = () => {
    if (loop) {
      intro.disarmSafety();
    } else {
      armStallSafety({ video, arm: intro.armSafety, exit: intro.exit });
    }
  };
  const replay = () => {
    const v = video.current;
    if (v) {
      intro.reopen();
      restart(v);
      rearm();
    }
  };
  const unblock = () => {
    const v = video.current;
    if (!v?.muted || intro.exitedRef.current) {
      return;
    }
    v.muted = false;
    if (v.currentTime < UNMUTE_REWIND_S) {
      restart(v);
      rearm();
    }
  };
  return { rearm, replay, unblock, ended: () => (loop ? replay() : intro.exit()) };
}

function useFilmStart({ video, intro, playable }: FilmPlaybackParams, rearm: () => void): void {
  const { handOff, clearTimers } = intro;
  const begin = useEffectEvent((v: HTMLVideoElement) => {
    rearm();
    return whenVisible(() => playSoundFirst(v, handOff));
  });

  useEffect(() => {
    const v = video.current;
    if (!v || !playable) {
      handOff();
      return undefined;
    }
    const stopWaiting = begin(v);
    return () => {
      stopWaiting();
      clearTimers();
      v.pause();
    };
  }, [video, playable, handOff, clearTimers]);
}

/**
 * The film's timeline: sound-first autoplay with a muted fallback, the skip and
 * replay keys, the first gesture bringing the sound in (rewinding only a film
 * that has barely started, so a late click never restarts it), and a hand-off at
 * once when even muted playback is refused.
 */
export function useFilmPlayback(params: FilmPlaybackParams): FilmPlayback {
  const { rearm, replay, unblock, ended } = filmControls(params);
  useIntroKeys({ exit: params.intro.exit, replay, unblock });
  useFilmStart(params, rearm);
  return { rearm, ended };
}
