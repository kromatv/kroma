// What `autoFocus` means, exactly: "where this SCREEN opens", not "give me the
// focus whenever I happen to mount".
//
// The two used to be the same thing, because a control that asked for focus was
// mounted once with its screen. A VIRTUALISED row broke that: it unmounts a tile
// when it leaves the render window and mounts it again when it comes back. So a
// rail whose first tile carries `autoFocus` - which every TV home screen does,
// that is where the remote should land - would hand focus back to that tile the
// moment the row scrolled far enough right and then came back. Walking right was
// fine; the first press of LEFT that pulled tile 0 back into the window
// teleported the user to the start of the row.
//
// So an entry point is honoured while the screen is still deciding where focus
// goes, and ignored once focus has an owner. The screen boundary is the reset:
// `useFocusNav` mounts once per screen and calls it.

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

/** Nothing can equal this, so the first render always counts as a change. */
const FRESH = Symbol('fresh');

/**
 * A fresh navigator scope has nothing focused yet, so its entry point wins.
 * `<FocusScope>` calls this; every app root and every test render mounts one.
 *
 * Reset while the scope RENDERS rather than in an effect: a child's mount effect
 * is where an entry point asks for the focus, and children's effects run before
 * their parent's, so an effect here would arrive after the decision it governs.
 *
 * `entryKey` is for a scope that OUTLIVES its screen - one wrapping persistent
 * chrome plus a swapping screen, which is how a nav bar keeps its instance (and
 * so its travelling lens) across a section change. Such a scope must still
 * re-decide where focus opens on every arrival, and it cannot learn that from
 * its own mount, because it does not remount. A scope keyed the old way passes
 * nothing and behaves exactly as before.
 */
function useFocusEntryScope(entryKey?: string | number): void {
  const seen = useRef<string | number | symbol | undefined>(FRESH);
  if (seen.current !== entryKey) {
    seen.current = entryKey;
    resetFocusEntry();
  }
}

export { focusSettled, markFocusSettled, resetFocusEntry, useFocusEntryScope };
