import type { LocaleSet, OfferedLocale } from './types.ts';

/** The namespace holding each locale's name for itself, the one catalog an app
 *  needs before anything renders. */
export const LABEL_NAMESPACE = 'lang';

/** Where a locale's name for itself lives in its own catalog. One spelling,
 *  because both the locale set and `defineI18n` read it. */
export function labelKey<L extends string>(code: L): `lang.${L}` {
  return `${LABEL_NAMESPACE}.${code}`;
}

function subtags(tag: string): string[] {
  return tag.toLowerCase().split(/[-_]/);
}

/** The locales a product offers its readers, knowable without loading a single
 *  message: `createLocales({ fr: 'Français', en: 'English' }, 'fr')`. The value
 *  of each entry is the endonym `normalizeLocale` accepts next to a BCP 47 tag,
 *  because that is how the server stores an account's language. `beta` names
 *  the ones still being translated. */
export function createLocales<
  const N extends Record<string, string>,
  const D extends keyof N & string,
>(
  names: N,
  defaultLocale: D,
  beta: readonly (keyof N & string)[] = [],
): LocaleSet<keyof N & string, D> {
  type L = keyof N & string;

  const codes = Object.keys(names) as L[];
  const supported = new Set<L>(codes);
  const folded = new Map<string, L>(codes.map((code) => [subtags(code).join('-'), code]));

  const isLocale = (value: unknown): value is L =>
    typeof value === 'string' && supported.has(value as L);

  // The longest prefix a locale is named after wins, `pt-BR` before `pt`; a
  // bare language then takes its first regional locale, so a reader asking for
  // `pt` is not sent to the default while `pt-BR` is offered.
  const byTag = (tag: string): L | null => {
    const parts = subtags(tag);
    for (let length = parts.length; length > 0; length -= 1) {
      const code = folded.get(parts.slice(0, length).join('-'));
      if (code) {
        return code;
      }
    }
    const language = parts[0];
    return codes.find((code) => subtags(code)[0] === language) ?? null;
  };

  const normalizeLocale = (tag?: string | null): L | null => {
    if (!tag) {
      return null;
    }
    const lower = tag.toLowerCase();
    return byTag(tag) ?? codes.find((code) => names[code]?.toLowerCase() === lower) ?? null;
  };

  const detectLocale = (preferred?: string | null): L => {
    const explicit = normalizeLocale(preferred);
    if (explicit) {
      return explicit;
    }
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
      if (loc) {
        return loc;
      }
    }
    return defaultLocale;
  };

  const LOCALES = codes.map((code): OfferedLocale<L> => ({
    code,
    labelKey: labelKey(code),
    stage: beta.includes(code) ? 'beta' : 'stable',
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
