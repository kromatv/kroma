import { translateChain } from './chain';
import { CatalogStore, type SCHEMA_KEY } from './store';
import type { Catalog, Catalogs, PluralRule, TVars } from './types';

/** A catalog's messages: everything but the `$schema` pointer. Distinct from
 *  `Messages` in ./registry, which is the augmented map for the whole app. */
export type CatalogMessages<C> = Omit<C, typeof SCHEMA_KEY>;

/** A translator bound to one scope: the scope's own keys are not knowable from
 *  here, so any string is accepted while the base keys still autocomplete. */
export type ScopedTranslate<K extends string> = (key: K | (string & {}), vars?: TVars) => string;

export interface I18n<L extends string, M extends Catalog> {
  readonly defaultLocale: L;
  /** Render one message. Unknown keys render as the key itself, which is a
   *  visible placeholder rather than an empty hole. */
  translate(locale: L, key: keyof M & string, vars?: TVars): string;
  /** A translator bound to a locale. Pass a scope to put that scope's added
   *  catalogs ahead of the base ones. */
  translator(locale: L): (key: keyof M & string, vars?: TVars) => string;
  translator(locale: L, scope: string): ScopedTranslate<keyof M & string>;
  /** Add a scope's catalogs at runtime, as a module being loaded would.
   *  Returns a disposer; adding the same scope again replaces it. */
  add(scope: string, catalogs: Catalogs<string>): () => void;
  /** Whether the base catalogs declare `key`. */
  has(key: string): boolean;
  /** A snapshot that changes whenever a scope is added or removed. */
  version(): number;
  subscribe(listener: () => void): () => void;
}

export interface I18nConfig<C extends Record<string, Record<string, string>>> {
  catalogs: C;
  defaultLocale: keyof C & string;
  /** Override plural category selection. Only needed where `Intl.PluralRules`
   *  is absent or disagrees with a peer implementation you have to match. */
  plural?: PluralRule;
}

/** What {@link Register} should be augmented with for a given instance:
 *
 *  ```ts
 *  declare module '@kroma/i18n' {
 *    interface Register extends InferRegister<typeof i18n> {}
 *  }
 *  ``` */
export type InferRegister<I> =
  I extends I18n<infer L, infer M> ? { locale: L; messages: M } : never;

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

  const { catalogs, defaultLocale, plural } = config;
  const store = new CatalogStore<L>(catalogs as unknown as Catalogs<L>, defaultLocale as L);

  const render = (locale: L, scope: string | undefined, key: string, vars?: TVars): string =>
    translateChain(store.chain(locale, scope), locale, key, vars, plural) ?? key;

  // One translator per locale and scope, forever. The closure reads the chain
  // on every call rather than capturing it, so an added catalog still reaches
  // it and the cache never needs clearing. Identity matters: a React hook hands
  // this straight to callers who put it in a `useMemo` dependency list, and a
  // fresh closure per render would quietly defeat all of them.
  const bound = new Map<string, (key: K | (string & {}), vars?: TVars) => string>();

  const translator = (locale: L, scope?: string) => {
    const cacheKey = scope === undefined ? locale : `${locale}\u0000${scope}`;
    let fn = bound.get(cacheKey);
    if (!fn) {
      fn = (key, vars) => render(locale, scope, key, vars);
      bound.set(cacheKey, fn);
    }
    return fn;
  };

  return {
    defaultLocale: defaultLocale as L,
    translate: (locale, key, vars) => render(locale, undefined, key, vars),
    translator,
    add: (scope, added) => store.add(scope, added),
    has: (key) => store.has(key),
    version: () => store.version(),
    subscribe: (listener) => store.subscribe(listener),
  } as I18n<L, CatalogMessages<C[D]>>;
}
