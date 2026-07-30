// What `autoFocus` means, exactly: "where this SCREEN opens", not "give me
// focus whenever I happen to mount". A naive mount-time claim breaks a
// VIRTUALISED row: a tile that unmounts and remounts as it scrolls back into
// view would re-steal focus from wherever the user actually walked to. So an
// entry point is honoured only while the screen is still deciding where focus
// goes, and ignored once focus has an owner - the screen boundary being the
// reset that `useFocusNav` calls once per screen.

import { useRef } from 'react';

let settled = false;

/** Something has the focus now. Called by every `<Focusable>` on focus. */
function markFocusSettled(): void {
  settled = true;
}

/** True once this screen has a focus owner, so a late arrival must not steal it. */
function focusSettled(): boolean {
  return settled;
}

/** A new screen is deciding where to open. Called by `useFocusNav`. */
function resetFocusEntry(): void {
  settled = false;
}

const FRESH = Symbol('fresh');

/**
 * A fresh navigator scope has nothing focused yet, so its entry point wins.
 * `<FocusScope>` calls this; every app root and every test render mounts one.
 *
 * Resets while the scope RENDERS, not in an effect: a child's mount effect is
 * where an entry point asks for focus, and children's effects run before their
 * parent's, so an effect here would arrive too late.
 *
 * `entryKey` is for a scope that OUTLIVES its screen - persistent chrome
 * wrapping a swapping section, say - which must still re-decide focus on every
 * arrival despite never remounting. Omit it and the scope behaves as before.
 */
function useFocusEntryScope(entryKey?: string | number): void {
  const seen = useRef<string | number | symbol | undefined>(FRESH);
  if (seen.current !== entryKey) {
    seen.current = entryKey;
    resetFocusEntry();
  }
}

export { focusSettled, markFocusSettled, resetFocusEntry, useFocusEntryScope };
