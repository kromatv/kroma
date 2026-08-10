// Where the ring landed, for Tab's reading-order walk.
//
// Two things are pinned. The box is MEASURED on demand and never remembered:
// between taking the focus and being asked, the list the control sits in may
// have scrolled, and a stored box would answer where the control WAS, which is
// how a walk ends up stepping to the wrong line. And the sequence bumps on
// every focus, which is the only way the walk tells a move from a refusal.

import { beforeEach, describe, expect, it } from 'vitest';
import { focusBox, focusSeq, noteFocus } from './focus-here';

function viewAt(top: number, left: number, height: number) {
  const rect = { top, left, height };
  return {
    rect,
    view: { getBoundingClientRect: () => rect },
  };
}

beforeEach(() => {
  noteFocus(null);
});

describe('focusBox', () => {
  it('answers nothing while nothing measurable holds the focus', () => {
    expect(focusBox()).toBeNull();
  });

  it("reports the focused control's box", () => {
    noteFocus(viewAt(120, 40, 72).view);
    expect(focusBox()).toEqual({ top: 120, left: 40, height: 72 });
  });

  it('re-measures rather than remembering: a scrolled list moves the answer', () => {
    const { rect, view } = viewAt(300, 0, 72);
    noteFocus(view);
    expect(focusBox()).toEqual({ top: 300, left: 0, height: 72 });
    rect.top = 90;
    expect(focusBox()).toEqual({ top: 90, left: 0, height: 72 });
  });

  it('drops a focus target that cannot be measured', () => {
    noteFocus(viewAt(10, 10, 10).view);
    noteFocus({ notAView: true });
    expect(focusBox()).toBeNull();
  });
});

describe('focusSeq', () => {
  it('bumps on every focus, measurable or not, so a refusal is distinguishable', () => {
    const start = focusSeq();
    noteFocus(viewAt(0, 0, 10).view);
    expect(focusSeq()).toBe(start + 1);
    noteFocus(null);
    expect(focusSeq()).toBe(start + 2);
  });
});
