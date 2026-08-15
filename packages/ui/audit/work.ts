// What a mounted view costs the CPU, in the one unit jsdom measures honestly.
//
// Durations wobble with the machine, so the baseline holds COMMITS: how many
// times React had to paint before the view settled. A clean mount is one. Every
// commit past it is a setState fired from an effect during mount - work every
// screen showing the component repeats, and exactly the kind of cost the React
// Compiler cannot remove (it memoises re-renders, it cannot un-schedule one).
// A second figure per extra commit says how much of the tree re-rendered, so a
// two-commit mount that repaints one leaf reads differently from one that
// repaints the whole view.

import { createElement, Profiler, type ProfilerProps, type ReactElement } from 'react';

interface Work {
  /** Commits to reach the settled mounted state; 1 is a clean mount. */
  commits: number;
  /** Whether any commit past the first re-rendered the whole tree rather than
   * a corner of it, read off the Profiler's actual-vs-base durations. */
  remounts: boolean;
}

interface Tally {
  count: number;
  full: boolean;
}

const running = new WeakMap<object, Tally>();

function tallyOf(key: object): ProfilerProps['onRender'] {
  return (_id, phase, actualDuration, baseDuration) => {
    const tally = running.get(key) ?? { count: 0, full: false };
    tally.count += 1;
    // An update whose actual work approaches a whole fresh render re-ran
    // everything; one well under it was a corner. Duration RATIOS are stable
    // in jsdom even where the durations themselves are not.
    if (phase !== 'mount' && baseDuration > 0 && actualDuration >= baseDuration * 0.9) {
      tally.full = true;
    }
    running.set(key, tally);
  };
}

/** Wraps a view so its commits are counted against `key`. */
function measured(key: object, ui: ReactElement): ReactElement {
  return createElement(Profiler, { id: 'audit', onRender: tallyOf(key) }, ui);
}

/** The work recorded against `key` since it was minted. */
function workOf(key: object): Work {
  const tally = running.get(key);
  return { commits: tally?.count ?? 0, remounts: tally?.full ?? false };
}

export type { Work };
export { measured, workOf };
