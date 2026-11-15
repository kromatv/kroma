import { describe, expect, it } from 'vitest';
import {
  CROP_IDENTITY,
  clampTransform,
  coverScale,
  naturalCropSize,
  outputSize,
  placeImage,
  turn,
  turnedSize,
  zoomTo,
} from './crop-geometry';

const LANDSCAPE = { width: 400, height: 200 };
const SQUARE_FRAME = { aspect: 1, minZoom: 1, maxZoom: 3 };

describe('turnedSize', () => {
  it('keeps the sides on a half turn and swaps them on a quarter turn', () => {
    expect(turnedSize(LANDSCAPE, 180)).toEqual(LANDSCAPE);
    expect(turnedSize(LANDSCAPE, 90)).toEqual({ width: 200, height: 400 });
  });
});

describe('coverScale', () => {
  it('fits the shorter side of the image to the frame', () => {
    expect(coverScale(LANDSCAPE, 0, { width: 100, height: 100 })).toBe(0.5);
  });

  it('measures the image as turned', () => {
    expect(coverScale(LANDSCAPE, 90, { width: 100, height: 300 })).toBe(0.75);
  });
});

describe('turn', () => {
  it('goes round clockwise to the right and back to the left', () => {
    expect(turn(0, 'right')).toBe(90);
    expect(turn(270, 'right')).toBe(0);
    expect(turn(0, 'left')).toBe(270);
    expect(turn(90, 'left')).toBe(0);
  });
});

describe('clampTransform', () => {
  it('leaves a transform already inside the bounds as it is', () => {
    const inside = { zoom: 2, x: 0.2, y: -0.1, rotation: 0 as const };

    expect(clampTransform(LANDSCAPE, inside, SQUARE_FRAME)).toEqual(inside);
  });

  it('holds the zoom inside its range', () => {
    expect(clampTransform(LANDSCAPE, { ...CROP_IDENTITY, zoom: 9 }, SQUARE_FRAME).zoom).toBe(3);
    expect(clampTransform(LANDSCAPE, { ...CROP_IDENTITY, zoom: 0.2 }, SQUARE_FRAME).zoom).toBe(1);
  });

  it('never zooms under the cover, whatever the range says', () => {
    const loose = { aspect: 1, minZoom: 0.5, maxZoom: 0.8 };

    expect(clampTransform(LANDSCAPE, { ...CROP_IDENTITY, zoom: 0.6 }, loose).zoom).toBe(1);
  });

  it('stops an offset where the edge of the image meets the frame', () => {
    const dragged = { ...CROP_IDENTITY, x: 2, y: 2 };

    expect(clampTransform(LANDSCAPE, dragged, SQUARE_FRAME)).toMatchObject({ x: 0.5, y: 0 });
  });

  it('gives the freed axis to a turned image', () => {
    const dragged = { ...CROP_IDENTITY, rotation: 90 as const, x: -2, y: -2 };

    expect(clampTransform(LANDSCAPE, dragged, SQUARE_FRAME)).toMatchObject({ x: 0, y: -0.5 });
  });
});

describe('zoomTo', () => {
  it('scales the offsets with the zoom, so the middle of the frame stays put', () => {
    const start = { ...CROP_IDENTITY, x: 0.2, y: -0.1 };

    expect(zoomTo(start, 2, SQUARE_FRAME)).toEqual({ zoom: 2, x: 0.4, y: -0.2, rotation: 0 });
  });

  it('stops at the end of the range', () => {
    const start = { ...CROP_IDENTITY, zoom: 2, x: 0.2 };

    expect(zoomTo(start, 12, SQUARE_FRAME)).toMatchObject({ zoom: 3 });
    expect(zoomTo(start, 12, SQUARE_FRAME).x).toBeCloseTo(0.3);
  });
});

describe('placeImage', () => {
  it('centres a covering image on the frame', () => {
    expect(placeImage(LANDSCAPE, CROP_IDENTITY, 1)).toEqual({
      left: -0.5,
      top: 0,
      width: 2,
      height: 1,
    });
  });

  it('moves with the offsets and grows with the zoom', () => {
    const moved = { zoom: 2, x: 0.25, y: -0.5, rotation: 0 as const };

    expect(placeImage(LANDSCAPE, moved, 1)).toEqual({ left: -1.25, top: -1, width: 4, height: 2 });
  });

  it('sizes the unturned box so that it covers once turned', () => {
    const turned = { ...CROP_IDENTITY, rotation: 90 as const };

    expect(placeImage(LANDSCAPE, turned, 1)).toEqual({ left: -0.5, top: 0, width: 2, height: 1 });
    expect(placeImage(LANDSCAPE, turned, 2)).toEqual({
      left: -0.5,
      top: -0.5,
      width: 2,
      height: 2,
    });
  });
});

describe('naturalCropSize', () => {
  it('counts the image pixels the frame spans', () => {
    expect(naturalCropSize(LANDSCAPE, CROP_IDENTITY, 1)).toEqual({ width: 200, height: 200 });
    expect(naturalCropSize(LANDSCAPE, { ...CROP_IDENTITY, zoom: 2 }, 1)).toEqual({
      width: 100,
      height: 100,
    });
  });

  it('never goes under one pixel', () => {
    const tiny = { width: 1, height: 1 };

    expect(naturalCropSize(tiny, { ...CROP_IDENTITY, zoom: 3 }, 1)).toEqual({
      width: 1,
      height: 1,
    });
  });
});

describe('outputSize', () => {
  const natural = { width: 200, height: 100 };

  it('takes both sides as given', () => {
    expect(outputSize({ width: 512.4, height: 512 }, natural, 2)).toEqual({
      width: 512,
      height: 512,
    });
  });

  it('derives the missing side from the aspect', () => {
    expect(outputSize({ width: 300 }, natural, 2)).toEqual({ width: 300, height: 150 });
    expect(outputSize({ height: 300 }, natural, 2)).toEqual({ width: 600, height: 300 });
  });

  it('falls back to the natural size when neither side is asked for', () => {
    expect(outputSize({}, natural, 2)).toBe(natural);
  });
});
