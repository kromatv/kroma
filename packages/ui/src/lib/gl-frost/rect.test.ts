import { describe, expect, it } from 'vitest';
import { coverMap, glRect } from './rect';

const frame = { left: 0, top: 0, width: 960, height: 540 };
const pixels = { width: 1920, height: 1080 };

describe('glRect', () => {
  it('maps a client rect to canvas pixels with the origin at the bottom', () => {
    const r = glRect({ left: 10, top: 20, width: 100, height: 50 }, frame, pixels, 8, 100);

    expect(r).toEqual({ x: 20, y: 1080 - 40 - 100, w: 200, h: 100, radius: 16 });
  });

  it('scales the corner with a focus scale', () => {
    const r = glRect({ left: 0, top: 0, width: 110, height: 50 }, frame, pixels, 10, 100);

    expect(r?.radius).toBeCloseTo(22);
  });

  it('drops a surface that is off the canvas or empty', () => {
    expect(glRect({ left: 0, top: 600, width: 10, height: 10 }, frame, pixels, 0, 10)).toBeNull();
    expect(glRect({ left: 0, top: 0, width: 0, height: 10 }, frame, pixels, 0, 0)).toBeNull();
  });
});

describe('coverMap', () => {
  it('crops a wider image around its position', () => {
    const m = coverMap(
      { width: 100, height: 100 },
      { width: 200, height: 100 },
      { x: 0.5, y: 0.5 },
    );

    expect(m).toEqual({ sx: 0.5, sy: 1, ox: 0.25, oy: -0 });
  });
});
