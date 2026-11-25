import { useState } from 'react';
import {
  type ChangeDetails,
  defineControl,
  type ReasonOf,
  typed,
  useControl,
} from '#ui/lib/control';
import { useStableCallback } from '#ui/lib/stable-callback.hook';

type Seats = { readonly steps: readonly string[]; readonly disabled: readonly string[] };

type Seated = Seats & { readonly value: string };

const seatOf = (steps: readonly string[], value: string) => Math.max(0, steps.indexOf(value));

function seek({ steps, disabled }: Seats, from: number, delta: 1 | -1): number {
  for (let at = from + delta; at >= 0 && at < steps.length; at += delta) {
    const key = steps[at];
    if (key !== undefined && !disabled.includes(key)) {
      return at;
    }
  }
  return -1;
}

function moveTo(now: Seated, at: number): { value?: string } {
  const key = now.steps[at];
  return key === undefined || key === now.steps[seatOf(now.steps, now.value)] ? {} : { value: key };
}

const stepFrom = (now: Seated, delta: 1 | -1) =>
  moveTo(now, seek(now, seatOf(now.steps, now.value), delta));

const stepsControl = defineControl('steps', {
  state: { value: '' },
  options: { steps: typed<readonly string[]>([]), disabled: typed<readonly string[]>([]) },
  actions: {
    next: (now) => stepFrom(now, 1),
    previous: (now) => stepFrom(now, -1),
    goTo: (now, step: string) =>
      now.disabled.includes(step) ? {} : moveTo(now, now.steps.indexOf(step)),
    reset: (now) => moveTo(now, 0),
  },
  reasons: [],
});

type StepperValueDetails = ChangeDetails<ReasonOf<typeof stepsControl>>;

interface StepperFlowOptions {
  value?: string;
  /** Where an uncontrolled flow opens. Defaults to the first step, and seeds
   *  how far the flow counts as having been. */
  defaultValue?: string;
  onValueChange?: (next: string, details: StepperValueDetails) => void;
  /** The steps that are done, when the caller keeps that itself. Left out, a
   *  step counts as done once the flow has been past it. */
  complete?: readonly string[];
  /** The steps a press may go to besides the done ones, when the caller keeps
   *  `complete` itself: a step the flow has been to and has not finished. */
  open?: readonly string[];
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
  const { value, complete, open, disabled = [] } = options;
  const start = options.defaultValue ?? steps[0] ?? '';
  const [visited, setVisited] = useState(() => seatOf(steps, value ?? start));
  const onValueChange = (next: string, details: StepperValueDetails) => {
    options.onValueChange?.(next, details);
    if (!details.canceled) {
      setVisited((far) => (details.reason === 'reset' ? 0 : Math.max(far, steps.indexOf(next))));
    }
  };
  const [flow] = useControl(stepsControl, {
    value,
    defaultValue: start,
    onValueChange,
    steps,
    disabled,
  });
  const index = seatOf(steps, flow.value);
  const current = steps[index] ?? '';
  const reached = Math.max(visited, index);
  if (index > visited) {
    setVisited(index);
  }

  const done = complete ? new Set(complete) : null;
  const ajar = new Set(open);
  const off = new Set(disabled);

  const reset = useStableCallback(() => {
    if (index === 0) {
      setVisited(0);
    }
    flow.reset();
  });

  // Plain callbacks, not stable ones: both are read while a part renders, and a
  // frozen closure would answer from the render before the flow moved.
  const isComplete = (step: string) => {
    if (done) {
      return done.has(step);
    }
    const at = steps.indexOf(step);
    return at !== -1 && at < reached;
  };

  const isReachable = (step: string) => {
    const at = steps.indexOf(step);
    if (at === -1 || off.has(step)) {
      return false;
    }
    if (done) {
      return step === current || done.has(step) || ajar.has(step);
    }
    return at <= reached;
  };

  return {
    steps,
    value: current,
    index,
    count: steps.length,
    first: index === 0,
    last: index === steps.length - 1,
    canGoNext: seek(flow, index, 1) !== -1,
    canGoPrevious: seek(flow, index, -1) !== -1,
    next: flow.next,
    previous: flow.previous,
    goTo: flow.goTo,
    reset,
    complete: isComplete,
    reachable: isReachable,
  };
}

export type { StepperFlow, StepperFlowOptions, StepperValueDetails };
export { useSteps };
