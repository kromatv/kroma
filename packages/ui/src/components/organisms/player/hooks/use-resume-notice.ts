import { useCallback, useEffect, useRef, useState } from 'react';

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
  const seen = useRef(cur);
  const landed = useRef(false);
  const landedAt = useRef(at);
  const shown = phase === 'counting' || phase === 'kept';

  // Stated during the render that changes it rather than in an effect, which
  // would leave one frame showing the last film's time.
  if (offered !== at) {
    setOffered(at);
    setPhase('waiting');
  }

  useEffect(() => {
    if (at == null || !playing || waiting) return;
    setPhase((p) => (p === 'waiting' ? 'counting' : p));
  }, [at, playing, waiting]);

  useEffect(() => {
    if (phase !== 'counting') return;
    setSecondsLeft(RESUME_WINDOW);
    const tick = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(tick);
  }, [phase]);

  useEffect(() => {
    if (phase === 'counting' && secondsLeft === 0) setPhase('gone');
  }, [phase, secondsLeft]);

  // A shell that anchors its stream reports the clock at 0 until the offset
  // lands, so the first jump of all is the film arriving where it was left.
  // Nothing counts as a seek until it has got there.
  useEffect(() => {
    if (landedAt.current !== at) {
      landedAt.current = at;
      landed.current = false;
    }
    const armed = shown && landed.current;
    if (armed && Math.abs(cur - seen.current) > SEEK_JUMP_SEC) setPhase('gone');
    if (at != null && Math.abs(cur - at) <= SEEK_JUMP_SEC) landed.current = true;
    seen.current = cur;
  }, [cur, shown, at]);

  return {
    shown,
    secondsLeft: phase === 'counting' ? secondsLeft : null,
    total: RESUME_WINDOW,
    dismiss: useCallback(() => setPhase('gone'), []),
    holdOpen: useCallback(() => setPhase((p) => (p === 'counting' ? 'kept' : p)), []),
  };
}
