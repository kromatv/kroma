// Generic i18n engine; actual languages are wired up via `createLocales`
// (which locales exist) and `createI18n` (what they say).

export type TVars = Record<string, string | number>;
export type Translate<K extends string> = (key: K, vars?: TVars) => string;

export type Catalog = Readonly<Record<string, string>>;
export type Catalogs<L extends string> = Readonly<Partial<Record<L, Catalog>>>;

export interface I18nInstance<L extends string, K extends string> {
  readonly translate: (locale: L, key: K, vars?: TVars) => string;
  readonly translateIn: (
    catalogs: Catalogs<L>,
    locale: L,
    key: string,
    vars?: TVars,
  ) => string | undefined;
  readonly createTranslator: (locale: L) => Translate<K>;
}

export interface LocaleSet<L extends string, D extends L = L> {
  readonly detectLocale: (preferred?: string | null) => L;
  readonly isLocale: (value: unknown) => value is L;
  readonly normalizeLocale: (tag?: string | null) => L | null;
  readonly DEFAULT_LOCALE: D;
  readonly SUPPORTED_LOCALES: ReadonlySet<L>;
  readonly LOCALES: ReadonlyArray<{ readonly code: L; readonly labelKey: `lang.${L}` }>;
}

export function interpolate(template: string, vars?: TVars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)}/g, (whole, name: string) =>
    Object.hasOwn(vars, name) ? String(vars[name]) : whole,
  );
}

function hasKeyIn<L extends string>(
  catalogs: Catalogs<L>,
  locale: L,
  defaultLocale: L,
  key: string,
): boolean {
  return catalogs[locale]?.[key] != null || catalogs[defaultLocale]?.[key] != null;
}

function pluralKeyIn<L extends string>(
  catalogs: Catalogs<L>,
  locale: L,
  defaultLocale: L,
  key: string,
  count: number,
): string {
  let category: Intl.LDMLPluralRule = count === 1 ? 'one' : 'other';
  try {
    category = new Intl.PluralRules(locale).select(count);
  } catch {
    /* environments without Intl.PluralRules */
  }
  const variant = `${key}_${category}`;
  if (hasKeyIn(catalogs, locale, defaultLocale, variant)) return variant;
  const other = `${key}_other`;
  if (hasKeyIn(catalogs, locale, defaultLocale, other)) return other;
  return key;
}

export function translateIn<L extends string>(
  catalogs: Catalogs<L>,
  locale: L,
  defaultLocale: L,
  key: string,
  vars?: TVars,
): string | undefined {
  const cats = catalogs as Record<string, Catalog>;
  const lookupKey =
    typeof vars?.count === 'number'
      ? pluralKeyIn(catalogs, locale, defaultLocale, key, vars.count)
      : key;
  const template = cats[locale]?.[lookupKey] ?? cats[defaultLocale]?.[lookupKey];
  return template != null ? interpolate(template, vars) : undefined;
}

export type MessageKeyOf<I> = I extends I18nInstance<infer _L, infer K> ? K : never;

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
    labelKey: `lang.${code}`,
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

/** Create a fully-typed translator from JSON catalogs: `createI18n({ fr, en }, 'fr')`. */
export function createI18n<
  const C extends Record<string, Record<string, string>>,
  const D extends keyof C & string,
>(catalogs: C, defaultLocale: D): I18nInstance<keyof C & string, keyof C[D] & string> {
  type L = keyof C & string;
  type K = keyof C[D] & string;

  const cats = catalogs as unknown as Catalogs<L>;

  const translate = (locale: L, key: K, vars?: TVars): string =>
    translateIn(cats, locale, defaultLocale, key, vars) ?? key;

  const boundTranslateIn = (
    catalogs: Catalogs<L>,
    locale: L,
    key: string,
    vars?: TVars,
  ): string | undefined => translateIn(catalogs, locale, defaultLocale, key, vars);

  const createTranslator =
    (locale: L): Translate<K> =>
    (key, vars) =>
      translate(locale, key, vars);

  return {
    translate,
    translateIn: boundTranslateIn,
    createTranslator,
  } as const;
}
