// The native half answers nothing, and that is the design rather than a gap: a
// remote has no Tab key and a thumb focuses by touching the thing, so nobody on
// this side asks where the ring landed. What is pinned is that it says so
// consistently - a `focusSeq` that never moves is what tells the walk that a
// direction was refused, and a box of `null` is what stops a caller treating a
// stale position as a real one.

import { describe, expect, it } from 'vitest';
import { focusBox, focusSeq, noteFocus } from './focus-here';

describe('focus-here (native)', () => {
  it('reports no box, whatever it is told holds the focus', () => {
    expect(focusBox()).toBeNull();
    noteFocus({ getBoundingClientRect: () => ({ top: 1, left: 2, height: 3 }) });
    expect(focusBox()).toBeNull();
  });

  it('never moves the sequence, so no walk reads a move that did not happen', () => {
    const start = focusSeq();
    noteFocus({});
    noteFocus(null);
    expect(focusSeq()).toBe(start);
  });

  it('takes any focus target without complaining', () => {
    expect(() => noteFocus(undefined)).not.toThrow();
  });
});
