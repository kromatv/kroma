// The contract both halves of a seam's key layer implement.
//
//   resizable-keys.ts      native  - Apple TV / a phone. The remote is HELD, so
//                                    the navigator stops moving focus, and the
//                                    directions are read straight off the OS.
//   resizable-keys.web.ts  web     - Tizen / webOS / desktop / browser. The
//                                    keys are taken on the document's capture
//                                    phase, where the navigator cannot see them.

import type { GroupOrientation } from '#ui/lib/group-shape';

interface ResizableKeysOptions {
  /** While true the seam owns the four directions, and nothing else moves. */
  held: boolean;
  orientation: GroupOrientation;
  /** `-1` towards the start of the group (left, up), `1` towards its end. */
  onNudge: (towards: -1 | 1) => void;
  /** Select, Escape or Back: the reader is done. */
  onRelease: () => void;
}

export type { ResizableKeysOptions };
