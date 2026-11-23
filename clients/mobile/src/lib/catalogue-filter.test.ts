import type { Spoken } from '@kromatv/core';
import { describe, expect, it } from 'vitest';
import { narrowCatalogue } from './catalogue-filter';

function title(name: string, genre: string, spoken: Spoken) {
  return {
    title: name,
    year: null,
    addedAt: '2026-01-01',
    metadata: { genres: [genre] },
    ...spoken,
  };
}

const HEAT = title('Heat', 'Crime', { audioLanguages: ['eng'], subtitleLanguages: ['fre'] });
const AMELIE = title('Amélie', 'Comedy', { audioLanguages: ['fre'], subtitleLanguages: [] });
const TITLES = [HEAT, AMELIE];

describe('the titles a catalogue tab shows', () => {
  it('keeps every title while nothing is picked', () => {
    expect(narrowCatalogue(TITLES, null, {})).toEqual(TITLES);
  });

  it('keeps the titles of the picked genre', () => {
    expect(narrowCatalogue(TITLES, 'comedy', {})).toEqual([AMELIE]);
  });

  it('keeps the titles heard and read in the picked languages, in any spelling', () => {
    expect(narrowCatalogue(TITLES, null, { audio: 'fr' })).toEqual([AMELIE]);
    expect(narrowCatalogue(TITLES, null, { audio: 'en', subtitles: 'fra' })).toEqual([HEAT]);
    expect(narrowCatalogue(TITLES, 'comedy', { audio: 'en' })).toEqual([]);
  });
});
