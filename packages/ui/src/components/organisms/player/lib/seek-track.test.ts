import { describe, expect, it } from 'vitest';
import { msAtOffset, offsetAt, SEGMENT_GAP, segmentWidths } from './seek-track';

/** A film with chapters of wildly different lengths, which is the case that
 * broke: equal-width segments put the playhead nowhere near its own fill. */
const CHAPTERS = [
  { startMs: 0, endMs: 96_000 }, // cold open, 96s
  { startMs: 96_000, endMs: 2_760_000 }, // act one
  { startMs: 2_760_000, endMs: 5_940_000 }, // act two
  { startMs: 5_940_000, endMs: 9_180_000 }, // act three
  { startMs: 9_180_000, endMs: 9_840_000 }, // credits
];

const WIDTH = 1000;

describe('segmentWidths', () => {
  it('shares the track out in proportion to each chapter, minus the gaps', () => {
    const widths = segmentWidths(CHAPTERS, WIDTH);
    const content = WIDTH - SEGMENT_GAP * (CHAPTERS.length - 1);
    expect(widths.reduce((sum, width) => sum + width, 0)).toBeCloseTo(content, 6);
    // The 96s cold open is a sliver; act two is a third of the film.
    expect(widths[0]).toBeCloseTo((content * 96) / 9840, 4);
    expect(widths[2]).toBeCloseTo((content * 3180) / 9840, 4);
  });

  it('has nothing to lay out for a film with no chapters', () => {
    expect(segmentWidths([], WIDTH)).toEqual([]);
  });
});

describe('offsetAt', () => {
  it('is the full width past the last chapter, so the playhead never falls off', () => {
    expect(offsetAt(9_999_000, CHAPTERS, WIDTH)).toBe(WIDTH);
  });

  it('has nothing to place with no chapters at all', () => {
    expect(offsetAt(2_940_000, [], WIDTH)).toBe(0);
  });

  it('is 0 at the start and the full width at the end', () => {
    expect(offsetAt(0, CHAPTERS, WIDTH)).toBe(0);
    expect(offsetAt(9_840_000, CHAPTERS, WIDTH)).toBeCloseTo(WIDTH, 6);
  });

  it('lands inside the segment that holds the moment, not at cur/dur', () => {
    // 49:00 is 180s into act two. The naive percentage would put it at 29.9% of
    // the track; the segment it belongs to does not start until ~28%.
    const x = offsetAt(2_940_000, CHAPTERS, WIDTH);
    const [coldOpen = 0, actOne = 0, actTwo = 0] = segmentWidths(CHAPTERS, WIDTH);
    const actTwoLeft = coldOpen + actOne + SEGMENT_GAP * 2;
    expect(x).toBeGreaterThan(actTwoLeft);
    expect(x).toBeLessThan(actTwoLeft + actTwo);
    expect(x).toBeCloseTo(actTwoLeft + actTwo * (180 / 3180), 6);
  });

  it('degrades to a plain proportion for a single segment', () => {
    const one = [{ startMs: 0, endMs: 10_000 }];
    expect(offsetAt(2_500, one, WIDTH)).toBeCloseTo(250, 6);
  });

  it('has nothing to say before the track is measured', () => {
    expect(offsetAt(2_940_000, CHAPTERS, 0)).toBe(0);
  });
});

describe('msAtOffset', () => {
  it('round-trips with offsetAt', () => {
    for (const ms of [0, 96_000, 2_940_000, 5_000_000, 9_839_000]) {
      expect(msAtOffset(offsetAt(ms, CHAPTERS, WIDTH), CHAPTERS, WIDTH)).toBeCloseTo(ms, 3);
    }
  });

  it('clamps past either end', () => {
    expect(msAtOffset(-40, CHAPTERS, WIDTH)).toBe(0);
    expect(msAtOffset(WIDTH + 40, CHAPTERS, WIDTH)).toBeCloseTo(9_840_000, 6);
  });

  it('has no moment to name before the track is measured, or with no chapters', () => {
    expect(msAtOffset(120, CHAPTERS, 0)).toBe(0);
    expect(msAtOffset(120, [], WIDTH)).toBe(0);
  });

  it('lands on a chapter start rather than dividing by a track the gaps ate', () => {
    const pair = [
      { startMs: 0, endMs: 10_000 },
      { startMs: 10_000, endMs: 20_000 },
    ];
    expect(msAtOffset(0, pair, SEGMENT_GAP)).toBe(0);
  });

  it('resolves a press in a gap to the chapter boundary it sits on', () => {
    const [coldOpen = 0] = segmentWidths(CHAPTERS, WIDTH);
    const inGap = coldOpen + SEGMENT_GAP / 2;
    expect(msAtOffset(inGap, CHAPTERS, WIDTH)).toBe(96_000);
  });
});
