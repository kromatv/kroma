import { describe, expect, it } from 'vitest';
import { CENTROID_COUNT, centroidOf } from './country-centroids';

describe('centroidOf', () => {
  it('lands a pin on the country rather than on its outermost islands', () => {
    expect(centroidOf('CH')).toEqual([46.8, 8.2]);
    expect(centroidOf('FR')?.[1]).toBeGreaterThan(0);
    expect(centroidOf('US')?.[1]).toBeCloseTo(-98.6, 1);
  });

  it('has nowhere to put a code that is not a country', () => {
    expect(centroidOf('XX')).toBeUndefined();
    expect(centroidOf('T1')).toBeUndefined();
    expect(centroidOf('constructor')).toBeUndefined();
  });

  it('covers the whole ISO list, including the code the edge uses for Kosovo', () => {
    expect(CENTROID_COUNT).toBeGreaterThanOrEqual(249);
    expect(centroidOf('XK')).toBeDefined();
  });

  it('keeps every coordinate on the map', () => {
    for (const code of ['GL', 'AQ', 'TV', 'WF', 'NZ', 'KI']) {
      const [lat, lng] = centroidOf(code) ?? [NaN, NaN];
      expect(Math.abs(lat)).toBeLessThanOrEqual(90);
      expect(Math.abs(lng)).toBeLessThanOrEqual(180);
    }
  });
});
