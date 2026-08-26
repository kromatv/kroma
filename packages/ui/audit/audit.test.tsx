// The gate. Three rules, no recorded numbers.
//
// What this replaces was a ratchet: a committed file per story holding what it
// measured last time, failing whenever a number moved in either direction. That
// caught regressions, and it also let an existing fault live forever as long as
// it did not get worse, and it put a hundred snapshot files in every diff.
//
// These are rules instead. Each one is a thing that is simply never allowed,
// and each one passes today, so a failure means something broke rather than
// something was already broken. What is NOT here is the two worklists, DOM
// structure and interaction cost: both still carry real faults, and a gate born
// red is not a gate. `bun run kit:dom` and `bun run kit:perf` are those, and
// they are meant to be read and worked down.

import { describe, expect, it } from 'vitest';
import { scanKit } from './fanout-scan';
import { measureKit } from './views';

const KIT = measureKit();

describe('every story in the kit', () => {
  it('still renders', () => {
    const broken = KIT.filter((view) => view.error).map(
      (view) => `${view.id}/${view.view}: ${view.error}`,
    );

    expect(broken).toEqual([]);
  });

  // The rules in a11y.ts, not a snapshot of the tree they judge: a control with
  // no accessible name, a role that claims a state it never reports, an aria
  // reference pointing at nothing.
  it('gives a screen reader something to work with', () => {
    const findings = KIT.flatMap((view) =>
      view.access.findings.map(
        (finding) => `${view.id}/${view.view}: ${finding.kind} ${finding.note}`,
      ),
    );

    expect(findings).toEqual([]);
  });
});

describe('the kit', () => {
  // See fanout.ts. A function or object written into a JSX prop inside a
  // `.map()` cannot be cached by the React Compiler, so the whole list
  // re-renders when one item changed.
  it('allocates nothing inside a list render', async () => {
    const allocations = (await scanKit(process.cwd())).map(
      (alloc) => `${alloc.file}:${alloc.line} ${alloc.prop}`,
    );

    expect(allocations).toEqual([]);
  }, 120_000);
});
