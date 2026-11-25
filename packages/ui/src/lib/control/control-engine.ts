import type { ChangeDetails, ChangeSource } from './control-types';
import type { Control } from './control';

/** One change that took effect, as an observer hears it. */
export type ControlChange = {
  readonly control: Control;
  readonly key: string;
  readonly previous: unknown;
  readonly next: unknown;
  readonly details: ChangeDetails;
};

type Observer = (change: ControlChange) => void;

function createRoster<T>() {
  const members = new Set<T>();
  return {
    add: (member: T) => {
      members.add(member);
      return () => {
        members.delete(member);
      };
    },
    all: (): readonly T[] => [...members],
  };
}

function createSigner() {
  let source: ChangeSource = 'user';
  return {
    source: () => source,
    /** Runs `run` with its changes signed by `next`, so a callback can tell a
     *  tool's change from a person's. */
    as: <T>(next: ChangeSource, run: () => T): T => {
      const previous = source;
      source = next;
      try {
        return run();
      } finally {
        source = previous;
      }
    },
  };
}

function createRefs() {
  const refs = new WeakMap<Control, string>();
  let count = 0;
  return (control: Control): string => {
    const known = refs.get(control);
    if (known !== undefined) {
      return known;
    }
    count += 1;
    refs.set(control, `c${count}`);
    return `c${count}`;
  };
}

/**
 * The controls one app tree has on screen, and every change they make. A
 * `KitProvider` owns one, and a control joins it while it is mounted.
 */
export function createControlEngine() {
  const mounted = createRoster<Control>();
  const observers = createRoster<Observer>();
  return {
    ...createSigner(),
    /** A short name for a control, `c4`, its own for as long as the control lives. */
    ref: createRefs(),
    add: mounted.add,
    controls: mounted.all,
    /** Hears every change that took effect, until the returned function is called. */
    observe: observers.add,
    report: (change: ControlChange) => {
      for (const observer of observers.all()) {
        observer(change);
      }
    },
  };
}

export type ControlEngine = ReturnType<typeof createControlEngine>;
