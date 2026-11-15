import type { Chain } from './chain';
import { expandRefs } from './nest';
import { forgetStems } from './plural';
import type { Catalog, CatalogSource, Catalogs } from './types';

/** `$schema` points an editor at the catalog schema; it is not a message. */
export const SCHEMA_KEY = '$schema' as const;

function lookupKey(locale: string, scope: string | undefined): string {
  return scope === undefined ? locale : `${locale}\0${scope}`;
}

function withoutSchema(catalogs: Record<string, Catalog | undefined>): Record<string, Catalog> {
  const out: Record<string, Catalog> = {};
  for (const [locale, catalog] of Object.entries(catalogs)) {
    if (!catalog) {
      continue;
    }
    if (catalog[SCHEMA_KEY] === undefined) {
      out[locale] = catalog;
      continue;
    }
    const { [SCHEMA_KEY]: _pointer, ...rest } = catalog;
    out[locale] = rest;
  }
  return out;
}

function rewrites(own: Catalog, incoming: Catalog): boolean {
  for (const key in incoming) {
    const held = own[key];
    if (held !== undefined && held !== incoming[key]) {
      return true;
    }
  }
  return false;
}

/** The catalogs an instance can currently reach: the ones it was built with,
 *  plus whatever has been added since.
 *
 *  Added catalogs are scoped and layered rather than merged, because a module
 *  loaded at runtime cannot be trusted not to reuse a key the app already
 *  spells differently. A scope's own messages win for that scope and are
 *  invisible everywhere else. */
export class CatalogStore<L extends string> {
  private readonly base: Record<string, Record<string, string>> = {};
  private readonly scopes = new Map<string, Record<string, Catalog>>();
  private readonly chains = new Map<string, Chain>();
  private readonly origins = new Map<string, readonly CatalogSource[]>();
  private readonly listeners = new Set<() => void>();
  private readonly waiting = new Map<string, () => Catalog>();
  private revision = 0;
  private rewritten = 0;

  constructor(
    catalogs: Catalogs<L>,
    readonly defaultLocale: L,
    private readonly chainOf: (locale: string) => readonly string[] = (locale) =>
      locale === defaultLocale ? [locale] : [locale, defaultLocale],
    deferred: Readonly<Record<string, () => Catalog>> = {},
  ) {
    for (const [locale, read] of Object.entries(deferred)) {
      this.waiting.set(locale, read);
    }
    const expanded = expandRefs(withoutSchema(catalogs as Record<string, Catalog>), defaultLocale);
    // Own copies, so a namespace landing later can be merged in place without
    // writing into the objects the caller handed over.
    for (const [locale, catalog] of Object.entries(expanded)) {
      this.base[locale] = { ...catalog };
    }
  }

  /** The catalogs a lookup walks, most specific first.
   *
   *  Cached, because this is asked once per rendered string: the answer only
   *  changes when a scope is added or removed, and building a fresh array per
   *  translation is a measurable share of the cheapest path. */
  chain(locale: string, scope?: string): Chain {
    const key = lookupKey(locale, scope);
    return this.chains.get(key) ?? this.build(key, locale, scope).chain;
  }

  /** Where each catalog of {@link chain} came from, at the same indices. Kept
   *  beside the chain rather than in it so that rendering a message never
   *  walks provenance it does not read. */
  sources(locale: string, scope?: string): readonly CatalogSource[] {
    const key = lookupKey(locale, scope);
    return this.origins.get(key) ?? this.build(key, locale, scope).sources;
  }

  // A catalog that is in the bundle but has not been read yet is read the
  // first time a chain reaches its locale, the default locale's before it
  // since a `$t()` reference may fall back there.
  private read(locale: string): void {
    const waiting = this.waiting.get(locale);
    if (!waiting) {
      return;
    }
    this.waiting.delete(locale);
    if (locale !== this.defaultLocale) {
      this.read(this.defaultLocale);
    }
    this.extend({ [locale]: waiting() });
  }

  private build(key: string, locale: string, scope: string | undefined) {
    const codes = this.chainOf(locale);
    for (const code of codes) {
      this.read(code);
    }
    const chain: Catalog[] = [];
    const sources: CatalogSource[] = [];
    const add = (from: string | null, source: Record<string, Catalog> | undefined) => {
      for (const code of codes) {
        const catalog = source?.[code];
        if (!catalog) {
          continue;
        }
        chain.push(catalog);
        sources.push({ scope: from, locale: code });
      }
    };
    if (scope) {
      add(scope, this.scopes.get(scope));
    }
    add(null, this.base);
    this.chains.set(key, chain);
    this.origins.set(key, sources);
    return { chain, sources };
  }

  /** Add a scope's catalogs, returning a disposer that removes them again.
   *  Adding the same scope twice replaces it, so a module that reloads does not
   *  leave its previous messages behind. */
  add(scope: string, catalogs: Catalogs<string>): () => void {
    const own = expandRefs(withoutSchema(catalogs as Record<string, Catalog>), this.defaultLocale);
    this.scopes.set(scope, own);
    this.changed();
    return () => {
      if (this.scopes.get(scope) !== own) {
        return;
      }
      this.scopes.delete(scope);
      this.changed();
    };
  }

  /** Merge catalogs into the base ones, as a namespace loaded on demand does:
   *  visible to every translator, scoped or not, and never removed. Quiet on
   *  purpose: the caller says when a view should re-read, so a locale whose
   *  namespaces land one by one is announced once. */
  extend(catalogs: Catalogs<string>): void {
    const part = expandRefs(
      withoutSchema(catalogs as Record<string, Catalog>),
      this.defaultLocale,
      this.base,
    );
    for (const [locale, catalog] of Object.entries(part)) {
      const own = this.base[locale] ?? {};
      if (rewrites(own, catalog)) {
        this.rewritten += 1;
      }
      Object.assign(own, catalog);
      forgetStems(own);
      this.base[locale] = own;
    }
    this.chains.clear();
    this.origins.clear();
  }

  /** How many times a message that already had a text was given another: a
   *  catalog saved under a dev server. A translator handed out before then
   *  still answers correctly, but a view that memoised on it will not ask
   *  again, so the instance hands out new ones when this moves. */
  rewrites(): number {
    return this.rewritten;
  }

  /** Bumped whenever a scope is added or removed or a locale's fetches have
   *  all landed, so a UI can hold it as a snapshot and re-render then. */
  version(): number {
    return this.revision;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  changed(): void {
    this.chains.clear();
    this.origins.clear();
    this.revision += 1;
    for (const listener of this.listeners) {
      listener();
    }
  }
}
