// The native half of `resizable-cursor.web`: a television has no cursor and a
// phone selects nothing under a finger, so a drag takes nothing from the page.

import type { GroupOrientation } from '#ui/lib/group-shape';

const NOOP = () => {};

function holdCursor(_orientation: GroupOrientation): () => void {
  return NOOP;
}

export { holdCursor };
