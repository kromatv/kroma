export interface Pose {
  yaw: number;
  pitch: number;
}

interface Stop extends Pose {
  weight: number;
}

/** The places a tour leans toward as it turns, each weighing what it counts. */
export interface Tour {
  stops: readonly Stop[];
}

export interface Motion {
  yaw: number;
  pitch: number;
  spin: number;
  dragging: boolean;
  lean: number | null;
}

/** Radians per second the globe turns on its own when it has nowhere to go. */
export const REST_SPIN = 0.05;
/** Radians per second the tour turns at, all the way round, never varying. */
export const TOUR_SPEED = 0.12;
/** How far, in radians of longitude, a place's latitude pulls on the tilt:
 * wide enough that the tilt changes no faster than the globe turns. */
export const REACH = 1;
/** The axis leans toward the viewer by this much, so the north shows. */
export const TILT = 0.4;
export const START_YAW = -0.3;

const RADIANS = Math.PI / 180;
const PITCH_LIMIT = 0.85;
const MAX_SPIN = 5;
const FRICTION = 2.4;
const HOLD_DECAY = 8;
const SETTLE = 1.2;
const REJOIN = 1.2;
const EPSILON = 1e-3;

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));
const wrap = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));

export function initialMotion(): Motion {
  return { yaw: START_YAW, pitch: TILT, spin: 0, dragging: false, lean: null };
}

/**
 * The tour over `places`: which longitude faces the camera when each is in the
 * middle, its latitude, and how many servers it speaks for. Null with nothing
 * to visit.
 */
export function tourOf(places: readonly { lat: number; lng: number; n: number }[]): Tour | null {
  if (places.length === 0) return null;
  return {
    stops: places.map((place) => ({
      yaw: -place.lng * RADIANS,
      pitch: place.lat * RADIANS,
      weight: Math.max(1, place.n),
    })),
  };
}

/**
 * How far the globe tilts when `yaw` faces the camera: the latitudes of the
 * places round about, each weighed by its servers and by how near its
 * longitude is. A weighted average is smooth everywhere, so the tilt drifts
 * toward a region as it comes round and never jerks at a place.
 */
export function pitchAt(tour: Tour, yaw: number): number {
  let sum = 0;
  let total = 0;
  for (const stop of tour.stops) {
    const weight = stop.weight * Math.exp(-((wrap(yaw - stop.yaw) / REACH) ** 2));
    sum += weight * stop.pitch;
    total += weight;
  }
  return total > 0 ? clamp(sum / total, -PITCH_LIMIT, PITCH_LIMIT) : TILT;
}

/** The pointer moved the globe by `dyaw` and `dpitch` radians over `dt` seconds. */
export function drag(motion: Motion, dyaw: number, dpitch: number, dt: number): void {
  motion.dragging = true;
  motion.lean = null;
  motion.yaw += dyaw;
  motion.pitch = clamp(motion.pitch + dpitch, -PITCH_LIMIT, PITCH_LIMIT);
  if (dt > 0) motion.spin = clamp(0.5 * motion.spin + 0.5 * (dyaw / dt), -MAX_SPIN, MAX_SPIN);
}

export function release(motion: Motion): void {
  motion.dragging = false;
}

/**
 * One frame of `dt` seconds. A held globe loses its fling. A released one
 * eases its turn from whatever speed the hand left toward the tour's, and its
 * tilt back onto the tour's, from the first frame, so letting go never jolts.
 * With no tour it turns at `rest` instead, and with a `rest` of 0 it only
 * moves under the pointer.
 */
export function advance(motion: Motion, dt: number, rest: number, tour: Tour | null): void {
  if (motion.dragging) {
    motion.spin *= Math.exp(-HOLD_DECAY * dt);
    return;
  }
  const touring = tour !== null && rest !== 0;
  const cruise = touring ? -TOUR_SPEED : -rest;
  motion.spin = cruise + (motion.spin - cruise) * Math.exp(-FRICTION * dt);
  motion.yaw += motion.spin * dt;
  if (!touring) {
    motion.pitch = TILT + (motion.pitch - TILT) * Math.exp(-SETTLE * dt);
    motion.lean = null;
    return;
  }
  motion.lean ??= motion.pitch - pitchAt(tour, motion.yaw);
  motion.lean *= Math.exp(-REJOIN * dt);
  motion.pitch = pitchAt(tour, motion.yaw) + motion.lean;
}

/** Whether the next frame would still move anything: what decides, without a
 * running loop, if another frame is worth drawing. */
export function restless(motion: Motion): boolean {
  return motion.dragging || Math.abs(motion.spin) > EPSILON;
}
