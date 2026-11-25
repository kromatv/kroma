import type { LocaleSet, OfferedLocale, TextDirection } from './types.ts';

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

function codeSet(list: string): ReadonlySet<string> {
  return new Set(list.trim().split(/\s+/));
}

const RIGHT_TO_LEFT_SCRIPTS = codeSet(`
  adlm arab armi avst chrs cprt elym gara hatr hebr hung khar lydi mand mani mend merc mero narb
  nbat nkoo orkh ougr palm phli phlp phnx prti rohg samr sarb sidt sogd sogo syrc thaa yezi
`);

const RIGHT_TO_LEFT_LANGUAGES = codeSet(`
  ae ar dv fa he iw ji ks ps sd ug ur yi aeb arc arq ars ary arz bal bej bgn bqi brh chg ckb gbz
  glk jpr jrb khw lad lah lrc mde mzn nqo ota pal phn pnb rhg sam sdh shu sog swb syc syr trw
`);

const LANGUAGE_AND_SCRIPT = /^([a-z]{2,8})(?:-[a-z]{3}){0,3}(?:-([a-z]{4}))?(?=-|$)/;

/** Which way a BCP 47 tag is written. A script subtag decides when there is
 *  one (`az-Arab` is `rtl`, `ar-Latn` is `ltr`), else the language's usual
 *  script does (`ar`, `fa`, `he` and its old tag `iw`). A table, not
 *  `Intl.Locale#getTextInfo`, so it answers on every engine. */
export function directionOf(tag: string): TextDirection {
  const [, language = '', script] = LANGUAGE_AND_SCRIPT.exec(subtags(tag).join('-')) ?? [];
  const rightToLeft = script
    ? RIGHT_TO_LEFT_SCRIPTS.has(script)
    : RIGHT_TO_LEFT_LANGUAGES.has(language);
  return rightToLeft ? 'rtl' : 'ltr';
}

function offered<L extends string>(
  names: Readonly<Record<L, string>>,
  codes: readonly L[],
  beta: readonly L[],
): OfferedLocale<L>[] {
  return codes.map((code) => ({
    code,
    name: names[code],
    dir: directionOf(code),
    labelKey: labelKey(code),
    stage: beta.includes(code) ? 'beta' : 'stable',
  }));
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

  const LOCALES = offered(names, codes, beta);

  return {
    detectLocale,
    isLocale,
    normalizeLocale,
    DEFAULT_LOCALE: defaultLocale,
    SUPPORTED_LOCALES: supported,
    LOCALES,
  } as const;
}
