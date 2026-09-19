import type { Vector } from '#site/lib/geo';

export interface GlobePin {
  code: string;
  label: string;
  flag?: string;
  n: number;
  lat: number;
  lng: number;
}

export interface PlacedPin extends GlobePin {
  position: Vector;
}

/** The dots sit on the unit sphere; the ball underneath is a hair smaller so
 * its depth hides the far side of them, and a pin floats a hair above. */
export const SPHERE_RADIUS = 0.992;
export const PIN_ALTITUDE = 1.004;
