import type { FocusBox } from './focus-here';

export type { FocusBox };

type Measurable = { getBoundingClientRect(): { top: number; left: number; height: number } };

export function createFocusProbe() {
  let held: Measurable | null = null;
  let seq = 0;

  function measurable(view: unknown): view is Measurable {
    return typeof (view as Measurable | null)?.getBoundingClientRect === 'function';
  }

  /** Called by `<Focusable>` as it takes the focus. */
  function noteFocus(view: unknown): void {
    held = measurable(view) ? view : null;
    seq += 1;
  }

  /** Bumped by every focus, so a caller can tell a move from a refusal. */
  function focusSeq(): number {
    return seq;
  }

  // Measured on demand rather than stored: between the focus and the question the
  // list it sits in may have scrolled, and a remembered box would be the answer to
  // where the control WAS.
  function focusBox(): FocusBox | null {
    if (!held) return null;
    const { top, left, height } = held.getBoundingClientRect();
    return { top, left, height };
  }

  return { noteFocus, seq: focusSeq, box: focusBox };
}
