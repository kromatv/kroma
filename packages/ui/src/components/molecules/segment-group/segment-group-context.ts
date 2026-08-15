// What the group tells its segments, and the geometry both sides measure against.

import { nestedRadius } from '#ui/core/tokens';
import { CONTROL, type ControlSize, controlRadius } from '#ui/lib/field-shell';
import { partContext } from '#ui/lib/part-context';

// The group's own padding, and therefore how much smaller a segment's corner
// is than the group's: concentric corners, not two radii guessed apart.
const GROUP_PAD = 4;

interface Box2D {
  x: number;
  width: number;
}

interface SegmentGroupContext {
  value: string;
  select: (next: string) => void;
  size: ControlSize;
  stretch: boolean;
  report: (value: string, box: Box2D) => void;
}

const [Context, useSegmentGroup] = partContext<SegmentGroupContext>('SegmentGroup.Root');

function segmentRadius(size: ControlSize): number {
  return nestedRadius(controlRadius(CONTROL[size]), GROUP_PAD);
}

export type { Box2D, SegmentGroupContext };
export { Context, GROUP_PAD, segmentRadius, useSegmentGroup };
