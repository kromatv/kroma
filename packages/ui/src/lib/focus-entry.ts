// What `autoFocus` means, exactly: "where this SCREEN opens", not "give me
// focus whenever I happen to mount". A naive mount-time claim breaks a
// VIRTUALISED row: a tile that unmounts and remounts as it scrolls back into
// view would re-steal focus from wherever the user actually walked to. So an
// entry point is honoured only while the screen is still deciding where focus
// goes, and ignored once focus has an owner - the screen boundary being the
// reset that `useFocusNav` calls once per screen.

import { createContext, useContext, useState } from 'react';

/** A focus claim belongs to one screen, including virtualized controls. */
export function createFocusEntry() {
  let settled = false;
  return {
    focusSettled: () => settled,
    markFocusSettled() {
      settled = true;
    },
    resetFocusEntry() {
      settled = false;
    },
  };
}
const Context = createContext<ReturnType<typeof createFocusEntry> | null>(null);
export const FocusEntryProvider = Context.Provider;
export function useFocusEntry() {
  const provided = useContext(Context);
  const [owned] = useState(() => (provided ? null : createFocusEntry()));
  const entry = provided ?? owned;
  if (!entry) throw new Error('Focus entry requires its owning screen');
  return entry;
}
