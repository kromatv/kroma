import { describe, expect, it } from 'vitest';
import {
  advance,
  drag,
  initialMotion,
  pitchAt,
  REST_SPIN,
  release,
  restless,
  TILT,
  TOUR_SPEED,
  type Tour,
  tourOf,
} from './motion';

const FRAME = 1 / 60;
const RADIANS = Math.PI / 180;

const europe = [
  { lat: 46.8, lng: 8.2, n: 1 },
  { lat: 51.2, lng: 10.4, n: 2 },
  { lat: 54, lng: -2.5, n: 2 },
  { lat: 49.8, lng: 15.5, n: 1 },
];

const world = [
  ...europe,
  { lat: 39.8, lng: -98.6, n: 2 },
  { lat: 1.4, lng: 103.8, n: 1 },
  { lat: -41.5, lng: 172.8, n: 1 },
];

function run(
  motion: ReturnType<typeof initialMotion>,
  seconds: number,
  tour: Tour | null,
  rest = REST_SPIN,
) {
  for (let t = 0; t < seconds; t += FRAME) advance(motion, FRAME, rest, tour);
}

describe('tourOf', () => {
  it('faces each place and weighs it by its servers', () => {
    const tour = tourOf(world.slice(4, 6)) as Tour;

    expect(tour.stops.map((s) => s.yaw)).toEqual([98.6 * RADIANS, -103.8 * RADIANS]);
    expect(tour.stops.map((s) => s.weight)).toEqual([2, 1]);
  });

  it('has nothing to offer with nowhere to go', () => {
    expect(tourOf([])).toBeNull();
  });
});

describe('pitchAt', () => {
  const tour = tourOf(world) as Tour;

  it('leans south for the one place in the south and north for the crowd', () => {
    expect(pitchAt(tour, -172.8 * RADIANS)).toBeLessThan(-0.3);
    expect(pitchAt(tour, -8 * RADIANS)).toBeGreaterThan(0.7);
  });

  it('settles near the average of a crowd rather than visiting each member', () => {
    const mean = (europe.reduce((sum, p) => sum + p.lat * p.n, 0) / 6) * RADIANS;

    expect(Math.abs(pitchAt(tour, -8 * RADIANS) - mean)).toBeLessThan(0.1);
  });

  it('is the same a lap later', () => {
    expect(pitchAt(tour, 1)).toBeCloseTo(pitchAt(tour, 1 - 2 * Math.PI), 9);
  });

  it('never tilts faster than the globe turns', () => {
    const step = 0.01;
    let steepest = 0;
    for (let yaw = 0; yaw < 2 * Math.PI; yaw += step) {
      const slope = Math.abs(pitchAt(tour, yaw + step) - pitchAt(tour, yaw)) / step;
      steepest = Math.max(steepest, slope * TOUR_SPEED);
    }

    expect(steepest).toBeLessThan(TOUR_SPEED * 1.25);
  });

  it('never tilts far enough to look down on a pole', () => {
    const arctic = tourOf([{ lat: 78.7, lng: 16, n: 1 }]) as Tour;

    expect(pitchAt(arctic, -16 * RADIANS)).toBeLessThanOrEqual(0.85);
  });
});

describe('drag', () => {
  it('turns the globe by what the pointer moved', () => {
    const motion = initialMotion();
    const before = motion.yaw;

    drag(motion, 0.25, 0, FRAME);

    expect(motion.yaw).toBeCloseTo(before + 0.25);
    expect(motion.dragging).toBe(true);
  });

  it('never tips the globe past the poles', () => {
    const motion = initialMotion();

    drag(motion, 0, 4, FRAME);
    const highest = motion.pitch;
    drag(motion, 0, -8, FRAME);

    expect(highest).toBeLessThanOrEqual(0.85);
    expect(motion.pitch).toBeGreaterThanOrEqual(-0.85);
  });
});

describe('advance', () => {
  it('leaves a held globe to the pointer and bleeds off its fling', () => {
    const motion = initialMotion();
    drag(motion, 0.5, 0, FRAME);
    const yaw = motion.yaw;

    run(motion, 1, tourOf(world));

    expect(motion.yaw).toBe(yaw);
    expect(Math.abs(motion.spin)).toBeLessThan(0.05);
  });

  it('turns east at rest when there is nowhere to visit', () => {
    const motion = initialMotion();
    const yaw = motion.yaw;

    run(motion, 4, null);

    expect(motion.spin).toBeCloseTo(-REST_SPIN, 2);
    expect(motion.yaw).toBeLessThan(yaw);
  });

  it('brings a flung globe to a stop when there is no resting spin', () => {
    const motion = initialMotion();
    drag(motion, 0.05, 0.1, FRAME);
    release(motion);

    run(motion, 6, null, 0);

    expect(motion.spin).toBeCloseTo(0, 2);
    expect(motion.pitch).toBeCloseTo(TILT, 2);
    expect(restless(motion)).toBe(false);
  });

  it('turns at one speed and follows the tilt of the tour once under way', () => {
    const tour = tourOf(world) as Tour;
    const motion = initialMotion();
    run(motion, 6, tour);

    for (let t = 0; t < 20; t += FRAME) {
      const before = motion.yaw;
      advance(motion, FRAME, REST_SPIN, tour);
      expect(before - motion.yaw).toBeCloseTo(TOUR_SPEED * FRAME, 5);
      expect(motion.pitch).toBeCloseTo(pitchAt(tour, motion.yaw), 2);
    }
  });

  it('eases into its turn from a standstill rather than starting at full speed', () => {
    const motion = initialMotion();

    advance(motion, FRAME, REST_SPIN, tourOf(world));

    expect(Math.abs(motion.spin)).toBeLessThan(TOUR_SPEED / 10);
  });

  it('faces every place once a lap', () => {
    const tour = tourOf(world) as Tour;
    const motion = initialMotion();
    const faced = new Set<number>();

    for (let t = 0; t < (2 * Math.PI) / TOUR_SPEED + 6; t += FRAME) {
      advance(motion, FRAME, REST_SPIN, tour);
      tour.stops.forEach((stop, i) => {
        if (
          Math.abs(Math.atan2(Math.sin(motion.yaw - stop.yaw), Math.cos(motion.yaw - stop.yaw))) <
          0.01
        ) {
          faced.add(i);
        }
      });
    }

    expect(faced.size).toBe(tour.stops.length);
  });

  it('blends a fling back into the tour without a jolt in speed or direction', () => {
    const tour = tourOf(world) as Tour;
    const motion = initialMotion();
    run(motion, 6, tour);
    drag(motion, 0.02, 0.2, FRAME);
    release(motion);
    expect(motion.spin).toBeGreaterThan(0.5);
    let previous = motion.spin;

    for (let t = 0; t < 10; t += FRAME) {
      advance(motion, FRAME, REST_SPIN, tour);
      expect(motion.spin).toBeLessThanOrEqual(previous + 1e-9);
      expect(previous - motion.spin).toBeLessThan(0.1);
      previous = motion.spin;
    }

    expect(motion.spin).toBeCloseTo(-TOUR_SPEED, 3);
    expect(motion.pitch).toBeCloseTo(pitchAt(tour, motion.yaw), 2);
  });

  it('comes to rest after a fling for a reader who asked for less motion', () => {
    const motion = initialMotion();
    drag(motion, 0.05, 0.1, FRAME);
    release(motion);

    run(motion, 6, tourOf(world), 0);

    expect(motion.spin).toBeCloseTo(0, 2);
    expect(restless(motion)).toBe(false);
  });

  it('stays put for a reader who asked for less motion', () => {
    const motion = initialMotion();

    run(motion, 5, tourOf(world), 0);

    expect(motion.yaw).toBe(initialMotion().yaw);
    expect(motion.pitch).toBe(initialMotion().pitch);
  });
});
