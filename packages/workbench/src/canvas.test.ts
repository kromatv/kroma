// The frame table, without a renderer.
//
// `VIEWPORTS` is the one place a frame is described - its name, its silhouette,
// its point size, whether it turns - and three places read it: the toolbar's
// menu, the frame itself and the caption under it. So the table is worth an
// assertion of its own, and so is the quarter-turn, which is the whole of what
// "rotate" means here.

import { describe, expect, it } from 'vitest';
import { canRotate, frameSize, hairline, stageWidth, VIEWPORTS, type ViewportName } from './canvas';

const NAMES: ViewportName[] = ['fit', 'tv', 'phone', 'tablet'];

describe('VIEWPORTS', () => {
  it('describes every frame the toolbar offers', () => {
    for (const name of NAMES) {
      const frame = VIEWPORTS[name];
      expect(frame).toBeTruthy();
      expect(frame?.label).toBeTruthy();
      expect(frame?.glyph).toBeTruthy();
    }
  });

  it('gives `fit` no size, because it is the component and not a device', () => {
    expect(VIEWPORTS.fit?.size).toBeNull();
    expect(frameSize('fit', false)).toBeNull();
    expect(frameSize('fit', true)).toBeNull();
  });
});

describe('canRotate', () => {
  it('is true for what is held in a hand and false for what is not', () => {
    expect(canRotate('phone')).toBe(true);
    expect(canRotate('tablet')).toBe(true);
    // A portrait television is a design nobody ships, and `fit` has no frame to
    // turn: the toolbar hides the control rather than offering a dead one.
    expect(canRotate('tv')).toBe(false);
    expect(canRotate('fit')).toBe(false);
  });
});

describe('hairline', () => {
  it('comes out one real pixel after the stage has scaled it', () => {
    // The border is drawn INSIDE the same transform as the frame, so its width
    // has to be pre-divided: this is the fix for a frame edge that was 0.72px at
    // 14% opacity and therefore not visibly there at all.
    for (const scale of [1, 0.72, 0.5, 0.34]) {
      expect(hairline(scale) * scale).toBeCloseTo(1, 5);
    }
  });

  it('stops asking for a thicker border once the stage gets absurd', () => {
    // Past a third, the clamp takes over and the edge is allowed to thin out
    // again: a 1920 television in a phone-width canvas would otherwise ask for a
    // 10pt border, which reads as a picture mount rather than as an edge.
    expect(hairline(0.25)).toBe(3);
    expect(hairline(0.05)).toBe(3);
    expect(hairline(0)).toBe(3);
  });
});

describe('frameSize', () => {
  it('swaps the points rather than changing them: it is the same device', () => {
    const upright = frameSize('phone', false);
    const turned = frameSize('phone', true);
    expect(upright).toEqual({ width: 390, height: 844 });
    expect(turned).toEqual({ width: 844, height: 390 });
    expect(turned?.width).toBe(upright?.height);
  });

  it('turns back to exactly where it started', () => {
    for (const name of NAMES) {
      expect(frameSize(name, false)).toEqual(VIEWPORTS[name]?.size ?? null);
    }
  });
});

describe('stageWidth', () => {
  it('leaves a story with no declared width to the canvas to measure', () => {
    // Which is what `Fit` then scales if it overflows. Every ordinary component.
    expect(stageWidth(undefined, 900)).toEqual({ scroll: false });
  });

  it('gives a fixed width exactly that, and scrolls when it will not fit', () => {
    expect(stageWidth(1100, 1400)).toEqual({ width: 1100, scroll: false });
    // Never scaled: a component that measures itself would be told the scaled
    // number while its children laid out against the real one. That is what sliced
    // VirtualRail's tiles and put its edge scrims over the artwork.
    expect(stageWidth(1100, 900)).toEqual({ width: 1100, scroll: true });
  });

  it("gives `fill` the stage's own width, so resizing re-measures the component", () => {
    expect(stageWidth('fill', 900)).toEqual({ width: 900, scroll: false });
    expect(stageWidth({}, 640)).toEqual({ width: 640, scroll: false });
  });

  it('clamps a range, and caps at max on a wide desk', () => {
    expect(stageWidth({ min: 480, max: 1200 }, 900)).toEqual({ width: 900, scroll: false });
    // A 10-foot row should not stretch across a 4K desk just because it could.
    expect(stageWidth({ min: 480, max: 1200 }, 2400)).toEqual({ width: 1200, scroll: false });
  });

  it('holds `min` and scrolls rather than measuring at a width no screen has', () => {
    // A grid handed 200pt lays itself out as one column, which is not a design
    // anyone is trying to look at.
    expect(stageWidth({ min: 480 }, 200)).toEqual({ width: 480, scroll: true });
    expect(stageWidth({ min: 480, max: 1200 }, 300)).toEqual({ width: 480, scroll: true });
  });

  it('waits rather than pinning a story to zero before the first layout', () => {
    // jsdom and a first frame both report 0, and `available` is not yet an answer.
    expect(stageWidth('fill', 0)).toEqual({ width: undefined, scroll: false });
    expect(stageWidth({ min: 480 }, 0)).toEqual({ width: 480, scroll: false });
    expect(stageWidth(1100, 0)).toEqual({ width: 1100, scroll: false });
  });
});
