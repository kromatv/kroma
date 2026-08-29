import type { NodeHandle } from '@kroma/spatial-nav/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { focusSettled } from '#ui/lib/focus-entry';

/** The screen-entry half of a focusable: whether this control is the one the
 *  screen opens on, and the press that moves the ring before it acts. */
function useEntryFocus(autoFocus: boolean | undefined, press: () => void) {
  // Decided once, at mount: `autoFocus` asks for the focus a screen opens with,
  // and a control that mounts while focus already has an owner is not that.
  // Otherwise a virtualised rail's first tile snatches focus every time the row
  // scrolls back to it.
  const [isEntry] = useState(() => autoFocus === true && !focusSettled());

  // `<DefaultFocus>` decides where a screen opens when the tree is first built,
  // which is too early for a control that arrives with its data, so the entry
  // also asks for focus itself once on mount.
  const entry = useRef<NodeHandle>(null);
  useEffect(() => {
    if (isEntry) entry.current?.focus();
  }, [isEntry]);

  // Moves the ring before it acts: a click reaches a control the navigator does
  // not think is focused, and acting without moving focus leaves the next arrow
  // press carrying on from wherever the remote left the highlight.
  const pointerPress = useCallback(() => {
    entry.current?.focus();
    press();
  }, [press]);

  return { entry, isEntry, pointerPress };
}

export { useEntryFocus };
