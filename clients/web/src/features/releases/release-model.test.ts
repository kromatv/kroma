import type { Highlight, Release } from '@kromatv/client/releases';
import { describe, expect, it } from 'vitest';
import { formatReleaseDate, highlightLayout, releaseCounts } from './release-model';

function highlight(title: string): Highlight {
  return { title, body: `${title}, in one paragraph.` };
}

function pictured(title: string): Highlight {
  return { ...highlight(title), image: { url: `https://example.test/${title}.webp`, alt: title } };
}

function release(over: Partial<Release> = {}): Release {
  return { version: '0.1.39', action: [], highlights: [], fixed: [], owner: [], ...over };
}

describe('formatReleaseDate', () => {
  it('writes the day in French for a French reader', () => {
    expect(formatReleaseDate('2026-09-13', 'fr', 'long')).toBe('13 septembre 2026');
  });

  it('writes the day in English for an English reader', () => {
    expect(formatReleaseDate('2026-09-13', 'en', 'long')).toBe('September 13, 2026');
  });

  it('shortens the month in the medium style', () => {
    expect(formatReleaseDate('2026-09-13', 'fr', 'medium')).toBe('13 sept. 2026');
  });

  it('answers null when the release carries no date', () => {
    expect(formatReleaseDate(undefined, 'fr', 'long')).toBeNull();
  });

  it('answers null for a date that is not YYYY-MM-DD', () => {
    expect(formatReleaseDate('13/09/2026', 'fr', 'long')).toBeNull();
  });
});

describe('releaseCounts', () => {
  it('counts the highlights, then the fixes', () => {
    const notes = release({ highlights: [highlight('a'), highlight('b')], fixed: ['x'] });

    expect(releaseCounts(notes)).toEqual([
      { key: 'releases.highlightCount', count: 2 },
      { key: 'releases.fixCount', count: 1 },
    ]);
  });

  it('leaves out a count that is zero', () => {
    expect(releaseCounts(release({ fixed: ['x', 'y'] }))).toEqual([
      { key: 'releases.fixCount', count: 2 },
    ]);
  });
});

describe('highlightLayout', () => {
  it('spans the first highlight across the column when it has a picture', () => {
    const layout = highlightLayout([pictured('a'), highlight('b'), highlight('c')], 2);

    expect(layout).toEqual({ lead: pictured('a'), rows: [[highlight('b'), highlight('c')]] });
  });

  it('keeps a first highlight without a picture in the grid', () => {
    const layout = highlightLayout([highlight('a'), highlight('b'), highlight('c')], 2);

    expect(layout).toEqual({
      lead: null,
      rows: [[highlight('a'), highlight('b')], [highlight('c')]],
    });
  });

  it('gives each highlight a row of its own on a narrow screen', () => {
    const layout = highlightLayout([pictured('a'), highlight('b'), highlight('c')], 1);

    expect(layout).toEqual({ lead: pictured('a'), rows: [[highlight('b')], [highlight('c')]] });
  });
});
