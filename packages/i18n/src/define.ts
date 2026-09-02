import { drainAnnouncements } from './announce';
import { createI18n, type I18n, type I18nConfig } from './i18n';
import { createLocales, labelKey } from './locales';
import type { Locale, Messages } from './registry';
import type { Catalog, LocaleSet } from './types';

export interface DefineI18nConfig
  extends Pick<I18nConfig<Record<string, Catalog>>, 'plural' | 'lazy'> {
  /** One catalog per locale, keyed by code, holding what ships up front. The
   *  default locale's names every language under `lang.<code>`, which is what
   *  the locale set reads before any other message is needed. */
  catalogs: Readonly<Record<string, Catalog>>;
  defaultLocale: Locale;
}

type AppI18n = I18n<Locale, Messages>;

export interface DefinedI18n extends LocaleSet<Locale> {
  readonly i18n: AppI18n;
  readonly translate: AppI18n['translate'];
  readonly translator: AppI18n['translator'];
  readonly addCatalogs: AppI18n['add'];
}

function endonyms(catalogs: Readonly<Record<string, Catalog>>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const code of Object.keys(catalogs)) out[code] = catalogs[code]?.[labelKey(code)] ?? code;
  return out;
}

/**
 * The app's one instance, typed by the registry rather than by what is passed
 * in: with catalogs discovered from a folder, the values say `string` and the
 * `@kroma/i18n/vite` plugin's declaration says which locales and keys exist.
 *
 * ```ts
 * export const { i18n, translate, LOCALES, DEFAULT_LOCALE } = defineI18n({
 *   catalogs, lazy, defaultLocale: 'fr',
 * });
 * ```
 *
 * The instance also takes every namespace a chunk announces on import (see
 * `announceCatalogs`), so a screen's messages are on their way before it
 * renders and `useT` can wait for them.
 *
 * There is no separate table of language names: a catalog names its own
 * language under `lang.<code>` (`"lang.fr": "Français"` in `fr/lang.json`),
 * which is the entry the picker renders anyway, so writing it twice is how the
 * two drift apart.
 */
export function defineI18n(config: DefineI18nConfig): DefinedI18n {
  const { catalogs, defaultLocale, lazy, plural } = config;
  // The two casts are the same claim: the registry types are what the plugin
  // declared from the folder, and these values are what the folder holds. The
  // app's catalog test keeps the two equal; nothing here can.
  const set = createLocales(endonyms(catalogs), defaultLocale) as LocaleSet<Locale>;
  const i18n = createI18n({ catalogs, defaultLocale, lazy, plural }) as unknown as AppI18n;
  drainAnnouncements(({ namespace, catalogs: announced }) => i18n.register(namespace, announced));
  return {
    ...set,
    i18n,
    translate: i18n.translate,
    translator: i18n.translator,
    addCatalogs: i18n.add,
  };
}
