import { describe, expect, it } from 'vitest';
import { languageChoices, languageOf } from './language';

const tags = (query: string, taken: string[] = []) =>
  languageChoices(query, new Set(taken)).map((l) => l.tag);

describe('languageOf', () => {
  it('names a language in English and in itself', () => {
    expect(languageOf('de')).toEqual({ tag: 'de', name: 'German', nativeName: 'Deutsch' });
  });

  it('falls back to the tag for one Intl cannot read', () => {
    expect(languageOf('not a tag')).toEqual({
      tag: 'not a tag',
      name: 'not a tag',
      nativeName: 'not a tag',
    });
  });
});

describe('languageChoices', () => {
  it('offers the common languages first', () => {
    expect(tags('').slice(0, 4)).toEqual(['es', 'de', 'it', 'pt-BR']);
  });

  it('leaves out the languages the project already has', () => {
    expect(tags('', ['es', 'de']).slice(0, 2)).toEqual(['it', 'pt-BR']);
  });

  it('finds a language by its English name, its own name or its tag, ignoring case', () => {
    expect(tags('german')).toEqual(['de']);
    expect(tags('NEDERLANDS')).toEqual(['nl']);
    expect(tags('zh-hant')).toEqual(['zh-Hant']);
  });

  it('offers a valid tag the list lacks, written the canonical way', () => {
    expect(tags('zu')).toEqual(['zu']);
    expect(tags('pt-ao')[0]).toBe('pt-AO');
  });

  it('offers no tag that is malformed, unknown to Intl, or already taken', () => {
    expect(tags('xq')).toEqual([]);
    expect(tags('de-')).toEqual([]);
    expect(tags('zu', ['zu'])).toEqual([]);
  });

  it('does not offer a typed tag twice when the list has it', () => {
    expect(tags('ja').filter((tag) => tag === 'ja')).toEqual(['ja']);
  });
});
