// What a play can do to the stage: press, type and assert, all by accessible name.

import { act } from 'react';
import {
  controlsNamed,
  type Fiber,
  isDisabled,
  isVisible,
  namesUnder,
  pressHandler,
  textOf,
  valueHandler,
} from './play-tree';
import type { PlayContext, PlayExpectation } from './play-types';

const DEFAULT_TIMEOUT = 1000;
const POLL_MS = 15;
const NAMES_SHOWN = 8;

/** A play's own failure: everything the panel prints without a stack. */
class PlayError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PlayError';
  }
}

function quote(name: string): string {
  return `"${name}"`;
}

function actEnvironment(): boolean {
  return (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT === true;
}

// A press is a call, not an event, so React batches whatever it sets and flushes
// on its own schedule. Under a test runner that schedule is `act`'s, and stepping
// outside it is what turns every assertion into a race.
async function flush(work?: () => void): Promise<void> {
  if (actEnvironment()) {
    await act(async () => {
      work?.();
    });
    return;
  }
  work?.();
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

function sleep(ms: number): Promise<void> {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

interface Stage {
  root: () => Fiber | null;
  timeout: number;
}

function rootOrThrow(stage: Stage): Fiber {
  const root = stage.root();
  if (!root) throw new PlayError('the story is not on the stage');
  return root;
}

function nearby(root: Fiber): string {
  const names = namesUnder(root);
  if (names.length === 0) return 'nothing on the stage is named';
  const shown = names.slice(0, NAMES_SHOWN).map(quote).join(', ');
  return `named: ${shown}${names.length > NAMES_SHOWN ? ', …' : ''}`;
}

function pick(root: Fiber, name: string): Fiber | null {
  const found = controlsNamed(root, name);
  if (found.length > 1) {
    throw new PlayError(`${quote(name)} matches ${found.length} controls`);
  }
  return found[0] ?? null;
}

// Every lookup waits: a menu opens on a state change, a dialog behind a
// transition arrives a frame later, and neither is a failure worth reporting.
async function locate(stage: Stage, name: string): Promise<Fiber> {
  const deadline = Date.now() + stage.timeout;
  for (;;) {
    const root = rootOrThrow(stage);
    const found = pick(root, name);
    if (found) return found;
    if (Date.now() >= deadline) {
      throw new PlayError(`no control ${quote(name)}; ${nearby(root)}`);
    }
    await flush();
    await sleep(POLL_MS);
  }
}

type Check = (root: Fiber) => string | null;

async function until(stage: Stage, check: Check): Promise<void> {
  const deadline = Date.now() + stage.timeout;
  for (;;) {
    const failure = check(rootOrThrow(stage));
    if (!failure) return;
    if (Date.now() >= deadline) throw new PlayError(failure);
    await flush();
    await sleep(POLL_MS);
  }
}

function visibleCheck(name: string): Check {
  return (root) => {
    const found = pick(root, name);
    if (!found) return `${quote(name)} is not on the stage; ${nearby(root)}`;
    return isVisible(found, root) ? null : `${quote(name)} is on the stage but hidden`;
  };
}

function textCheck(name: string, wanted: string): Check {
  return (root) => {
    const found = pick(root, name);
    if (!found) return `${quote(name)} is not on the stage; ${nearby(root)}`;
    const text = textOf(found);
    return text.includes(wanted)
      ? null
      : `${quote(name)} reads ${quote(text)}, which does not contain ${quote(wanted)}`;
  };
}

function invert(check: Check, message: string): Check {
  return (root) => (check(root) ? null : message);
}

function expectation(stage: Stage, name: string, negated: boolean): PlayExpectation {
  // A negated matcher asserts once: waiting a second for something to stay
  // absent is a second spent on every passing play.
  const settle = async (check: Check) => {
    if (!negated) return until(stage, check);
    await flush();
    const failure = check(rootOrThrow(stage));
    if (failure) throw new PlayError(failure);
  };
  return {
    get not() {
      return expectation(stage, name, !negated);
    },
    toBeVisible: () =>
      settle(
        negated ? invert(visibleCheck(name), `${quote(name)} is visible`) : visibleCheck(name),
      ),
    toHaveText: (wanted: string) =>
      settle(
        negated
          ? invert(textCheck(name, wanted), `${quote(name)} contains ${quote(wanted)}`)
          : textCheck(name, wanted),
      ),
  };
}

/** Everything a play does to the stage, bar `step`, which belongs to the run
 * recording it. */
function actions(stage: Stage): Omit<PlayContext, 'step'> {
  return {
    press: async (name) => {
      const control = await locate(stage, name);
      if (isDisabled(control)) throw new PlayError(`${quote(name)} is disabled`);
      const fire = pressHandler(control, rootOrThrow(stage));
      if (!fire) throw new PlayError(`${quote(name)} answers no press`);
      await flush(() => fire());
    },
    type: async (name, text) => {
      const control = await locate(stage, name);
      if (isDisabled(control)) throw new PlayError(`${quote(name)} is disabled`);
      const set = valueHandler(control);
      if (!set) throw new PlayError(`${quote(name)} takes no value`);
      await flush(() => (set as (value: string) => void)(text));
    },
    expect: (name) => expectation(stage, name, false),
  };
}

export type { Stage };
export { actions, DEFAULT_TIMEOUT };
