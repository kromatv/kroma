import { describe, expect, it } from 'vitest';
import { RING_BUSY_ARC, ringGeometry } from './ring';

describe('ringGeometry', () => {
  it('insets the radius by half the thickness so the ring is not clipped', () => {
    const g = ringGeometry({ value: 0, size: 22, thickness: 2.5 });
    expect(g.radius).toBe((22 - 2.5) / 2);
    expect(g.centre).toBe(11);
  });

  it('hides the whole circumference at 0 and none of it at 1', () => {
    expect(ringGeometry({ value: 0 }).dashOffset).toBeCloseTo(
      ringGeometry({ value: 0 }).circumference,
    );
    expect(ringGeometry({ value: 1 }).dashOffset).toBe(0);
  });

  it('hides half at the midpoint', () => {
    const g = ringGeometry({ value: 0.5 });
    expect(g.dashOffset).toBeCloseTo(g.circumference / 2);
  });

  it('draws an empty ring when no value is given at all', () => {
    const g = ringGeometry({});
    expect(g.dashOffset).toBeCloseTo(g.circumference);
  });

  it('leaves three quarters hidden for the indeterminate arc', () => {
    const g = ringGeometry({ value: RING_BUSY_ARC });
    expect(g.dashOffset).toBeCloseTo(g.circumference * 0.75);
  });

  it('clamps a value the caller has not sanitised', () => {
    expect(ringGeometry({ value: 2 }).dashOffset).toBe(0);
    const g = ringGeometry({ value: -1 });
    expect(g.dashOffset).toBeCloseTo(g.circumference);
    expect(ringGeometry({ value: Number.NaN }).dashOffset).toBeCloseTo(g.circumference);
  });
});
