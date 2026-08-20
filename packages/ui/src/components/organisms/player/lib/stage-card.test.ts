import { describe, expect, it } from 'vitest';
import { CARD_MARGIN, panelGeometry } from './metrics';
import { stageCard } from './stage-card';

// Everything stageCard returns is a fraction of the stage, so a case is stated
// as a stage size plus the ratio the picture claims, and read back in the same
// pixels the caller would.
function measure(width: number, height: number, aspect?: number) {
  const card = stageCard(width, height, aspect);
  const box = card.picture ?? { x: 0, y: 0, width: 1, height: 1 };
  return {
    card,
    free: (width - panelGeometry(width).width) / width,
    picture: {
      left: box.x * width,
      top: box.y * height,
      width: box.width * width,
      height: box.height * height,
    },
    shrunk: {
      left: card.rect.x * width,
      top: card.rect.y * height,
      width: card.rect.w * width,
      height: card.rect.h * height,
    },
  };
}

describe('stageCard', () => {
  it('leaves the surface filling the stage until the media declares a shape', () => {
    const { card, free } = measure(1920, 1080);
    expect(card.picture).toBeNull();
    expect(card.scale).toBeCloseTo(free - (CARD_MARGIN * 2) / 1920, 5);
  });

  it('letterboxes a picture wider than the stage', () => {
    const { picture } = measure(1600, 1200, 2.35);
    expect(picture.width).toBeCloseTo(1600, 5);
    expect(picture.height).toBeCloseTo(1600 / 2.35, 5);
    expect(picture.left).toBeCloseTo(0, 5);
    expect(picture.top).toBeCloseTo((1200 - 1600 / 2.35) / 2, 5);
  });

  it('pillarboxes a picture narrower than the stage', () => {
    const { picture } = measure(1600, 900, 1);
    expect(picture.width).toBeCloseTo(900, 5);
    expect(picture.height).toBeCloseTo(900, 5);
    expect(picture.left).toBeCloseTo(350, 5);
    expect(picture.top).toBeCloseTo(0, 5);
  });

  it('shrinks the PICTURE into the card, not the stage around it', () => {
    const { shrunk, free } = measure(1600, 1200, 2.35);
    expect(shrunk.width).toBeCloseTo(free * 1600 - CARD_MARGIN * 2, 5);
    expect(shrunk.left).toBeCloseTo(CARD_MARGIN, 5);
  });

  // 9:16 phone footage, 32:9 ultrawide, and a square: the card is whichever of
  // the two slot edges runs out first, and it stays centred in both axes.
  it.each([
    ['vertical', 9 / 16],
    ['ultrawide', 32 / 9],
    ['square', 1],
    ['academy', 4 / 3],
    ['scope', 2.39],
  ])('fits and centres %s footage on a 16:9 stage', (_name, aspect) => {
    const { picture, shrunk, free } = measure(1920, 1080, aspect);
    expect(picture.width / picture.height).toBeCloseTo(aspect, 5);
    expect(picture.width).toBeLessThanOrEqual(1920.001);
    expect(picture.height).toBeLessThanOrEqual(1080.001);
    expect(picture.left).toBeCloseTo((1920 - picture.width) / 2, 5);
    expect(picture.top).toBeCloseTo((1080 - picture.height) / 2, 5);

    expect(shrunk.width / shrunk.height).toBeCloseTo(aspect, 5);
    expect(shrunk.width).toBeLessThanOrEqual(free * 1920 - CARD_MARGIN * 2 + 0.001);
    expect(shrunk.height).toBeLessThanOrEqual(1080 - CARD_MARGIN * 2 + 0.001);
    expect(shrunk.left).toBeCloseTo((free * 1920 - shrunk.width) / 2, 5);
    expect(shrunk.top).toBeCloseTo((1080 - shrunk.height) / 2, 5);
  });

  it('fills the height it is given rather than the width, for vertical footage', () => {
    const { picture, shrunk } = measure(1920, 1080, 9 / 16);
    expect(picture.height).toBeCloseTo(1080, 5);
    expect(shrunk.height).toBeCloseTo(1080 - CARD_MARGIN * 2, 5);
  });

  // A television shell scales its whole canvas, so `onLayout` measures something
  // other than the pixels a style is read in. Only the RATIO may reach the maths.
  it('answers the same fractions however the stage was measured', () => {
    const full = stageCard(1920, 1080, 2.39);
    const scaled = stageCard(1920 * 0.8148, 1080 * 0.8148, 2.39);
    expect(scaled.picture?.x).toBeCloseTo(full.picture?.x ?? -1, 6);
    expect(scaled.picture?.width).toBeCloseTo(full.picture?.width ?? -1, 6);
    expect(scaled.picture?.height).toBeCloseTo(full.picture?.height ?? -1, 6);
  });

  it('places the transform origin so the scale alone lands the picture', () => {
    const { card, shrunk } = measure(1600, 900, 1);
    const box = card.picture ?? { x: 0, y: 0, width: 1, height: 1 };
    // The origin is the fixed point: P maps to origin + (P - origin) * scale.
    const mapped = card.origin + (box.x - card.origin) * card.scale;
    expect(mapped * 1600).toBeCloseTo(shrunk.left, 5);
  });

  it('never grows the picture past its full-stage size', () => {
    expect(stageCard(1600, 1200, 0.5).scale).toBeLessThanOrEqual(1);
  });

  it('ignores an aspect that is not a real ratio', () => {
    expect(stageCard(1920, 1080, Number.POSITIVE_INFINITY).picture).toBeNull();
    expect(stageCard(1920, 1080, Number.NaN).picture).toBeNull();
    expect(stageCard(1920, 1080, -2).picture).toBeNull();
  });

  it('falls back to half the stage before the first measurement', () => {
    expect(stageCard(0, 0).scale).toBe(0.5);
  });
});
