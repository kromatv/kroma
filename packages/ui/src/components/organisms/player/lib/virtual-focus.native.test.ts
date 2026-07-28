// The player chrome's opt-out from platform focus, on each platform.
//
// This one constant is what stops the film starting and stopping. On tvOS every
// Pressable is focusable by default, so the OS engine adopted the player chrome
// in parallel with the player's own virtual focus: it moved a second, invisible
// focus around, and the Select that ENTERED the player landed on whichever
// control it had adopted - the top bar's back button - which closed the player
// again about a frame later.
//
// react-native-tvos gates a Pressable on exactly `focusable !== false &&
// isTVSelectable !== false`, so BOTH keys must be present and both must be
// `false`. The web half is empty on purpose: there is no OS focus engine to opt
// out of, and adding the props would strip the controls out of the tab order and
// leak an `isTVSelectable` attribute onto DOM elements that never heard of it.

import { describe, expect, it } from 'vitest';
import { UNFOCUSABLE } from '#ui/lib/focus-types';
import { VIRTUAL_FOCUS as NATIVE } from './virtual-focus';
import { VIRTUAL_FOCUS as WEB } from './virtual-focus.web';

describe('VIRTUAL_FOCUS on native', () => {
  it('sets BOTH keys react-native-tvos gates on, and sets them false', () => {
    // Either one alone leaves the control focusable, which is the bug.
    expect(NATIVE).toEqual({ focusable: false, isTVSelectable: false });
  });

  it('is the shared UNFOCUSABLE, not a second copy of it', () => {
    // The gate is a fact about react-native-tvos, and it is stated once.
    expect(NATIVE).toBe(UNFOCUSABLE);
  });
});

describe('VIRTUAL_FOCUS on the web', () => {
  it('is empty, so the DOM is left exactly as it was', () => {
    // No OS focus engine to opt out of; the controls stay clickable and stay
    // where they were in the tab order.
    expect(WEB).toEqual({});
  });

  it('leaks no isTVSelectable onto a DOM element', () => {
    expect(Object.hasOwn(WEB, 'isTVSelectable')).toBe(false);
    expect(Object.hasOwn(WEB, 'focusable')).toBe(false);
  });
});

describe('both halves', () => {
  it('are spreadable onto a Pressable', () => {
    // Every call site is `{...VIRTUAL_FOCUS}`, so each half has to be a plain
    // object - the platform difference lives entirely in what is inside it.
    expect({ accessible: true, ...NATIVE }).toMatchObject({ accessible: true });
    expect({ accessible: true, ...WEB }).toEqual({ accessible: true });
  });
});
