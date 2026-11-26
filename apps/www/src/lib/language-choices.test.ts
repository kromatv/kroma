import { describe, expect, it } from 'vitest';
import { languageChoices, languageFlagUrl } from './language-choices';
import { LOCALES } from './locales';

describe('languageChoices', () => {
  it('leads with the language being read, then sorts the rest as it sorts', () => {
    const choices = languageChoices(['en', 'fr', 'de', 'vi'], 'vi');

    expect(choices.map((choice) => choice.name)).toEqual([
      'Tiếng Việt',
      'Tiếng Anh',
      'Tiếng Đức',
      'Tiếng Pháp',
    ]);
  });

  it('names each language in itself and in the reader language, capitalised as each writes', () => {
    const [, spanish] = languageChoices(['fr', 'es'], 'fr');

    expect(spanish).toMatchObject({ lang: 'es', ownName: 'Español', name: 'Espagnol' });
  });
});

describe('languageFlagUrl', () => {
  it('has a square flag for every language the site is written in', () => {
    const unflagged = LOCALES.filter((lang) => languageFlagUrl(lang) === undefined);

    expect(unflagged).toEqual([]);
  });

  it('draws English with the flag of the United States, as the site spells it', () => {
    expect(languageFlagUrl('en')).toContain('/US.svg');
  });

  it('draws no flag for a language no one country speaks for', () => {
    expect(languageFlagUrl('ar')).toBeUndefined();
  });
});
