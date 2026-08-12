import { describe, expect, it } from 'vitest';
import { areaPath, curveOf, linePath, tangentsOf } from './chart-path';
import { type ChartDomain, domainOf } from './chart-scale';

const BOX = { width: 100, height: 50 };
const UNIT: ChartDomain = { min: 0, max: 1 };

const at = (x: number, y: number) => ({ x, y });

// Every cubic in `d`, as its four control points. A bezier lies inside the
// convex hull of those, so bounding them bounds the curve.
function cubics(d: string): { from: number; a: number; b: number; to: number }[] {
  const numbers = /C([\d.-]+) ([\d.-]+),([\d.-]+) ([\d.-]+),([\d.-]+) ([\d.-]+)/g;
  const start = /^M([\d.-]+) ([\d.-]+)/.exec(d);
  let from = Number(start?.[2]);
  const out: { from: number; a: number; b: number; to: number }[] = [];
  for (const match of d.matchAll(numbers)) {
    const to = Number(match[6]);
    out.push({ from, a: Number(match[2]), b: Number(match[4]), to });
    from = to;
  }
  return out;
}

describe('tangentsOf', () => {
  it('is flat everywhere along a flat run', () => {
    expect(tangentsOf([at(0, 10), at(10, 10), at(20, 10)])).toEqual([0, 0, 0]);
  });

  it('is flat at a peak, so the curve does not round over the top of it', () => {
    expect(tangentsOf([at(0, 0), at(10, 10), at(20, 0)])[1]).toBe(0);
  });

  it('holds the secant along a straight run', () => {
    expect(tangentsOf([at(0, 0), at(10, 10), at(20, 20)])).toEqual([1, 1, 1]);
  });

  it('keeps every tangent inside the Fritsch-Carlson limit', () => {
    // A step out of a flat run and back: the mean tangent alone is steep enough
    // for the cubic to leave the samples, so this is where the limit bites.
    const points = [at(0, 0), at(1, 0), at(2, 10), at(3, 10), at(4, 0)];
    const tangents = tangentsOf(points);
    for (let index = 0; index < points.length - 1; index += 1) {
      const here = points[index] as { x: number; y: number };
      const next = points[index + 1] as { x: number; y: number };
      const secant = (next.y - here.y) / (next.x - here.x);
      if (secant === 0) continue;
      const enter = (tangents[index] as number) / secant;
      const leave = (tangents[index + 1] as number) / secant;
      expect(enter * enter + leave * leave).toBeLessThanOrEqual(9);
    }
  });

  it('has nothing to say about fewer than two samples', () => {
    expect(tangentsOf([])).toEqual([]);
    expect(tangentsOf([at(0, 1)])).toEqual([0]);
  });
});

describe('the monotone curve', () => {
  it('stays flat over a flat run rather than rippling around it', () => {
    const d = curveOf([at(0, 10), at(50, 10), at(100, 10)], 'monotone');
    for (const cubic of cubics(d)) {
      expect(cubic.a).toBe(10);
      expect(cubic.b).toBe(10);
    }
  });

  it('never leaves the range of the two samples it joins, on a rising run', () => {
    const rising = [at(0, 50), at(25, 49), at(50, 20), at(75, 3), at(100, 0)];
    for (const cubic of cubics(curveOf(rising, 'monotone'))) {
      const low = Math.min(cubic.from, cubic.to);
      const high = Math.max(cubic.from, cubic.to);
      expect(cubic.a).toBeGreaterThanOrEqual(low);
      expect(cubic.a).toBeLessThanOrEqual(high);
      expect(cubic.b).toBeGreaterThanOrEqual(low);
      expect(cubic.b).toBeLessThanOrEqual(high);
    }
  });

  it('never leaves them over a step out of a flat run and back', () => {
    const spike = [at(0, 40), at(20, 40), at(40, 0), at(60, 0), at(80, 40)];
    for (const cubic of cubics(curveOf(spike, 'monotone'))) {
      const low = Math.min(cubic.from, cubic.to);
      const high = Math.max(cubic.from, cubic.to);
      expect(cubic.a).toBeGreaterThanOrEqual(low);
      expect(cubic.a).toBeLessThanOrEqual(high);
      expect(cubic.b).toBeGreaterThanOrEqual(low);
      expect(cubic.b).toBeLessThanOrEqual(high);
    }
  });

  it('never dips below a floor a series is resting on', () => {
    const floor = [at(0, 50), at(25, 50), at(50, 0), at(75, 50), at(100, 50)];
    for (const cubic of cubics(curveOf(floor, 'monotone'))) {
      expect(cubic.a).toBeLessThanOrEqual(50);
      expect(cubic.b).toBeLessThanOrEqual(50);
    }
  });
});

describe('the other two curves', () => {
  it('joins the samples straight', () => {
    expect(curveOf([at(0, 0), at(50, 10)], 'linear')).toBe('M0 0L50 10');
  });

  it('holds a value until the next sample replaces it', () => {
    expect(curveOf([at(0, 0), at(50, 10)], 'step')).toBe('M0 0L50 0L50 10');
  });

  it('draws a lone sample as a dot, whichever curve is asked for', () => {
    for (const curve of ['linear', 'monotone', 'step'] as const) {
      expect(curveOf([at(4, 8)], curve)).toBe('M4 8L4 8');
    }
    expect(curveOf([], 'monotone')).toBe('');
  });
});

describe('the paths', () => {
  it('draws nothing for a series with nothing in it', () => {
    expect(linePath([], UNIT, BOX)).toBe('');
    expect(linePath([null, null], UNIT, BOX)).toBe('');
    expect(areaPath([], UNIT, BOX)).toBe('');
  });

  it('traces a series left to right', () => {
    expect(linePath([0, 1, 0], UNIT, BOX)).toBe('M0 50L50 0L100 50');
  });

  it('keeps an all-zero series on the floor', () => {
    expect(linePath([0, 0], domainOf([[0, 0]]), BOX, 'monotone')).toBe(
      'M0 50C33.3 50,66.7 50,100 50',
    );
  });

  it('starts a new subpath at a gap rather than jumping it', () => {
    expect(linePath([1, null, 1], UNIT, BOX)).toBe('M0 0L0 0M100 0L100 0');
  });

  it('closes an area down to the baseline', () => {
    expect(areaPath([1, 1], UNIT, BOX)).toBe('M0 0L100 0L100 50L0 50Z');
  });

  it('closes each unbroken run of an area on its own', () => {
    expect(areaPath([1, null, 1], UNIT, BOX)).toBe(
      'M0 0L0 0L0 50L0 50ZM100 0L100 0L100 50L100 50Z',
    );
  });

  it('closes a smoothed area on the curve it drew', () => {
    expect(areaPath([0, 1], UNIT, BOX, 'monotone')).toBe(
      'M0 50C33.3 33.3,66.7 16.7,100 0L100 50L0 50Z',
    );
  });
});

describe('the degenerate geometry a real series produces', () => {
  it('reads two samples at the same x as flat rather than dividing by their gap', () => {
    // A metric sampled twice inside one tick lands on one x. The secant between
    // them has no run, and a tangent of infinity would send the curve off-plot.
    const tangents = tangentsOf([
      { x: 0, y: 10 },
      { x: 10, y: 20 },
      { x: 10, y: 40 },
      { x: 20, y: 50 },
    ]);
    expect(tangents.every(Number.isFinite)).toBe(true);
  });

  it('draws nothing for a run the curve could not trace', () => {
    expect(areaPath([], { min: 0, max: 1 }, { width: 100, height: 40 })).toBe('');
    expect(linePath([], { min: 0, max: 1 }, { width: 100, height: 40 })).toBe('');
  });
});
