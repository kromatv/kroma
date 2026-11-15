import { drainAnnouncements } from './announce';
import { createI18n, type I18n, type I18nConfig } from './i18n';
import { createLocales, labelKey } from './locales';
import { fallbackChain, isOffered, type Project, stageOf } from './project';
import type { Locale, Messages } from './registry';
import type { Catalog, LocaleSet } from './types';

export interface DefineI18nConfig extends Pick<
  I18nConfig<Record<string, Catalog>>,
  'plural' | 'lazy' | 'deferred'
> {
  /** Each language's name for itself, by code, where the catalogs that say it
   *  do not ship up front. It is what makes a language exist before a single
   *  message is fetched. Left out, the name is read from `catalogs`. */
  names?: Readonly<Record<string, string>>;
  /** One catalog per locale, keyed by code, holding what ships up front. Each
   *  names its own language under `lang.<code>`, which is what the locale set
   *  reads before any other message is needed. */
  catalogs: Readonly<Record<string, Catalog>>;
  /** The policy file beside the locale folders, `i18n.json`. */
  project: Project;
}

type AppI18n = I18n<Locale, Messages>;

export interface DefinedI18n extends LocaleSet<Locale> {
  readonly i18n: AppI18n;
  readonly translate: AppI18n['translate'];
  readonly translator: AppI18n['translator'];
  readonly addCatalogs: AppI18n['add'];
}

function endonyms(
  { catalogs, names }: Pick<DefineI18nConfig, 'catalogs' | 'names'>,
  codes: readonly string[],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const code of codes) {
    out[code] = names?.[code] ?? catalogs[code]?.[labelKey(code)] ?? code;
  }
  return out;
}

/**
 * The app's one instance, typed by the registry rather than by what is passed
 * in: with catalogs discovered from a folder, the values say `string` and the
 * `@kromatv/i18n/vite` plugin's declaration says which locales and keys exist.
 *
 * ```ts
 * export const { i18n, translate, LOCALES, DEFAULT_LOCALE } = defineI18n({
 *   catalogs, lazy, project,
 * });
 * ```
 *
 * Every folder is a locale the engine can render, which is what a dev tool
 * switches between. The locale set is narrower: `LOCALES`, `isLocale`,
 * `normalizeLocale` and `detectLocale` only know the languages past `draft`,
 * so a reader is never offered, nor handed by their browser, a language nobody
 * decided to ship. A locale reads in its fallbacks where it has no
 * translation, in the order `fallbackChain` gives.
 *
 * The instance also takes every catalog file a chunk announces on import (see
 * `announceCatalogs`), so a screen's messages are on their way before it
 * renders and `useT` can wait for them.
 *
 * There is no separate table of language names: a catalog names its own
 * language under `lang.<code>` (`"lang.fr": "Français"` in `fr/lang.json`),
 * which is the entry the picker renders anyway, so writing it twice is how the
 * two drift apart.
 */
export function defineI18n(config: DefineI18nConfig): DefinedI18n {
  const { catalogs, project, lazy, plural, deferred, names } = config;
  const every = new Set([
    ...Object.keys(catalogs),
    ...Object.keys(deferred ?? {}),
    ...Object.keys(names ?? {}),
  ]);
  const exists = (locale: string) => every.has(locale);
  const offered = [...every].filter((code) => isOffered(project, code));
  const beta = offered.filter((code) => stageOf(project, code) === 'beta');
  const chains = new Map<string, readonly string[]>();
  const chain = (locale: string) => {
    let known = chains.get(locale);
    if (!known) {
      known = fallbackChain(project, locale, exists);
      chains.set(locale, known);
    }
    return known;
  };
  // The casts are the same claim: the registry types are what the plugin
  // declared from the folder, and these values are what the folder holds. The
  // project's catalog check keeps the two equal; nothing here can.
  const set = createLocales(endonyms(config, offered), project.source, beta) as LocaleSet<Locale>;
  const i18n = createI18n({
    catalogs,
    defaultLocale: project.source,
    lazy,
    plural,
    deferred,
    locales: [...every],
    chain,
    whole: (locale) => stageOf(project, locale) === 'stable',
  }) as unknown as AppI18n;
  drainAnnouncements(({ file, catalogs: announced, complete }) =>
    i18n.register(file, announced, complete),
  );
  return {
    ...set,
    i18n,
    translate: i18n.translate,
    translator: i18n.translator,
    addCatalogs: i18n.add,
  };
}
