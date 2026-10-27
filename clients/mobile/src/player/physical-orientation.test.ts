import { describe, expect, it } from 'vitest';
import { physicalOrientation } from './physical-orientation';

describe('physical phone posture', () => {
  it.each([
    [{ x: 0, y: -1, z: 0 }, 'portrait'],
    [{ x: 0, y: 1, z: 0 }, 'portrait'],
    [{ x: -1, y: 0, z: 0 }, 'landscape'],
    [{ x: 1, y: 0, z: 0 }, 'landscape'],
    [{ x: 0.7, y: 0.3, z: 0.4 }, 'landscape'],
    [{ x: 0.3, y: 0.7, z: 0.4 }, 'portrait'],
  ] as const)('classifies a stable device axis: %j', (measurement, expected) => {
    expect(physicalOrientation(measurement)).toBe(expected);
  });

  it.each([
    { x: 0, y: 0, z: 1 },
    { x: 0, y: 0, z: -1 },
    { x: 0.4, y: 0.3, z: 0.86 },
    { x: 0.7, y: 0.7, z: 0 },
    { x: 0.64, y: 0.4, z: 0 },
    { x: 0.4, y: 0.64, z: 0 },
    { x: 0.75, y: 0.6, z: 0 },
    { x: 0.6, y: 0.75, z: 0 },
    { x: 0.1, y: 0.1, z: 0.1 },
    { x: 2, y: 0, z: 0 },
  ])('holds the previous posture for flat, diagonal, or moving samples: %j', (measurement) => {
    expect(physicalOrientation(measurement)).toBeNull();
  });
});
