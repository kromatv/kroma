// AVPlay's coordinate space is the app's fixed 1920x1080 canvas.

import type { PlaneRect } from '@kromatv/ui';

const AVPLAY_W = 1920;
const AVPLAY_H = 1080;

/** A box in AVPlay's own pixel space, the four arguments `setDisplayRect` takes. */
export interface PlaneBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const FULL_PLANE: PlaneBox = { x: 0, y: 0, w: AVPLAY_W, h: AVPLAY_H };

/** The pixel box for a fraction-rect, or the whole canvas for `null`. */
export function planeBox(rect: PlaneRect | null): PlaneBox {
  if (!rect) return FULL_PLANE;
  return {
    x: Math.round(rect.x * AVPLAY_W),
    y: Math.round(rect.y * AVPLAY_H),
    w: Math.round(rect.w * AVPLAY_W),
    h: Math.round(rect.h * AVPLAY_H),
  };
}

/** Whether a box is already the one on screen: each `setDisplayRect` hits the
 * hardware compositor, so a no-op resize is worth catching. */
export function samePlaneBox(a: PlaneBox, b: PlaneBox): boolean {
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}
