import type { LocaleSet } from './types';

/** Where a locale's name for itself lives in its own catalog. One spelling,
 *  because both the locale set and `defineI18n` read it. */
export function labelKey<L extends string>(code: L): `lang.${L}` {
  return `lang.${code}`;
}

/** The locales a product ships, knowable without loading a single message:
 *  `createLocales({ fr: 'Français', en: 'English' }, 'fr')`. The value of each
 *  entry is the endonym `normalizeLocale` accepts next to a BCP 47 tag, because
 *  that is how the server stores an account's language. */
export function createLocales<
  const N extends Record<string, string>,
  const D extends keyof N & string,
>(names: N, defaultLocale: D): LocaleSet<keyof N & string, D> {
  type L = keyof N & string;

  const codes = Object.keys(names) as L[];
  const supported = new Set<L>(codes);

  const isLocale = (value: unknown): value is L =>
    typeof value === 'string' && supported.has(value as L);

  const normalizeLocale = (tag?: string | null): L | null => {
    if (!tag) return null;
    const lower = tag.toLowerCase();
    const base = lower.split(/[-_]/)[0];
    if (isLocale(base)) return base;
    for (const code of codes) {
      if (names[code]?.toLowerCase() === lower) return code;
    }
    return null;
  };

  const detectLocale = (preferred?: string | null): L => {
    const explicit = normalizeLocale(preferred);
    if (explicit) return explicit;
    const nav = typeof navigator !== 'undefined' ? navigator : undefined;
    const languages = nav?.languages ?? [];
    const language = nav?.language;
    let tags: readonly string[] = [];
    if (languages.length > 0) {
      tags = languages;
    } else if (language) {
      tags = [language];
    }
    for (const t of tags) {
      const loc = normalizeLocale(t);
      if (loc) return loc;
    }
    return defaultLocale;
  };

  const LOCALES = codes.map((code): LocaleSet<L, D>['LOCALES'][number] => ({
    code,
    labelKey: labelKey(code),
  }));

  return {
    detectLocale,
    isLocale,
    normalizeLocale,
    DEFAULT_LOCALE: defaultLocale,
    SUPPORTED_LOCALES: supported,
    LOCALES,
  } as const;
}
