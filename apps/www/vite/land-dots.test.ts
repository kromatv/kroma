import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { LAND_SCALE } from '../src/lib/geo.ts';
import { loadLand } from './land-atlas.ts';
import { landDots } from './land-dots.ts';

const ROWS = 60;

const land = await loadLand(fileURLToPath(new URL('..', import.meta.url)));
const dots = landDots(land, ROWS);

function pairs(): [number, number][] {
  return Array.from({ length: dots.length / 2 }, (_, i) => [
    (dots[2 * i] ?? 0) / LAND_SCALE,
    (dots[2 * i + 1] ?? 0) / LAND_SCALE,
  ]);
}

function dotted(lat: number, lng: number, withinDegrees: number): boolean {
  return pairs().some(([dotLat, dotLng]) => Math.hypot(dotLat - lat, dotLng - lng) < withinDegrees);
}

describe('landDots', () => {
  it('keeps about the land share of the lattice', () => {
    const count = dots.length / 2;

    expect(count).toBeGreaterThan(900);
    expect(count).toBeLessThan(1800);
  });

  it('dots the Sahara and the Siberian plain and leaves the South Pacific empty', () => {
    expect(dotted(25, 10, 3)).toBe(true);
    expect(dotted(62, 100, 3)).toBe(true);
    expect(dotted(-30, -120, 8)).toBe(false);
  });

  it('writes whole tenths of a degree, latitude first', () => {
    for (const [lat, lng] of pairs()) {
      expect(Number.isInteger(lat * LAND_SCALE)).toBe(true);
      expect(Math.abs(lat)).toBeLessThanOrEqual(90);
      expect(Math.abs(lng)).toBeLessThanOrEqual(180);
    }
  });

  it('is the same lattice every build', () => {
    expect(landDots(land, ROWS)).toEqual(dots);
  });
});
