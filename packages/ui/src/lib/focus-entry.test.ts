// The rule a virtualised row depends on: `autoFocus` is an ENTRY POINT, not a
// standing claim on the focus.

import { beforeEach, describe, expect, it } from 'vitest';
import { focusSettled, markFocusSettled, resetFocusEntry } from './focus-entry';

/** What <Focusable> computes once, at mount. */
const wouldTakeFocus = (autoFocus: boolean) => autoFocus && !focusSettled();

beforeEach(resetFocusEntry);

describe('focus entry', () => {
  it('lets the first auto-focused control of a screen open it', () => {
    expect(wouldTakeFocus(true)).toBe(true);
  });

  it('refuses a control that mounts after focus has an owner', () => {
    expect(wouldTakeFocus(true)).toBe(true);
    markFocusSettled();
    // The same tile scrolling back into a virtualised row's window: it must not
    // pull the focus off whatever the user actually walked to.
    expect(wouldTakeFocus(true)).toBe(false);
  });

  it('lets the next screen decide again', () => {
    markFocusSettled();
    expect(wouldTakeFocus(true)).toBe(false);
    // `useFocusNav` mounts once per screen and resets this.
    resetFocusEntry();
    expect(wouldTakeFocus(true)).toBe(true);
  });

  it('never claims focus without autoFocus', () => {
    expect(wouldTakeFocus(false)).toBe(false);
  });
});
