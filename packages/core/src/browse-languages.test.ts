import { describe, expect, it } from 'vitest';
import {
  collectLanguages,
  hasLanguage,
  languageChoices,
  matchesLanguages,
} from './browse-languages';
import { createTranslator } from './i18n';

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

describe('matchesLanguages', () => {
  it('keeps a title only when it has the language on every stream that names one', () => {
    const item = { audioLanguages: ['jpn'], subtitleLanguages: ['fre', 'eng'] };

    expect(matchesLanguages(item, {})).toBe(true);
    expect(matchesLanguages(item, { audio: 'ja', subtitles: 'en' })).toBe(true);
    expect(matchesLanguages(item, { audio: 'ja', subtitles: 'de' })).toBe(false);
    expect(matchesLanguages(item, { audio: 'fr' })).toBe(false);
  });

  it('keeps a series on both streams only when one of its episodes has both', () => {
    const series = {
      audioLanguages: ['eng', 'jpn'],
      subtitleLanguages: ['fre'],
      episodeLanguages: [
        { audioLanguages: ['eng'], subtitleLanguages: [] },
        { audioLanguages: ['jpn'], subtitleLanguages: ['fre'] },
      ],
    };

    expect(matchesLanguages(series, { audio: 'ja', subtitles: 'fr' })).toBe(true);
    expect(matchesLanguages(series, { audio: 'en', subtitles: 'fr' })).toBe(false);
    expect(matchesLanguages(series, { audio: 'en' })).toBe(true);
    expect(matchesLanguages(series, { subtitles: 'fr' })).toBe(true);
  });
});

describe('languageChoices', () => {
  it('names each language for the reader, a code it has no name for in capitals, and notes its count', () => {
    const choices = languageChoices(createTranslator('en'), [
      { code: 'fr', count: 12 },
      { code: 'xx', count: 1 },
    ]);

    expect(choices).toEqual([
      { value: 'fr', label: 'French', note: '12' },
      { value: 'xx', label: 'XX', note: '1' },
    ]);
  });
});
