import { describe, expect, it } from 'vitest';
import { collectLanguages, hasLanguage } from './browse-languages';

describe('collectLanguages', () => {
  it('counts each title once per language, whatever spelling its files used', () => {
    const items = [
      { audioLanguages: ['eng', 'fre'] },
      { audioLanguages: ['fra', 'fr-CA'] },
      { audioLanguages: ['en'], subtitleLanguages: ['ger'] },
      {},
    ];

    const audio = collectLanguages(items, 'audio');

    expect(audio).toEqual([
      { code: 'en', count: 2 },
      { code: 'fr', count: 2 },
    ]);
    expect(collectLanguages(items, 'subtitles')).toEqual([{ code: 'de', count: 1 }]);
  });
});

describe('hasLanguage', () => {
  it('finds a language in any track, in any spelling, on the stream asked about only', () => {
    const item = { audioLanguages: ['jpn', 'eng'], subtitleLanguages: ['fre'] };

    expect(hasLanguage(item, 'audio', 'en')).toBe(true);
    expect(hasLanguage(item, 'audio', 'ja')).toBe(true);
    expect(hasLanguage(item, 'subtitles', 'fr')).toBe(true);
    expect(hasLanguage(item, 'audio', 'fr')).toBe(false);
    expect(hasLanguage({}, 'subtitles', 'fr')).toBe(false);
    expect(hasLanguage(item, 'audio', '')).toBe(false);
  });
});
