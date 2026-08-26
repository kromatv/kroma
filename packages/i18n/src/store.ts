import type { Chain } from './chain';
import { expandRefs } from './nest';
import type { Catalog, Catalogs } from './types';

/** `$schema` points an editor at the catalog schema; it is not a message. */
export const SCHEMA_KEY = '$schema' as const;

function withoutSchema(catalogs: Record<string, Catalog | undefined>): Record<string, Catalog> {
  const out: Record<string, Catalog> = {};
  for (const [locale, catalog] of Object.entries(catalogs)) {
    if (!catalog) continue;
    if (catalog[SCHEMA_KEY] === undefined) {
      out[locale] = catalog;
      continue;
    }
    const { [SCHEMA_KEY]: _pointer, ...rest } = catalog;
    out[locale] = rest;
  }
  return out;
}

/** The catalogs an instance can currently reach: the ones it was built with,
 *  plus whatever has been added since.
 *
 *  Added catalogs are scoped and layered rather than merged, because a module
 *  loaded at runtime cannot be trusted not to reuse a key the app already
 *  spells differently. A scope's own messages win for that scope and are
 *  invisible everywhere else. */
export class CatalogStore<L extends string> {
  private readonly base: Record<string, Catalog>;
  private readonly scopes = new Map<string, Record<string, Catalog>>();
  private readonly chains = new Map<string, Chain>();
  private readonly listeners = new Set<() => void>();
  private revision = 0;

  constructor(
    catalogs: Catalogs<L>,
    readonly defaultLocale: L,
  ) {
    this.base = expandRefs(withoutSchema(catalogs as Record<string, Catalog>), defaultLocale);
  }

  /** The catalogs a lookup walks, most specific first.
   *
   *  Cached, because this is asked once per rendered string: the answer only
   *  changes when a scope is added or removed, and building a fresh array per
   *  translation is a measurable share of the cheapest path. */
  chain(locale: string, scope?: string): Chain {
    const key = scope === undefined ? locale : `${locale}\u0000${scope}`;
    let chain = this.chains.get(key);
    if (!chain) {
      const own = scope ? this.scopes.get(scope) : undefined;
      const codes = locale === this.defaultLocale ? [locale] : [locale, this.defaultLocale];
      chain = [own, this.base]
        .flatMap((source) => codes.map((code) => source?.[code]))
        .filter((catalog): catalog is Catalog => catalog !== undefined);
      this.chains.set(key, chain);
    }
    return chain;
  }

  /** Whether the base catalogs declare `key`, which is what "is this a message
   *  key rather than a literal" means for stored data written before a payload
   *  carried its own kind. */
  has(key: string): boolean {
    return this.base[this.defaultLocale]?.[key] !== undefined;
  }

  /** Add a scope's catalogs, returning a disposer that removes them again.
   *  Adding the same scope twice replaces it, so a module that reloads does not
   *  leave its previous messages behind. */
  add(scope: string, catalogs: Catalogs<string>): () => void {
    const own = expandRefs(withoutSchema(catalogs as Record<string, Catalog>), this.defaultLocale);
    this.scopes.set(scope, own);
    this.changed();
    return () => {
      if (this.scopes.get(scope) !== own) return;
      this.scopes.delete(scope);
      this.changed();
    };
  }

  /** Bumped whenever a scope is added or removed, so a UI can hold it as a
   *  snapshot and re-render when a late-arriving catalog lands. */
  version(): number {
    return this.revision;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private changed(): void {
    this.chains.clear();
    this.revision += 1;
    for (const listener of this.listeners) listener();
  }
}
