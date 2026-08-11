// What the group tells its segments, and the geometry both sides measure against.

import { createContext, useContext } from 'react';
import type { IconName } from '#ui/components/atoms/icon';
import { nestedRadius } from '#ui/core/tokens';
import { CONTROL, type ControlSize, controlRadius } from '#ui/lib/field-shell';

// The group's own padding, and therefore how much smaller a segment's corner
// is than the group's: concentric corners, not two radii guessed apart.
const GROUP_PAD = 4;

interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  /** Leading glyph. Under `iconOnly` it is the whole segment, and `label`
   *  becomes the accessible name. */
  icon?: IconName;
  /** A quieter second line under the label ("Recommandé", a codec note). */
  desc?: string;
  disabled?: boolean;
}

interface Box2D {
  x: number;
  width: number;
}

interface SegmentedContext {
  value: string;
  select: (next: string) => void;
  size: ControlSize;
  stretch: boolean;
  iconOnly: boolean;
  report: (value: string, box: Box2D) => void;
  register: (value: string) => void;
  mark: (value: string, disabled: boolean) => void;
  forget: (value: string) => void;
}

const Context = createContext<SegmentedContext | null>(null);

function useSegmented(part: string): SegmentedContext {
  const ctx = useContext(Context);
  if (!ctx) throw new Error(`<SegmentedControl.${part}> must be used inside its Root`);
  return ctx;
}

function segmentRadius(size: ControlSize): number {
  return nestedRadius(controlRadius(CONTROL[size]), GROUP_PAD);
}

export type { Box2D, SegmentedContext, SegmentedOption };
export { Context, GROUP_PAD, segmentRadius, useSegmented };
