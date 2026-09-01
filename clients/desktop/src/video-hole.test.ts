import { describe, expect, it } from 'vitest';
import { type Box, type HoleRect, type HoleShape, holeShape, moved, union } from './video-hole';

const box = (left: number, top: number, right: number, bottom: number): Box => ({
  left,
  top,
  right,
  bottom,
});

const STAGE = box(0, 0, 1280, 800);

describe('union', () => {
  it('wraps every box given', () => {
    expect(union([box(10, 20, 30, 40), box(100, 0, 200, 60)])).toEqual(box(10, 0, 200, 60));
  });

  it('skips empty boxes, and has nothing to wrap for none', () => {
    expect(union([box(5, 5, 5, 5), box(10, 10, 20, 20)])).toEqual(box(10, 10, 20, 20));
    expect(union([])).toBeNull();
  });
});

describe('holeShape', () => {
  it('reads a bare stage as the whole window', () => {
    expect(holeShape(STAGE, [], 1280, 800)).toEqual({
      rect: { x: 0, y: 0, w: 1, h: 1 },
      covers: [],
    });
  });

  it('keeps the chrome as covers rather than shrinking the picture', () => {
    const shape = holeShape(STAGE, [box(0, 0, 1280, 80), box(0, 640, 1280, 800)], 1280, 800);
    expect(shape?.rect).toEqual({ x: 0, y: 0, w: 1, h: 1 });
    expect(shape?.covers).toEqual([
      { x: 0, y: 0, w: 1, h: 0.1 },
      { x: 0, y: 0.8, w: 1, h: 0.2 },
    ]);
  });

  it('keeps a cue band, and a cover floating in the middle', () => {
    const shape = holeShape(STAGE, [box(320, 700, 960, 760)], 1280, 800);
    expect(shape?.covers).toEqual([{ x: 0.25, y: 0.875, w: 0.5, h: 0.075 }]);
  });

  it('drops a cover the picture does not reach', () => {
    expect(holeShape(box(0, 0, 640, 400), [box(700, 0, 800, 100)], 1280, 800)?.covers).toEqual([]);
  });

  it('clips a cover to the picture it overlaps', () => {
    const shape = holeShape(box(0, 0, 640, 800), [box(320, 0, 1280, 80)], 1280, 800);
    expect(shape?.covers).toEqual([{ x: 0.25, y: 0, w: 0.25, h: 0.1 }]);
  });

  it('clips a stage that hangs off the window', () => {
    expect(holeShape(box(-40, -40, 1320, 840), [], 1280, 800)?.rect).toEqual({
      x: 0,
      y: 0,
      w: 1,
      h: 1,
    });
  });

  it('has no shape for a sliver, or an unmeasured window', () => {
    expect(holeShape(box(0, 0, 1280, 8), [], 1280, 800)).toBeNull();
    expect(holeShape(STAGE, [], 0, 0)).toBeNull();
  });
});

describe('moved', () => {
  const shape = (h: number, covers: HoleRect[] = []): HoleShape => ({
    rect: { x: 0, y: 0, w: 1, h },
    covers,
  });
  const cover = (y: number, h: number): HoleRect => ({ x: 0, y, w: 1, h });

  it('is false for the same shape and true across null', () => {
    expect(moved(shape(1), shape(1))).toBe(false);
    expect(moved(shape(1), null)).toBe(true);
    expect(moved(null, null)).toBe(false);
  });

  it('ignores sub-pixel drift and catches a real move', () => {
    expect(moved(shape(1), shape(1 + 1e-6))).toBe(false);
    expect(moved(shape(1), shape(0.8))).toBe(true);
  });

  it('catches a cover appearing, moving, or leaving', () => {
    expect(moved(shape(1), shape(1, [cover(0, 0.1)]))).toBe(true);
    expect(moved(shape(1, [cover(0, 0.1)]), shape(1, [cover(0, 0.2)]))).toBe(true);
    expect(moved(shape(1, [cover(0, 0.1)]), shape(1, [cover(0, 0.1)]))).toBe(false);
  });
});
