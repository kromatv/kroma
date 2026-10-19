import { useCallback, useEffect, useState } from 'react';

export const RESUME_WINDOW = 6;

const SEEK_JUMP_SEC = 5;

export interface ResumeNotice {
  shown: boolean;
  /** Whole seconds before the prompt leaves on its own, null once it stopped counting. */
  secondsLeft: number | null;
  total: number;
  dismiss: () => void;
  holdOpen: () => void;
}

type Phase = 'waiting' | 'counting' | 'kept' | 'gone';

/**
 * `at` is the second playback opened on; pass none where nothing was resumed. The
 * window opens on the first moving picture rather than on the first frame asked
 * for, so a slow stream does not spend it behind a spinner.
 */
export function useResumeNotice(opts: {
  at?: number;
  cur: number;
  playing: boolean;
  waiting: boolean;
}): ResumeNotice {
  const { at, cur, playing, waiting } = opts;
  const [phase, setPhase] = useState<Phase>('waiting');
  const [secondsLeft, setSecondsLeft] = useState(RESUME_WINDOW);
  const [offered, setOffered] = useState(at);
  const [track, setTrack] = useState({
    cur,
    shown: false,
    at,
    landed: at != null && Math.abs(cur - at) <= SEEK_JUMP_SEC,
  });
  const shown = phase === 'counting' || phase === 'kept';

  // Stated during the render that changes it rather than in an effect, which
  // would leave one frame showing the last film's time.
  if (offered !== at) {
    setOffered(at);
    setPhase('waiting');
  }

  if (phase === 'waiting' && at != null && playing && !waiting) {
    setPhase('counting');
    setSecondsLeft(RESUME_WINDOW);
  }

  if (phase === 'counting' && secondsLeft === 0) setPhase('gone');

  useEffect(() => {
    if (phase !== 'counting') return;
    const tick = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(tick);
  }, [phase]);

  if (track.cur !== cur || track.shown !== shown || track.at !== at) {
    const landed = track.at === at && track.landed;
    if (shown && landed && Math.abs(cur - track.cur) > SEEK_JUMP_SEC) setPhase('gone');
    setTrack({
      cur,
      shown,
      at,
      landed: landed || (at != null && Math.abs(cur - at) <= SEEK_JUMP_SEC),
    });
  }

  return {
    shown,
    secondsLeft: phase === 'counting' ? secondsLeft : null,
    total: RESUME_WINDOW,
    dismiss: useCallback(() => setPhase('gone'), []),
    holdOpen: useCallback(() => setPhase((p) => (p === 'counting' ? 'kept' : p)), []),
  };
}
