import { describe, expect, it } from 'vitest';
import { likelyRegion } from './likely-region';

const LANGUAGES = ['de', 'en', 'es', 'fr', 'ja', 'ko', 'pt', 'vi', 'zh', 'it', 'nl', 'pl', 'sv'];

describe('likelyRegion', () => {
  it('agrees with CLDR as Intl.Locale reads it', () => {
    const answers = LANGUAGES.map((code) => likelyRegion(code));

    expect(answers).toEqual(LANGUAGES.map((code) => new Intl.Locale(code).maximize().region));
  });

  it('reads a script the language is written in where it moves the region', () => {
    expect(likelyRegion('pa-Arab')).toBe('PK');
    expect(likelyRegion('zh-Hans')).toBe('CN');
  });

  it('asks Intl.Locale for a code the table does not hold', () => {
    expect(likelyRegion('fil')).toBe('PH');
  });

  it('names no country for a code that is not a language', () => {
    expect(likelyRegion('constructor')).toBeNull();
    expect(likelyRegion('qq')).toBeNull();
  });
});
