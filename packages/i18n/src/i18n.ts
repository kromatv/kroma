import type { NamespaceCatalogs } from './announce';
import { resolveInChain, translateChain } from './chain';
import { activeKeyInspector, onOverridesChange, overridesRevision } from './dev-overrides';
import { Namespaces } from './namespaces';
import { CatalogStore, type SCHEMA_KEY } from './store';
import type { Catalog, Catalogs, PluralRule, TVars } from './types';
import type { Templated, VarsOf } from './vars';

/** A catalog's messages: everything but the `$schema` pointer. Distinct from
 *  `Messages` in ./registry, which is the augmented map for the whole app. */
export type CatalogMessages<C> = Omit<C, typeof SCHEMA_KEY>;

/** Catalog files offered for fetching: by file, then by locale. A file is a
 *  namespace (`nav`) or one of the files it is split into (`admin/users`). */
export type LazyCatalogs = Readonly<Record<string, NamespaceCatalogs>>;

/** A translator bound to one scope: the scope's own keys are not knowable from
 *  here, so any string is accepted while the base keys still autocomplete. */
export type ScopedTranslate<K extends string> = (key: K | (string & {}), vars?: TVars) => string;

/**
 * A translator bound to one locale. A key written out is checked against the
 * variables its message takes; see {@link VarsOf}. A key built from a template
 * is checked against the messages it could name; see {@link Templated}.
 */
export interface BoundTranslate<M> {
  <S extends string>(key: Templated<keyof M & string, S>, vars?: TVars): string;
  <K extends keyof M & string>(key: K, ...vars: VarsOf<M, K>): string;
}

/**
 * `M` maps each message key to what it takes. A catalog handed to
 * {@link createI18n} maps keys to templates, which says nothing about
 * variables, so any are accepted; the registry the Vite plugin declares maps
 * each key to its variables, and those are checked.
 */
export interface I18n<L extends string, M> {
  readonly defaultLocale: L;
  /** Every locale the base catalogs answer in, the default one first. */
  locales(): readonly L[];
  /** Render one message. Unknown keys render as the key itself, which is a
   *  visible placeholder rather than an empty hole. */
  translate<K extends keyof M & string>(locale: L, key: K, ...vars: VarsOf<M, K>): string;
  /** A translator bound to a locale. Pass a scope to put that scope's added
   *  catalogs ahead of the base ones. */
  translator(locale: L): BoundTranslate<M>;
  translator(locale: L, scope: string): ScopedTranslate<keyof M & string>;
  /** Add a scope's catalogs at runtime, as a module being loaded would.
   *  Returns a disposer; adding the same scope again replaces it. */
  add(scope: string, catalogs: Catalogs<string>): () => void;
  /** A catalog file the running code needs, as the chunk carrying it says on
   *  evaluation: a catalog given outright lands now, a loader is fetched for
   *  every warmed locale. `complete` names the locales that answer every
   *  message of it, which are fetched without their fallbacks. */
  register(file: string, catalogs: NamespaceCatalogs, complete?: readonly string[]): void;
  /** Fetch every needed namespace in `locale`, now and as more are registered.
   *  The provider calls it for the locale it renders. */
  warm(locale: L): void;
  /** What is still being fetched for `locale`, to suspend on; `null` when
   *  everything needed has landed. */
  pending(locale: L): Promise<void> | null;
  /** What a view suspends on for `locale`, never null: what {@link pending}
   *  returns, or an already-settled promise `use()` reads without suspending. */
  ready(locale: L): Promise<void>;
  /** A snapshot that changes whenever a scope is added or removed, or a
   *  locale's fetches have all landed. */
  version(): number;
  subscribe(listener: () => void): () => void;
}

/** An instance whatever it is typed with: what a provider or a dev tool needs
 *  of one it only passes along. Every {@link I18n} is one. */
export interface AnyI18n {
  readonly defaultLocale: string;
  locales(): readonly string[];
  translator(locale: string, scope?: string): (key: string, vars?: TVars) => string;
  add(scope: string, catalogs: Catalogs<string>): () => void;
  register(file: string, catalogs: NamespaceCatalogs, complete?: readonly string[]): void;
  warm(locale: string): void;
  pending(locale: string): Promise<void> | null;
  ready(locale: string): Promise<void>;
  version(): number;
  subscribe(listener: () => void): () => void;
}

export interface I18nConfig<C extends Record<string, Record<string, string>>> {
  catalogs: C;
  defaultLocale: keyof C & string;
  /** Override plural category selection. Only needed where `Intl.PluralRules`
   *  is absent or disagrees with a peer implementation you have to match. */
  plural?: PluralRule;
  /** Catalog files not shipped in `catalogs`, fetched per locale when a key
   *  of their namespace misses. */
  lazy?: LazyCatalogs;
  /** Catalogs that are in the bundle and are read only when their locale is
   *  first rendered: a native bundle carries every language, and a reader
   *  uses one or two. A function per locale, called once, synchronously. */
  deferred?: Readonly<Record<string, () => Catalog>>;
  /** Locales the instance renders beyond the ones `catalogs` and `deferred`
   *  name: those whose catalogs are all fetched on demand. */
  locales?: readonly string[];
  /** The locales a message is looked up in when `locale` renders, itself
   *  first. Left out, a locale falls back to the default one, and nothing is
   *  fetched for a locale but its own catalogs. */
  chain?: (locale: string) => readonly string[];
  /** Whether `locale` is held complete, so its fallbacks are never fetched.
   *  Read only with `chain`. */
  whole?: (locale: string) => boolean;
}

/**
 * Build a translator from JSON catalogs.
 *
 * `$t(key)` references inside the catalogs are expanded here, once, so
 * translating stays a single interpolation pass. The message-key type comes
 * from the default locale's catalog, which is therefore the one that has to be
 * complete: every other locale falls back to it.
 */
export function createI18n<
  const C extends Record<string, Record<string, string>>,
  const D extends keyof C & string,
>(config: I18nConfig<C> & { defaultLocale: D }): I18n<keyof C & string, CatalogMessages<C[D]>> {
  type L = keyof C & string;
  type K = keyof CatalogMessages<C[D]> & string;

  const { catalogs, defaultLocale, plural, lazy, chain, whole, deferred, locales } = config;
  const store = new CatalogStore<L>(
    catalogs as unknown as Catalogs<L>,
    defaultLocale as L,
    chain,
    deferred,
  );
  const namespaces = new Namespaces(
    {
      extend: (locale, catalog) => store.extend({ [locale]: catalog }),
      changed: () => store.changed(),
    },
    catalogs,
    chain && { chain, whole: whole ?? ((locale) => locale === defaultLocale) },
  );
  for (const [file, sources] of Object.entries(lazy ?? {})) {
    namespaces.announce(file, sources, false);
  }
  const missed = (locale: string, key: string): string => {
    namespaces.missed(key, locale);
    return key;
  };

  type Bound = (key: K | (string & {}), vars?: TVars) => string;

  // One translator per locale and scope, until a dev switch moves or a message
  // is rewritten under a dev server. The closure reads the chain
  // on every call rather than capturing it, so an added catalog still reaches
  // it. Identity matters: a React hook hands this straight to callers who put
  // it in a `useMemo` dependency list, and a fresh closure per render would
  // quietly defeat all of them.
  const bound = new Map<string, Bound>();
  const identity = () => overridesRevision() + store.rewrites();
  let revision = identity();

  const translator = (locale: L, scope?: string) => {
    const current = identity();
    if (current !== revision) {
      bound.clear();
      revision = current;
    }
    const cacheKey = scope === undefined ? locale : `${locale} ${scope}`;
    let fn = bound.get(cacheKey);
    if (!fn) {
      const inspector = activeKeyInspector();
      fn = inspector
        ? (key, vars) => {
            const { at, text } = resolveInChain(
              store.chain(locale, scope),
              locale,
              key,
              vars,
              plural,
            );
            const from = at === -1 ? undefined : store.sources(locale, scope)[at];
            return inspector({ key, from, locale, text: text ?? missed(locale, key), vars });
          }
        : (key, vars) =>
            translateChain(store.chain(locale, scope), locale, key, vars, plural) ??
            missed(locale, key);
      bound.set(cacheKey, fn);
    }
    return fn;
  };

  const codes = [
    ...new Set([
      defaultLocale as L,
      ...(Object.keys(catalogs) as L[]),
      ...(Object.keys(deferred ?? {}) as L[]),
      ...((locales ?? []) as L[]),
    ]),
  ];

  const instance: I18n<L, Record<string, string>> = {
    defaultLocale: defaultLocale as L,
    locales: () => codes,
    translate: (locale, key, vars?: TVars) => translator(locale)(key, vars),
    translator,
    add: (scope, added) => store.add(scope, added),
    register: (file, announced, complete) => namespaces.announce(file, announced, true, complete),
    warm: (locale) => namespaces.warm(locale),
    pending: (locale) => namespaces.pending(locale),
    ready: (locale) => namespaces.ready(locale),
    version: () => store.version() + overridesRevision(),
    subscribe: (listener) => {
      const stopStore = store.subscribe(listener);
      const stopInspector = onOverridesChange(listener);
      return () => {
        stopStore();
        stopInspector();
      };
    },
  };
  return instance as unknown as I18n<L, CatalogMessages<C[D]>>;
}
