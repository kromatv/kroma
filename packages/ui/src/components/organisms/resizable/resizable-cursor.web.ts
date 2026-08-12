// What the PAGE does while a seam is being dragged, on the browser targets.
//
// The pointer leaves the handle within a few pixels of the drag starting, and
// from then on the cursor is whatever it is standing over and the drag is
// selecting the prose it crosses. Both are properties of the page rather than
// of the handle, so both are held here and given back on release.

import { webDocument } from '#ui/lib/dom';
import type { GroupOrientation } from '#ui/lib/group-shape';

const CURSOR: Record<GroupOrientation, string> = {
  horizontal: 'col-resize',
  vertical: 'row-resize',
};

const NOOP = () => {};

// A rule rather than `body.style.cursor`: an inline cursor on the body is the
// weakest claim on the page, and every button, link and text run the pointer
// crosses mid-drag carries its own, so the cursor flickers between the seam's
// and theirs. One `!important` rule over every element is the only spelling
// that holds for the length of a gesture.
function ruleFor(orientation: GroupOrientation): string {
  return `*, *::before, *::after { cursor: ${CURSOR[orientation]} !important; user-select: none !important; }`;
}

/** Take the page for the length of a drag; returns the release. */
function holdCursor(orientation: GroupOrientation): () => void {
  const doc = webDocument();
  if (!doc?.head) return NOOP;
  const style = doc.createElement('style');
  style.setAttribute('data-kroma-resize', orientation);
  style.textContent = ruleFor(orientation);
  doc.head.append(style);
  return () => style.remove();
}

export { holdCursor };
