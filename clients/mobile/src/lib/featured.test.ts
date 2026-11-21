import type { ContinueItem, MediaItem, Metadata, SectionItem, Show } from '@kromatv/client/media';
import type { Translate } from '@kromatv/i18n';
import { describe, expect, it } from 'vitest';
import { featuredAgeRating, featuredMetaLine, featuredProgress } from './featured';

const t = ((key: string) => key) as Translate;

const meta = (over: Partial<Metadata> = {}): Metadata =>
  ({ genres: ['Action', 'Thriller', 'Crime'], ...over }) as Metadata;

const movie = (over: Partial<MediaItem> = {}): SectionItem => ({
  type: 'movie',
  item: {
    id: 'itm_1',
    title: 'Heat',
    year: 1995,
    durationMs: 10_620_000,
    metadata: meta(),
    ...over,
  } as unknown as MediaItem,
});

const show = (over: Partial<Show> = {}): SectionItem => ({
  type: 'show',
  show: {
    id: 'shw_1',
    title: 'Severance',
    year: 2022,
    metadata: meta({ genres: ['Drama'] }),
    ...over,
  } as unknown as Show,
});

const resume = (itemId: string, positionMs: number, durationMs: number): ContinueItem => ({
  item: { id: itemId } as unknown as MediaItem,
  positionMs,
  durationMs,
  updatedAt: '2026-01-01T00:00:00Z',
});

describe('featuredMetaLine', () => {
  it('reads a year, a runtime and no more than two genres', () => {
    expect(featuredMetaLine(t, movie())).toBe('1995 · 2h57 · genre.action · genre.thriller');
  });

  it('leaves the age rating to its badge, for a film and for a series', () => {
    const film = movie({ metadata: meta({ certification: 'PG-13' }) });
    const series = show({ metadata: meta({ genres: ['Drama'], certification: 'TV-MA' }) });

    expect(featuredMetaLine(t, film)).toBe('1995 · 2h57 · genre.action · genre.thriller');
    expect(featuredMetaLine(t, series)).toBe('2022 · genre.drama');
  });

  it('hands the badge the age rating of a film and of a series', () => {
    const rating = { label: '12', country: 'FR', borrowed: false };

    expect(featuredAgeRating(movie({ metadata: meta({ ageRating: rating }) }))).toEqual(rating);
    expect(featuredAgeRating(show({ metadata: meta({ ageRating: rating }) }))).toEqual(rating);
    expect(featuredAgeRating(movie())).toBeNull();
  });

  it('leaves out the runtime a series has no single one of', () => {
    expect(featuredMetaLine(t, show())).toBe('2022 · genre.drama');
  });

  it('falls back to the genres alone when nothing else is known', () => {
    expect(featuredMetaLine(t, movie({ year: null, durationMs: null }))).toBe(
      'genre.action · genre.thriller',
    );
  });

  it('is empty for a title carrying none of the three', () => {
    expect(featuredMetaLine(t, movie({ year: null, durationMs: null, metadata: null }))).toBe('');
  });
});

describe('featuredProgress', () => {
  it('reports how far into a movie the resume rail says the viewer is', () => {
    expect(featuredProgress(movie(), [resume('itm_1', 5_310_000, 10_620_000)])).toBeCloseTo(0.5, 6);
  });

  it("reads a series' own progress rather than the resume rail", () => {
    expect(featuredProgress(show({ progress: 40 }), [])).toBeCloseTo(0.4, 6);
  });

  it('has nothing to report for a title nobody started', () => {
    expect(featuredProgress(movie(), [resume('itm_2', 60_000, 120_000)])).toBeNull();
    expect(featuredProgress(show(), [])).toBeNull();
  });

  it('falls back to the item duration when the rail carries none', () => {
    const entry = resume('itm_1', 2_655_000, 0);

    expect(featuredProgress(movie(), [{ ...entry, durationMs: null }])).toBeCloseTo(0.25, 6);
  });
});
