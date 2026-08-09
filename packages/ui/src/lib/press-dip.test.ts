import type { LayoutChangeEvent } from 'react-native';
import { describe, expect, it } from 'vitest';
import { motion } from '#ui/core/tokens';
import { longestSideOf, pressScaleFor } from './press-dip';

describe('the press dip', () => {
  it('falls back to the design floor while unmeasured', () => {
    expect(pressScaleFor(0)).toBe(motion.pressScale);
  });

  it('keeps the deep dip on a small control', () => {
    expect(pressScaleFor(60)).toBe(motion.pressScale);
    expect(pressScaleFor(120)).toBe(motion.pressScale);
  });

  it('lands the same pixel travel on a wide row', () => {
    expect(900 * (1 - pressScaleFor(900))).toBeCloseTo(6);
    expect(2000 * (1 - pressScaleFor(2000))).toBeCloseTo(6);
  });

  it('never dips deeper than the floor', () => {
    for (const size of [1, 40, 200, 640, 1600]) {
      expect(pressScaleFor(size)).toBeGreaterThanOrEqual(motion.pressScale);
      expect(pressScaleFor(size)).toBeLessThan(1);
    }
  });
});

describe('the measured side', () => {
  const layout = (width: number, height: number) =>
    ({ nativeEvent: { layout: { width, height, x: 0, y: 0 } } }) as LayoutChangeEvent;

  it('takes the longest side, whichever one that is', () => {
    // The dip is a scale, so it travels furthest on the longer edge: that is
    // the one the pixel budget has to be measured against.
    expect(longestSideOf(layout(900, 60))).toBe(900);
    expect(longestSideOf(layout(60, 900))).toBe(900);
  });

  it('reads a square as its own size', () => {
    expect(longestSideOf(layout(120, 120))).toBe(120);
  });

  it('feeds straight into the scale, so an unmeasured control gets the floor', () => {
    expect(pressScaleFor(longestSideOf(layout(0, 0)))).toBe(motion.pressScale);
  });
});
