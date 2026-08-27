import { useCallback, useEffect, useMemo, useState } from 'react';
import { useStableCallback } from '#ui/lib/stable-callback';
import { useControllable } from '#ui/lib/use-controllable';

type StepReason = 'next' | 'previous' | 'goTo' | 'reset';

interface StepperValueDetails {
  reason: StepReason;
}

interface StepperFlowOptions {
  value?: string;
  /** Where an uncontrolled flow opens. Defaults to the first step, and seeds
   *  how far the flow counts as having been. */
  defaultValue?: string;
  onValueChange?: (next: string, details: StepperValueDetails) => void;
  /** The steps that are done, when the caller keeps that itself. Left out, a
   *  step counts as done once the flow has been past it. */
  complete?: readonly string[];
  /** Steps nothing may enter: skipped by `next`, `previous` and the arrow keys
   *  rather than stopped on. */
  disabled?: readonly string[];
}

interface StepperFlow {
  steps: readonly string[];
  value: string;
  index: number;
  count: number;
  first: boolean;
  last: boolean;
  canGoNext: boolean;
  canGoPrevious: boolean;
  next: () => void;
  previous: () => void;
  /** Goes to any step the flow holds, ahead of its furthest point included. */
  goTo: (step: string) => void;
  /** Back to the first step, forgetting how far the flow had been. */
  reset: () => void;
  complete: (step: string) => boolean;
  reachable: (step: string) => boolean;
}

/** The wizard state machine, with no component around it: hand it the step ids
 *  in order. */
function useSteps(steps: readonly string[], options: StepperFlowOptions = {}): StepperFlow {
  const { value, defaultValue, onValueChange, complete, disabled } = options;
  const [held, setHeld] = useControllable(value, defaultValue ?? steps[0] ?? '');
  const seat = steps.indexOf(held);
  const index = seat === -1 ? 0 : seat;
  const current = steps[index] ?? '';

  // Raised in an effect so a controlled value that jumps forward and comes back
  // does not take the steps it opened away again.
  const [visited, setVisited] = useState(index);
  const reached = Math.max(visited, index);
  useEffect(() => {
    setVisited((far) => Math.max(far, index));
  }, [index]);

  const off = useMemo(() => new Set(disabled), [disabled]);
  const done = useMemo(() => (complete ? new Set(complete) : null), [complete]);

  const seek = (from: number, delta: 1 | -1) => {
    for (let at = from + delta; at >= 0 && at < steps.length; at += delta) {
      const key = steps[at];
      if (key !== undefined && !off.has(key)) return at;
    }
    return -1;
  };

  const land = useStableCallback((at: number, reason: StepReason) => {
    const key = steps[at];
    if (key === undefined || key === current) return;
    setVisited((far) => Math.max(far, at));
    setHeld(key);
    onValueChange?.(key, { reason });
  });

  const next = useStableCallback(() => land(seek(index, 1), 'next'));
  const previous = useStableCallback(() => land(seek(index, -1), 'previous'));

  const goTo = useStableCallback((step: string) => {
    if (!off.has(step)) land(steps.indexOf(step), 'goTo');
  });

  const reset = useStableCallback(() => {
    setVisited(0);
    land(0, 'reset');
  });

  // Plain callbacks, not stable ones: both are read while a part renders, and a
  // frozen closure would answer from the render before the flow moved.
  const isComplete = useCallback(
    (step: string) => {
      if (done) return done.has(step);
      const at = steps.indexOf(step);
      return at !== -1 && at < reached;
    },
    [done, steps, reached],
  );

  const isReachable = useCallback(
    (step: string) => {
      const at = steps.indexOf(step);
      if (at === -1 || off.has(step)) return false;
      if (done) return step === current || done.has(step);
      return at <= reached;
    },
    [done, off, steps, reached, current],
  );

  return {
    steps,
    value: current,
    index,
    count: steps.length,
    first: index === 0,
    last: index === steps.length - 1,
    canGoNext: seek(index, 1) !== -1,
    canGoPrevious: seek(index, -1) !== -1,
    next,
    previous,
    goTo,
    reset,
    complete: isComplete,
    reachable: isReachable,
  };
}

export type { StepperFlow, StepperFlowOptions, StepperValueDetails };
export { useSteps };
