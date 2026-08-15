import { describe, expect, it } from 'vitest';
import { fitStage, MIN_STAGE_W, STAGE_H, STAGE_W } from './stage';

describe('fitStage', () => {
  it('is the design canvas, untouched, on a 1080p television', () => {
    expect(fitStage(STAGE_W, STAGE_H)).toEqual({ scale: 1, width: STAGE_W });
  });

  it('draws the design at 2x on a 4K panel rather than twice as many columns', () => {
    expect(fitStage(3840, 2160)).toEqual({ scale: 2, width: STAGE_W });
  });

  // The point of taking the scale from the height: the window's extra width
  // becomes canvas the grids fill, instead of bars either side of a 16:9 box.
  it('hands a wider-than-16:9 window the extra width as canvas', () => {
    const fit = fitStage(2560, 1080);
    expect(fit.scale).toBe(1);
    expect(fit.width).toBe(2560);
  });

  // The floor is the design width, so a window narrower than 16:9 loses size
  // rather than canvas: the top bar has no column to drop.
  it('scales down rather than narrowing past the floor', () => {
    const fit = fitStage(1310, 790);
    expect(fit.width).toBe(MIN_STAGE_W);
    expect(fit.scale).toBeCloseTo(1310 / MIN_STAGE_W, 6);
  });

  it('holds the floor on a portrait window too', () => {
    const fit = fitStage(800, 1280);
    expect(fit.width).toBe(MIN_STAGE_W);
    expect(fit.scale).toBeCloseTo(800 / MIN_STAGE_W, 6);
  });

  it('never overflows the window, whatever its shape', () => {
    for (const [w, h] of [
      [1280, 800],
      [1366, 768],
      [1920, 1080],
      [2560, 1080],
      [3440, 1440],
      [800, 1280],
      [640, 480],
    ] as Array<[number, number]>) {
      const fit = fitStage(w, h);
      expect(fit.width * fit.scale).toBeLessThanOrEqual(w + 1);
      expect(STAGE_H * fit.scale).toBeLessThanOrEqual(h + 1);
    }
  });

  it('falls back to the design canvas for a window with no size yet', () => {
    expect(fitStage(0, 0)).toEqual({ scale: 1, width: STAGE_W });
  });
});
