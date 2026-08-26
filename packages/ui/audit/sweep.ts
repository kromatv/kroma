// Every story view in the kit, pressed once, and what that press cost.
//
// The measuring is @kroma/react-audit's; this is the part that is KROMA's: which
// views there are, and how a story is turned into an element. Mount cost is the
// easy half, the same for everyone and unchanged by any memoisation. What breaks
// a television is the SECOND render, the one a keypress causes.

import { measure } from '@kroma/react-audit/react';
import { cleanup } from '@testing-library/react';
import { onScreen } from '#ui/testing';
import { found, viewsOf } from './views';

interface Pressed {
  id: string;
  view: string;
  /** Components destroyed and rebuilt, worst first. */
  churn: ReadonlyArray<readonly [string, number]>;
  /** Everything in `churn`, added up. */
  churned: number;
  rerendered: number;
}

/** Presses one control in every story view that has one. Views with nothing to
 * press are absent rather than zero: there is no finding to make about them. */
function sweepKit(only: readonly string[] = []): readonly Pressed[] {
  const needles = only.map((needle) => needle.toLowerCase());
  const out: Pressed[] = [];

  for (const [, story] of found()) {
    const keep =
      needles.length === 0 ||
      needles.some((needle) => `${story.name} ${story.id}`.toLowerCase().includes(needle));
    if (!keep) continue;

    for (const [view, ui] of viewsOf(story)) {
      try {
        const result = measure(onScreen(ui()));
        if (!result.drove) continue;
        out.push({
          id: story.id,
          view,
          churn: result.churn,
          churned: result.churn.reduce((sum, [, count]) => sum + count, 0),
          rerendered: result.rerenders,
        });
      } catch {
        // A view that no longer renders is a finding audit.test.tsx already makes.
      } finally {
        cleanup();
      }
    }
  }
  return out.sort((a, b) => b.churned - a.churned || b.rerendered - a.rerendered);
}

export type { Pressed };
export { sweepKit };
