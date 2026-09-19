import { describe, expect, it } from 'vitest';
import { decodeLand, LAND_SCALE, toVector } from './geo';

const close = (actual: readonly number[], expected: readonly number[]) => {
  for (const [i, value] of expected.entries()) expect(actual[i]).toBeCloseTo(value, 6);
};

describe('toVector', () => {
  it('puts the prime meridian in front of the camera and the poles on the vertical', () => {
    close(toVector(0, 0), [0, 0, 1]);
    close(toVector(90, 0), [0, 1, 0]);
    close(toVector(-90, 45), [0, -1, 0]);
  });

  it('turns east to the right', () => {
    close(toVector(0, 90), [1, 0, 0]);
    close(toVector(0, -90), [-1, 0, 0]);
  });

  it('scales to the radius asked for', () => {
    const [x, y, z] = toVector(46.8, 8.2, 1.02);

    expect(Math.hypot(x, y, z)).toBeCloseTo(1.02, 6);
  });
});

describe('decodeLand', () => {
  it('reads tenths of a degree, latitude first, onto the unit sphere', () => {
    const decoded = decodeLand([90 * LAND_SCALE, 0, 0, 90 * LAND_SCALE]);

    expect(decoded).toHaveLength(6);
    close([...decoded.slice(0, 3)], [0, 1, 0]);
    close([...decoded.slice(3, 6)], [1, 0, 0]);
  });

  it('drops a trailing half pair rather than inventing a point', () => {
    expect(decodeLand([0, 0, 450])).toHaveLength(3);
  });
});
