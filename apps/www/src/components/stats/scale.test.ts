import { describe, expect, it } from 'vitest';
import { scaleFor } from './scale';

describe('scaleFor', () => {
  it('tops the axis just above the peak rather than far above it', () => {
    expect(scaleFor(47)).toEqual({ top: 50, lines: 5 });
    expect(scaleFor(12)).toEqual({ top: 15, lines: 3 });
    expect(scaleFor(220)).toEqual({ top: 250, lines: 5 });
  });

  it('never leaves the peak outside the plot', () => {
    for (let peak = 1; peak <= 500; peak++) {
      expect(scaleFor(peak).top).toBeGreaterThanOrEqual(peak);
    }
  });

  it('always divides into whole-numbered gridlines', () => {
    for (let peak = 1; peak <= 500; peak++) {
      const { top, lines } = scaleFor(peak);
      expect(Number.isInteger(top / lines)).toBe(true);
    }
  });

  it('gives a flat, empty series an axis it can still be drawn on', () => {
    expect(scaleFor(0).top).toBeGreaterThan(0);
  });
});
