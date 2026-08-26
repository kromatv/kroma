/** The variables a message interpolates. A numeric one can also select a
 *  plural variant; see {@link PluralCategory}. */
export type TVars = Record<string, string | number>;

/** One locale's messages, key to template. */
export type Catalog = Readonly<Record<string, string>>;

/** Every locale's messages. A locale may be absent, in which case lookups for
 *  it fall through to the default locale. */
export type Catalogs<L extends string = string> = Readonly<Partial<Record<L, Catalog>>>;

/** A CLDR plural category. Catalogs carry it as a key suffix (`key_one`). */
export type PluralCategory = Intl.LDMLPluralRule;

/** Picks the category a count falls in. Supply one only where
 *  `Intl.PluralRules` is absent or wrong for a language you ship. */
export type PluralRule = (locale: string, count: number) => PluralCategory;

export interface LocaleSet<L extends string, D extends L = L> {
  readonly detectLocale: (preferred?: string | null) => L;
  readonly isLocale: (value: unknown) => value is L;
  readonly normalizeLocale: (tag?: string | null) => L | null;
  readonly DEFAULT_LOCALE: D;
  readonly SUPPORTED_LOCALES: ReadonlySet<L>;
  readonly LOCALES: ReadonlyArray<{ readonly code: L; readonly labelKey: `lang.${L}` }>;
}
