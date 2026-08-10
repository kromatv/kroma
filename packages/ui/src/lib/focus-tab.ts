// Tab, spelled as a walk over the spatial navigator.
//
// Tab is not the right arrow. An arrow stops at the wall; Tab visits every
// control in order and turns the corner - at the end of a grid row it carries on
// at the START of the next one. Since the navigator owns the focus here (see
// `focus-remote.web`, where Tab stopped being the browser's second focus), Tab
// has to be said in the only vocabulary the navigator has, the four directions:
// step along the line, and when the line refuses, drop to the next one and
// rewind it to its edge.

import { Directions } from 'react-tv-space-navigation';
import type { FocusBox } from './focus-here';

/** How the walk watches the focus: a counter to tell a move from a refusal, and
 *  a box to tell one line from the next. */
export interface FocusProbe {
  seq: () => number;
  box: () => FocusBox | null;
}

type Send = (direction: Directions) => void;

// A line is thin: two controls are on the same one when their tops sit closer
// than half a control, which holds for a grid of equal tiles and for a row of
// mixed ones. The floor is for zero-height boxes, which is what a layout that
// has not been measured reports.
function sameLine(a: FocusBox, b: FocusBox): boolean {
  return Math.abs(a.top - b.top) < Math.max(4, Math.min(a.height, b.height) / 2);
}

// However long the line is; what it really rules out is a cycle.
const MAX_STEPS = 64;

// A move that reports whether the focus actually went anywhere: the navigator
// says nothing when a direction is refused, so the sequence is the only answer.
function stepper(send: Send, probe: FocusProbe) {
  return (direction: Directions) => {
    const was = probe.seq();
    send(direction);
    return probe.seq() !== was;
  };
}

// The perpendicular move landed in the same COLUMN, not at the start of the
// line, so walk back along the new line until it runs out of line to walk.
function rewindToEdge(send: Send, probe: FocusProbe, back: boolean): void {
  const step = stepper(send, probe);
  const along = back ? Directions.LEFT : Directions.RIGHT;
  const rewind = back ? Directions.RIGHT : Directions.LEFT;
  for (let i = 0; i < MAX_STEPS; i += 1) {
    const from = probe.box();
    if (!step(rewind)) return;
    const to = probe.box();
    if (!from || !to) return;
    if (sameLine(from, to)) {
      if (back ? to.left > from.left : to.left < from.left) continue;
      return;
    }
    // That step left the line - a sidebar, the row above - so the edge was the
    // control before it. Take the step back and stop.
    send(along);
    return;
  }
}

/** Move the focus one control along reading order; `back` for Shift+Tab. */
export function walkTab(send: Send, probe: FocusProbe, back = false): void {
  const step = stepper(send, probe);
  if (step(back ? Directions.LEFT : Directions.RIGHT)) return;
  // The line has ended, so drop to the next one and rewind it to its edge.
  if (!step(back ? Directions.UP : Directions.DOWN)) return;
  rewindToEdge(send, probe, back);
}
