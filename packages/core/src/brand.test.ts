import { describe, expect, it } from 'vitest';
import { WHEEL_HUB_RATIO, wheelSectors } from './brand';

const SECTOR =
  /^M(\S+ \S+) L(\S+ \S+) A\S+ \S+ 0 0 1 (\S+ \S+) L(\S+ \S+) A\S+ \S+ 0 0 0 (\S+ \S+) Z$/;

function parseSector(d: string) {
  const m = SECTOR.exec(d);
  if (!m) throw new Error(`unparseable sector: ${d}`);
  const [, innerStart, outerStart, outerEnd, innerEnd, closesAt] = m;
  return { innerStart, outerStart, outerEnd, innerEnd, closesAt };
}

describe('wheelSectors', () => {
  it('emits the lockup O as six byte-stable annular sectors', () => {
    expect(wheelSectors()).toEqual([
      'M209 32.96 L209 0 A50 50 0 0 1 252.3 25 L223.76 41.48 A17.045 17.045 0 0 0 209 32.96 Z',
      'M223.76 41.48 L252.3 25 A50 50 0 0 1 252.3 75 L223.76 58.52 A17.045 17.045 0 0 0 223.76 41.48 Z',
      'M223.76 58.52 L252.3 75 A50 50 0 0 1 209 100 L209 67.05 A17.045 17.045 0 0 0 223.76 58.52 Z',
      'M209 67.05 L209 100 A50 50 0 0 1 165.7 75 L194.24 58.52 A17.045 17.045 0 0 0 209 67.05 Z',
      'M194.24 58.52 L165.7 75 A50 50 0 0 1 165.7 25 L194.24 41.48 A17.045 17.045 0 0 0 194.24 58.52 Z',
      'M194.24 41.48 L165.7 25 A50 50 0 0 1 209 0 L209 32.96 A17.045 17.045 0 0 0 194.24 41.48 Z',
    ]);
  });

  it('closes every sector and hands its trailing edge to the next one', () => {
    const parts = wheelSectors().map(parseSector);
    parts.forEach((sector, i) => {
      expect(sector.closesAt).toBe(sector.innerStart);
      const next = parts[(i + 1) % parts.length];
      expect(next?.innerStart).toBe(sector.innerEnd);
      expect(next?.outerStart).toBe(sector.outerEnd);
    });
  });

  it('recentres and rescales onto any frame', () => {
    const [first] = wheelSectors(0, 0, 10, 5);
    expect(first).toBe('M0 -5 L0 -10 A10 10 0 0 1 8.66 -5 L4.33 -2.5 A5 5 0 0 0 0 -5 Z');
  });

  it('sizes the hub as a fraction of the outer radius', () => {
    expect(WHEEL_HUB_RATIO).toBeCloseTo(0.3409, 4);
  });
});
