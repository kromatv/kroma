import { type RefObject, useCallback, useEffect, useRef, useState } from 'react';
import type { SpatialNavigationNodeRef } from 'react-tv-space-navigation';
import { focusSettled } from '#ui/lib/focus-entry';

function focusEntry(entry: RefObject<SpatialNavigationNodeRef | null>): void {
  try {
    entry.current?.focus();
  } catch {
    // The screen went away first; whatever is there now keeps the focus.
  }
}

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
  const entry = useRef<SpatialNavigationNodeRef>(null);
  useEffect(() => {
    if (!isEntry) return;
    // Next tick: the node registers itself as focusable during the same commit,
    // and asking too early throws "trying to assign focus to a non focusable
    // node".
    const soon = setTimeout(() => focusEntry(entry), 0);
    return () => clearTimeout(soon);
  }, [isEntry]);

  // Moves the ring before it acts: a click reaches a control the navigator does
  // not think is focused, and acting without moving focus leaves the next arrow
  // press carrying on from wherever the remote left the highlight.
  const pointerPress = useCallback(() => {
    // Not a focusable node (yet, or any more): the press itself still stands.
    focusEntry(entry);
    press();
  }, [press]);

  return { entry, isEntry, pointerPress };
}

export { useEntryFocus };
