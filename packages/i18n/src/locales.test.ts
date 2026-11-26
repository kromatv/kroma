import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createLocales, deviceLanguageTags, directionOf, matchLocale } from './locales';
import type { TextDirection } from './types';

const locales = createLocales({ en: 'English', fr: 'Français' }, 'en');

describe('createLocales', () => {
  it('identifies the supported locales', () => {
    expect(locales.isLocale('en')).toBe(true);
    expect(locales.isLocale('fr')).toBe(true);
    expect(locales.isLocale('de')).toBe(false);
  });

  it('normalizes both a BCP 47 tag and a native display name', () => {
    expect(locales.normalizeLocale('en-US')).toBe('en');
    expect(locales.normalizeLocale('fr')).toBe('fr');
    expect(locales.normalizeLocale('English')).toBe('en');
    expect(locales.normalizeLocale('Français')).toBe('fr');
    expect(locales.normalizeLocale('Deutsch')).toBeNull();
  });

  it('exposes the codes, the default, and the name and label key of each locale', () => {
    expect(locales.DEFAULT_LOCALE).toBe('en');
    expect([...locales.SUPPORTED_LOCALES]).toEqual(['en', 'fr']);
    expect(locales.LOCALES).toEqual([
      { code: 'en', name: 'English', dir: 'ltr', labelKey: 'lang.en', stage: 'stable' },
      { code: 'fr', name: 'Français', dir: 'ltr', labelKey: 'lang.fr', stage: 'stable' },
    ]);
  });

  it('says which way each locale is written', () => {
    const set = createLocales({ en: 'English', ar: 'العربية' }, 'en');

    expect(set.LOCALES.map((locale) => locale.dir)).toEqual(['ltr', 'rtl']);
  });

  it('marks the locales still being translated', () => {
    const set = createLocales({ en: 'English', de: 'Deutsch' }, 'en', ['de']);

    expect(set.LOCALES.map((locale) => locale.stage)).toEqual(['stable', 'beta']);
  });

  it('prefers the regional locale a tag names over the language it belongs to', () => {
    const set = createLocales({ pt: 'Português', 'pt-BR': 'Português (Brasil)' }, 'pt');

    expect(set.normalizeLocale('pt_br')).toBe('pt-BR');
    expect(set.normalizeLocale('pt-PT')).toBe('pt');
  });

  it('hands a bare language its regional locale when that is all there is', () => {
    const set = createLocales({ en: 'English', 'zh-Hant': '繁體中文' }, 'en');

    expect(set.normalizeLocale('zh')).toBe('zh-Hant');
    expect(set.normalizeLocale('zh-Hant-TW')).toBe('zh-Hant');
  });
});

describe('deviceLanguageTags', () => {
  it('lists the languages the browser asks for, in its order', () => {
    vi.stubGlobal('navigator', { languages: ['fr-CH', 'de'], language: 'fr-CH' });

    expect(deviceLanguageTags()).toEqual(['fr-CH', 'de']);
  });

  it('settles for the one language a browser without a list names', () => {
    vi.stubGlobal('navigator', { language: 'ko-KR' });

    expect(deviceLanguageTags()).toEqual(['ko-KR']);
  });

  it('lists nothing where there is no navigator', () => {
    vi.stubGlobal('navigator', undefined);

    expect(deviceLanguageTags()).toEqual([]);
  });
});

describe('matchLocale', () => {
  const CODES = ['en', 'pt-BR', 'zh-Hans'] as const;

  it('finds the locale a tag names, whatever its case and separator', () => {
    expect(matchLocale(CODES, 'PT_br')).toBe('pt-BR');
  });

  it('falls back to the language when the region is not offered', () => {
    expect(matchLocale(CODES, 'en-GB')).toBe('en');
    expect(matchLocale(CODES, 'pt-PT')).toBe('pt-BR');
    expect(matchLocale(CODES, 'zh-Hans-CN')).toBe('zh-Hans');
  });

  it('matches nothing for a language that is not offered', () => {
    expect(matchLocale(CODES, 'de-DE')).toBeNull();
  });
});

const RIGHT_TO_LEFT = [
  'ar',
  'fa',
  'he',
  'iw',
  'ur',
  'ps',
  'ckb',
  'dv',
  'yi',
  'sd',
  'ug',
  'ks',
  'syr',
  'nqo',
  'ar-EG',
  'fa_IR',
  'AR',
  'az-Arab',
  'pa-Arab-PK',
  'ff-Adlm',
  'ar-u-nu-latn',
];

const LEFT_TO_RIGHT = [
  'en',
  'fr',
  'ko',
  'zh-Hant',
  'az',
  'ku',
  'ar-Latn',
  'sd-Deva',
  'en-u-nu-arab',
];

const TextInfo = z.object({ direction: z.enum(['ltr', 'rtl']) });

function icuDirection(tag: string): TextDirection | undefined {
  const locale = new Intl.Locale(tag.replaceAll('_', '-'));
  const read: unknown = Reflect.get(locale, 'getTextInfo');
  const info: unknown =
    typeof read === 'function' ? Reflect.apply(read, locale, []) : Reflect.get(locale, 'textInfo');
  return TextInfo.safeParse(info).data?.direction;
}

function twoLetterLanguages(): string[] {
  const letters = Array.from({ length: 26 }, (_, index) => String.fromCodePoint(97 + index));
  return letters.flatMap((first) => letters.map((second) => first + second));
}

describe('directionOf', () => {
  it('reads a language whose script runs right to left, whatever region or case it carries', () => {
    const misread = RIGHT_TO_LEFT.filter((tag) => directionOf(tag) !== 'rtl');

    expect(misread).toEqual([]);
  });

  it('reads every other language left to right', () => {
    const misread = LEFT_TO_RIGHT.filter((tag) => directionOf(tag) !== 'ltr');

    expect(misread).toEqual([]);
  });

  it('lets an explicit script overrule the language it is written for', () => {
    expect([directionOf('az-Arab'), directionOf('ar-Latn')]).toEqual(['rtl', 'ltr']);
  });

  describe.runIf(icuDirection('he') === 'rtl')('where ICU knows a direction', () => {
    it('agrees with it on every two-letter language and every tag above', () => {
      const tags = [...twoLetterLanguages(), ...RIGHT_TO_LEFT, ...LEFT_TO_RIGHT];

      const disagreements = tags.filter((tag) => directionOf(tag) !== icuDirection(tag));

      expect(disagreements).toEqual([]);
    });
  });
});
