import type { StyleScope } from '#ui/core';
// What the group tells its segments, and the geometry both sides measure against.

import type { View } from 'react-native';
import { nestedRadius } from '#ui/core/tokens';
import type { Radius } from '#ui/core/tokens/layout';
import { CONTROL, type ControlSize, controlRadius } from '#ui/lib/field-shell';
import { MEMBER_INSET } from '#ui/lib/ring-scope';
import { partContext } from '#ui/lib/part-context';

const GROUP_PAD = MEMBER_INSET;

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
  tabStop: string | undefined;
  mount: (value: string, view: View | null) => void;
}

const [Context, useSegmentGroup] = partContext<SegmentGroupContext>('SegmentGroup.Root');

function segmentRadius(size: ControlSize, scope: StyleScope): Radius {
  return nestedRadius(controlRadius(CONTROL[size], scope), GROUP_PAD);
}

export type { Box2D, SegmentGroupContext };
export { Context, GROUP_PAD, segmentRadius, useSegmentGroup };
