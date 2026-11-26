import type { OfferedLocale } from '@kromatv/i18n';
import { describe, expect, it } from 'vitest';
import { createTranslator } from './i18n';
import {
  groupLocales,
  type LocaleChoice,
  localeChoices,
  searchLocales,
  sortLocales,
  suggestedLocales,
} from './locale-choices';

const choice = (code: string, endonym: string, name: string): LocaleChoice => ({
  code,
  endonym,
  name,
  beta: false,
});

const IN_ENGLISH = [
  choice('ja', '日本語', 'Japanese'),
  choice('fr', 'Français', 'French'),
  choice('de', 'Deutsch', 'German'),
  choice('en', 'English', 'English'),
  choice('pt-BR', 'Português (Brasil)', 'Portuguese (Brazil)'),
  choice('es', 'Español', 'Spanish'),
  choice('vi', 'Tiếng Việt', 'Vietnamese'),
];

const IN_FRENCH = [
  choice('de', 'Deutsch', 'Allemand'),
  choice('en', 'English', 'Anglais'),
  choice('es', 'Español', 'Espagnol'),
  choice('fr', 'Français', 'Français'),
  choice('ja', '日本語', 'Japonais'),
];

const CODES = IN_ENGLISH.map((language) => language.code);

const codesOf = (choices: readonly LocaleChoice[]) => choices.map((language) => language.code);

const offered = (code: string, name: string, stage: 'stable' | 'beta'): OfferedLocale<string> => ({
  code,
  name,
  dir: 'ltr',
  labelKey: `lang.${code}`,
  stage,
});

describe('localeChoices', () => {
  it('names each language for itself and in the language of the reader', () => {
    const [german] = localeChoices([offered('de', 'Deutsch', 'stable')], createTranslator('fr'));

    expect(german).toEqual({ code: 'de', endonym: 'Deutsch', name: 'Allemand', beta: false });
  });

  it('keeps the own name of a language the reader has no name for yet', () => {
    const [klingon] = localeChoices(
      [offered('tlh', 'tlhIngan Hol', 'beta')],
      createTranslator('en'),
    );

    expect(klingon).toEqual({
      code: 'tlh',
      endonym: 'tlhIngan Hol',
      name: 'tlhIngan Hol',
      beta: true,
    });
  });
});

describe('sortLocales', () => {
  it('sorts by the name the reader knows each language by', () => {
    expect(codesOf(sortLocales(IN_ENGLISH, 'en'))).toEqual([
      'en',
      'fr',
      'de',
      'ja',
      'pt-BR',
      'es',
      'vi',
    ]);
  });

  it('sorts the way the language of the reader does', () => {
    const shuffled = [...IN_FRENCH].reverse();

    expect(codesOf(sortLocales(shuffled, 'fr'))).toEqual(['de', 'en', 'es', 'fr', 'ja']);
  });
});

describe('suggestedLocales', () => {
  it('puts the picked language first, then the ones the device asks for, in its order', () => {
    const suggested = suggestedLocales(CODES, { picked: 'ja', device: ['fr-CH', 'de', 'it'] });

    expect(suggested).toEqual(['ja', 'fr', 'de']);
  });

  it('gives a regional language to a device that asks for the bare one', () => {
    expect(suggestedLocales(CODES, { picked: null, device: ['pt'] })).toEqual(['pt-BR']);
  });

  it('names each language once, however often it is asked for', () => {
    const suggested = suggestedLocales(CODES, { picked: 'fr', device: ['fr-CH', 'fr-FR', 'en'] });

    expect(suggested).toEqual(['fr', 'en']);
  });

  it('leaves out a pick that is not on offer', () => {
    expect(suggestedLocales(CODES, { picked: 'xx', device: [] })).toEqual([]);
  });
});

describe('groupLocales', () => {
  it('lifts the suggested languages out, in their order, and keeps the others sorted', () => {
    const groups = groupLocales(sortLocales(IN_ENGLISH, 'en'), ['fr', 'en']);

    expect(codesOf(groups.suggested)).toEqual(['fr', 'en']);
    expect(codesOf(groups.others)).toEqual(['de', 'ja', 'pt-BR', 'es', 'vi']);
  });
});

describe('searchLocales', () => {
  it('finds a language by its own name, without its accents and in any case', () => {
    expect(codesOf(searchLocales(IN_ENGLISH, 'FRANCAIS'))).toEqual(['fr']);
    expect(codesOf(searchLocales(IN_ENGLISH, 'tieng viet'))).toEqual(['vi']);
  });

  it('finds a language by its name in the language of the reader', () => {
    expect(codesOf(searchLocales(IN_ENGLISH, 'german'))).toEqual(['de']);
  });

  it('finds a language by its code', () => {
    expect(codesOf(searchLocales(IN_ENGLISH, 'pt-br'))).toEqual(['pt-BR']);
  });

  it('finds a language written in another script', () => {
    expect(codesOf(searchLocales(IN_ENGLISH, '日本'))).toEqual(['ja']);
  });

  it('keeps every language while nothing is typed', () => {
    expect(searchLocales(IN_ENGLISH, '  ')).toHaveLength(IN_ENGLISH.length);
  });
});
