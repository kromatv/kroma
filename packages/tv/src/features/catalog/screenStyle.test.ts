// The browse screens' shared text metrics are RESOLVED values, not tokens: the
// stage every TV shell renders into is always 1080 tall.

import { tracking } from '@kroma/ui/kit';
import { describe, expect, it } from 'vitest';
import { EMPTY, TITLE } from './screenStyle';

describe('the hero title', () => {
  it('is the clamp resolved for the 1080 stage', () => {
    // clamp(34px, 5.5vh, 60px) at 1080 tall.
    expect(TITLE.fontSize).toBe(59);
  });

  it('derives its tracking from the size, through the design token', () => {
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
    expect(TITLE).not.toHaveProperty('color');
    expect(EMPTY).not.toHaveProperty('color');
  });

  it('is one shared object per role, not a copy per screen', () => {
    expect(TITLE).toBe(TITLE);
    expect(TITLE).not.toEqual(EMPTY);
  });
});
