import { type RefObject, useCallback, useLayoutEffect, useRef, useState } from 'react';
import { EXIT_MS } from './constants';

export interface IntroExit {
  exiting: boolean;
  exitedRef: RefObject<boolean>;
  /** (Re-)arms the stall-safety timer: `run` fires once, `ms` from now. Arming
   *  replaces the previous timer; `exit` and `reopen` clear it. */
  armSafety: (ms: number, run: () => void) => void;
  /** Drops the safety timer without exiting (a looping intro never stalls out). */
  disarmSafety: () => void;
  exit: () => void;
  reopen: () => void;
  clearTimers: () => void;
}

/**
 * Single-shot end-of-intro lifecycle: `exit()` fades to black and hands off to
 * `onDone` one {@link EXIT_MS} later, at most once per run. The hand-off is a
 * timer rather than a transition callback because TV webviews drop
 * `transitionend`; `onDone` is read through a ref so mount-only effects in the
 * caller never re-run and restart the intro.
 */
export function useIntroExit(onDone: () => void): IntroExit {
  const [exiting, setExiting] = useState(false);
  const safetyRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const exitRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const exitedRef = useRef(false);
  const onDoneRef = useRef(onDone);
  useLayoutEffect(() => {
    onDoneRef.current = onDone;
  });

  const exit = useCallback(() => {
    if (exitedRef.current) return;
    exitedRef.current = true;
    clearTimeout(safetyRef.current);
    setExiting(true);
    exitRef.current = setTimeout(() => onDoneRef.current(), EXIT_MS);
  }, []);

  const reopen = useCallback(() => {
    exitedRef.current = false;
    clearTimeout(safetyRef.current);
    clearTimeout(exitRef.current);
    setExiting(false);
  }, []);

  const clearTimers = useCallback(() => {
    clearTimeout(safetyRef.current);
    clearTimeout(exitRef.current);
  }, []);

  const armSafety = useCallback((ms: number, run: () => void) => {
    clearTimeout(safetyRef.current);
    safetyRef.current = setTimeout(run, ms);
  }, []);

  const disarmSafety = useCallback(() => clearTimeout(safetyRef.current), []);

  return { exiting, exitedRef, armSafety, disarmSafety, exit, reopen, clearTimers };
}
