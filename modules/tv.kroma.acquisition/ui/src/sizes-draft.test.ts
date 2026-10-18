import { describe, expect, it } from 'vitest';
import type { QualityId, Sizes } from './rules-schemas';
import { badCell, cellKey, draftOfSizes, limitBytes, setCell, toSizes } from './sizes-draft';

const QUALITIES: QualityId[] = ['webdl-1080p', 'remux-2160p'];

function sizes(): Sizes {
  return {
    movie: [{ quality: 'webdl-1080p', min: 2, preferred: 20, max: 40 }],
    episode: [{ quality: 'remux-2160p', min: 1, preferred: null, max: null }],
    movieRuntime: 110,
    episodeRuntime: 45,
  };
}

describe('draftOfSizes', () => {
  it('gives every quality a row, whether the server sent one or not', () => {
    const draft = draftOfSizes(sizes(), QUALITIES);

    expect(draft.cells[cellKey('movie', 'webdl-1080p', 'preferred')]).toBe('20');
    expect(draft.cells[cellKey('movie', 'remux-2160p', 'min')]).toBe('0');
    expect(draft.cells[cellKey('movie', 'remux-2160p', 'max')]).toBe('');
  });

  it('shows an absent limit as a blank cell, which is no limit', () => {
    const draft = draftOfSizes(sizes(), QUALITIES);

    expect(draft.cells[cellKey('episode', 'remux-2160p', 'max')]).toBe('');
    expect(draft.episodeRuntime).toBe('45');
  });
});

describe('badCell', () => {
  it('passes a draft read straight off the server', () => {
    expect(badCell(draftOfSizes(sizes(), QUALITIES), QUALITIES)).toBeNull();
  });

  it('names a cell holding something that is not a size', () => {
    const key = cellKey('movie', 'webdl-1080p', 'min');

    const typo = setCell(draftOfSizes(sizes(), QUALITIES), key, 'deux');

    expect(badCell(typo, QUALITIES)).toBe(key);
  });

  it('names the ceiling of a range that runs backwards', () => {
    const low = setCell(
      draftOfSizes(sizes(), QUALITIES),
      cellKey('movie', 'webdl-1080p', 'max'),
      '1',
    );

    expect(badCell(low, QUALITIES)).toBe(cellKey('movie', 'webdl-1080p', 'max'));
  });

  it('names a preferred size outside the range it sits in', () => {
    const key = cellKey('movie', 'webdl-1080p', 'preferred');

    const outside = setCell(draftOfSizes(sizes(), QUALITIES), key, '90');

    expect(badCell(outside, QUALITIES)).toBe(key);
  });

  it('refuses a runtime of zero, which no size could be divided by', () => {
    const none = setCell(draftOfSizes(sizes(), QUALITIES), 'ignored', '');

    expect(badCell({ ...none, movieRuntime: '0' }, QUALITIES)).toBe('movieRuntime');
    expect(badCell({ ...none, episodeRuntime: '' }, QUALITIES)).toBe('episodeRuntime');
  });
});

describe('toSizes', () => {
  it('sends a row per quality, a blank cell as no limit', () => {
    const payload = toSizes(draftOfSizes(sizes(), QUALITIES), QUALITIES);

    expect(payload.movie).toEqual([
      { quality: 'webdl-1080p', min: 2, preferred: 20, max: 40 },
      { quality: 'remux-2160p', min: 0, preferred: null, max: null },
    ]);
    expect(payload.movieRuntime).toBe(110);
  });

  it('carries an edited cell through', () => {
    const edited = setCell(
      draftOfSizes(sizes(), QUALITIES),
      cellKey('episode', 'remux-2160p', 'max'),
      '120',
    );

    const row = toSizes(edited, QUALITIES).episode.find((one) => one.quality === 'remux-2160p');

    expect(row).toEqual({ quality: 'remux-2160p', min: 1, preferred: null, max: 120 });
  });
});

describe('limitBytes', () => {
  it('reads a ceiling per minute as the file a full runtime allows', () => {
    const draft = draftOfSizes(sizes(), QUALITIES);

    expect(limitBytes(draft, 'movie', 'webdl-1080p')).toBe(40 * 110 * 1_048_576);
  });

  it('has nothing to say about a quality with no ceiling', () => {
    const draft = draftOfSizes(sizes(), QUALITIES);

    expect(limitBytes(draft, 'episode', 'remux-2160p')).toBeNull();
  });

  it('has nothing to say while the runtime cannot be read', () => {
    const draft = { ...draftOfSizes(sizes(), QUALITIES), movieRuntime: 'deux heures' };

    expect(limitBytes(draft, 'movie', 'webdl-1080p')).toBeNull();
  });
});
