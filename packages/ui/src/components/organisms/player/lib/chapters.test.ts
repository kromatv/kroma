import { describe, expect, it } from 'vitest';
import type { Chapter } from '../types';
import { currentChapter, currentChapterIndex, normalizeChapters } from './chapters';

const raw = (startMs: number, title = `c${startMs}`, kind?: Chapter['kind']): Chapter =>
  ({ startMs, endMs: 0, title, ...(kind ? { kind } : {}) }) as Chapter;

describe('normalizeChapters', () => {
  it('returns [] when there is nothing meaningful to segment', () => {
    expect(normalizeChapters(null, 1000)).toEqual([]);
    expect(normalizeChapters(undefined, 1000)).toEqual([]);
    expect(normalizeChapters([], 1000)).toEqual([]);
    expect(normalizeChapters([raw(0), raw(500)], 0)).toEqual([]);
    // A single chapter is not segmentable either.
    expect(normalizeChapters([raw(0)], 1000)).toEqual([]);
  });

  it('sorts by start and gap-fills endMs to the next start / runtime', () => {
    const out = normalizeChapters([raw(600, 'b'), raw(0, 'a'), raw(300, 'c')], 1000);
    expect(out.map((c) => [c.startMs, c.endMs])).toEqual([
      [0, 300],
      [300, 600],
      [600, 1000],
    ]);
    expect(out.map((c) => c.title)).toEqual(['a', 'c', 'b']);
  });

  it('defaults a missing kind to "chapter" and preserves explicit kinds', () => {
    const out = normalizeChapters([raw(0), raw(500, 'credits', 'credits')], 1000);
    expect(out[0]?.kind).toBe('chapter');
    expect(out[1]?.kind).toBe('credits');
  });

  it('clamps starts into [0, durMs] and drops chapters at/after the runtime', () => {
    // startMs 1200 >= durMs(1000) is filtered out, leaving a single valid chapter.
    const out = normalizeChapters([raw(-200), raw(400), raw(1200)], 1000);
    expect(out.map((c) => c.startMs)).toEqual([0, 400]);
    expect(out[0]?.startMs).toBe(0); // negative start clamped up to 0
  });

  it('drops non-finite starts', () => {
    const out = normalizeChapters([raw(Number.NaN), raw(200), raw(700)], 1000);
    expect(out.map((c) => c.startMs)).toEqual([200, 700]);
  });
});

describe('currentChapterIndex', () => {
  const chapters = normalizeChapters([raw(0), raw(300), raw(600)], 1000);

  it('returns -1 when there are no chapters', () => {
    expect(currentChapterIndex([], 100)).toBe(-1);
  });

  it('finds the segment containing the position (inclusive of its start)', () => {
    expect(currentChapterIndex(chapters, 0)).toBe(0);
    expect(currentChapterIndex(chapters, 299)).toBe(0);
    expect(currentChapterIndex(chapters, 300)).toBe(1);
    expect(currentChapterIndex(chapters, 950)).toBe(2);
  });

  it('clamps a position before the first start to index 0', () => {
    expect(currentChapterIndex(chapters, -50)).toBe(0);
  });
});

describe('currentChapter', () => {
  const chapters = normalizeChapters([raw(0, 'intro'), raw(300, 'mid'), raw(600, 'end')], 1000);

  it('returns the chapter object at the position', () => {
    expect(currentChapter(chapters, 350)?.title).toBe('mid');
  });

  it('returns null when there are no chapters', () => {
    expect(currentChapter([], 10)).toBeNull();
  });
});
