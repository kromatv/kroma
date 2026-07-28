// The browse screens' shared text metrics.
//
// These are RESOLVED values, not tokens, and that is the point of the file. The
// design specifies the hero title as `clamp(34px, 5.5vh, 60px)`, which on the
// fixed 1080-tall stage every TV shell renders into is 59px - so it is spelled
// as 59 rather than recomputed per screen against a viewport that is always the
// same. Tracking is the one thing NOT hardcoded, because it is a ratio of the
// size and the design owns the ratio.
//
// They live here because they used to live in four screens as identical
// literals, which made retuning the title for a different panel a hunt for
// copies. A test that only checked the numbers would miss that entirely, so what
// this pins is the derivation and the shape - what a screen can spread without
// having to say anything more.

import { tracking } from '@kroma/ui/kit';
import { describe, expect, it } from 'vitest';
import { EMPTY, TITLE } from './screenStyle';

describe('the hero title', () => {
  it('is the clamp resolved for the 1080 stage', () => {
    // clamp(34px, 5.5vh, 60px) at 1080 tall.
    expect(TITLE.fontSize).toBe(59);
  });

  it('derives its tracking from the size, through the design token', () => {
    // Not a literal: the ratio is the design's, and a hardcoded letterSpacing
    // would drift the moment the size is retuned.
    expect(TITLE.letterSpacing).toBe(59 * tracking.display);
    expect(TITLE.letterSpacing).toBeCloseTo(-1.18, 5);
  });

  it('sets a line height tighter than the size, as a display face wants', () => {
    expect(TITLE.lineHeight).toBeLessThan(TITLE.fontSize as number);
  });

  it('is bold enough to read at three metres', () => {
    expect(TITLE.fontWeight).toBe('700');
  });
});

describe('the empty state', () => {
  it('is held narrow enough to stay readable at three metres', () => {
    // A full-width line of 18px text on a 1920 stage is unreadable across a
    // room, whatever the size says.
    expect(EMPTY.maxWidth).toBe(640);
  });

  it('is centred', () => {
    expect(EMPTY.textAlign).toBe('center');
  });

  it('is smaller than the title, and not bold', () => {
    expect(EMPTY.fontSize as number).toBeLessThan(TITLE.fontSize as number);
    expect(EMPTY.fontWeight).not.toBe('700');
  });
});

describe('what a screen can spread', () => {
  it('carries no colour, so a screen keeps its own ink', () => {
    // These are METRICS. A colour here would override whatever surface the
    // screen puts them on.
    expect(TITLE).not.toHaveProperty('color');
    expect(EMPTY).not.toHaveProperty('color');
  });

  it('is one shared object per role, not a copy per screen', () => {
    // Four screens spread these; the whole reason they moved here is that they
    // were four identical literals.
    expect(TITLE).toBe(TITLE);
    expect(TITLE).not.toEqual(EMPTY);
  });
});
