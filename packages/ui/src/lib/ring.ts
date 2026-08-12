// Geometry for <ProgressRing>, shared by both renderers so the arc is identical
// on every target. Pure maths, so it is unit-tested rather than eyeballed.

import { clamp01 } from '#ui/components/atoms/progress';

export interface RingProps {
  /** Fill fraction, 0..1 (clamped). */
  value?: number;
  /** Outer diameter. */
  size?: number;
  thickness?: number;
  track?: string;
  fill?: string;
}

export interface RingGeometry {
  size: number;
  thickness: number;
  track: string;
  fill: string;
  centre: number;
  radius: number;
  circumference: number;
  /** How much of the circumference to hide, i.e. the unfilled remainder. */
  dashOffset: number;
}

export function ringGeometry({
  value = 0,
  size = 22,
  thickness = 2.5,
  track = 'rgba(255, 255, 255, 0.12)',
  fill = 'rgba(255, 255, 255, 0.6)',
}: Readonly<RingProps>): RingGeometry {
  // The arc straddles the path, so the radius is inset by half its thickness or
  // the ring would be clipped by the viewBox.
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  return {
    size,
    thickness,
    track,
    fill,
    centre: size / 2,
    radius,
    circumference,
    dashOffset: circumference * (1 - clamp01(value)),
  };
}

/** SVG draws an arc from 3 o'clock; the design starts it at 12. */
export const RING_ROTATION = '-90deg';

/** What an indeterminate ring draws instead of a fill: a quarter of the
 *  circumference, spun rather than grown. */
export const RING_BUSY_ARC = 0.25;

export const RING_SPIN_MS = 900;
