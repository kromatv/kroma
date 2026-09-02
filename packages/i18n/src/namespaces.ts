import type { CatalogOrLoader, NamespaceCatalogs } from './announce';
import { namespaceOf } from './layout';
import type { Catalog } from './types';

interface Entry {
  readonly sources: Map<string, CatalogOrLoader>;
  readonly loaded: Set<string>;
  readonly loading: Map<string, Promise<void>>;
  readonly failed: Set<string>;
  needed: boolean;
}

/** Where a landed catalog goes, and how a view hears that a locale is whole. */
export interface CatalogSink {
  extend(locale: string, catalog: Catalog): void;
  changed(): void;
}

/**
 * Which namespaces exist, where each locale's catalog comes from, and which of
 * them have landed. A namespace a chunk announced is `needed`: its catalog for
 * every warmed locale is fetched at once. One only the folder glob offered is
 * fetched when a key of it misses. A view is told once per locale, when the
 * last fetch in flight for it lands, rather than once per namespace.
 */
export class Namespaces {
  private readonly entries = new Map<string, Entry>();
  private readonly warmed = new Set<string>();
  private readonly inFlight = new Map<string, Set<Promise<void>>>();
  private readonly pendingByLocale = new Map<string, Promise<void>>();

  constructor(
    private readonly sink: CatalogSink,
    shipped: Readonly<Record<string, Catalog>>,
  ) {
    for (const [locale, catalog] of Object.entries(shipped)) {
      for (const key of Object.keys(catalog)) this.settle(namespaceOf(key), locale);
    }
  }

  announce(namespace: string, catalogs: NamespaceCatalogs, needed: boolean): void {
    const entry = this.entry(namespace);
    let landed = false;
    for (const [locale, source] of Object.entries(catalogs)) {
      if (typeof source === 'function') {
        if (!entry.loaded.has(locale)) entry.sources.set(locale, source);
        continue;
      }
      this.sink.extend(locale, source);
      this.settle(namespace, locale);
      landed = true;
    }
    if (landed) this.sink.changed();
    entry.needed ||= needed;
    if (entry.needed) for (const locale of this.warmed) this.ensure(namespace, locale);
  }

  /** From now on, fetch every needed namespace's catalog for `locale`. */
  warm(locale: string): void {
    if (this.warmed.has(locale)) return;
    this.warmed.add(locale);
    for (const [namespace, entry] of this.entries) {
      if (entry.needed) this.ensure(namespace, locale);
    }
  }

  /** Everything in flight for `locale`, as one promise a component can suspend
   *  on, or `null` when nothing is. The same promise is handed back until it
   *  settles, which is what `use()` needs to resume. */
  pending(locale: string): Promise<void> | null {
    const flying = this.inFlight.get(locale);
    if (!flying?.size) return null;
    const held = this.pendingByLocale.get(locale);
    if (held) return held;
    const forget = () => {
      if (this.pendingByLocale.get(locale) === all) this.pendingByLocale.delete(locale);
    };
    const all: Promise<void> = Promise.all(flying).then(forget, forget);
    this.pendingByLocale.set(locale, all);
    return all;
  }

  /** A key nothing answered in `locale`: fetch its namespace for that locale,
   *  unless a fetch already failed. */
  missed(key: string, locale: string): void {
    const namespace = namespaceOf(key);
    const entry = this.entries.get(namespace);
    if (!entry || entry.failed.has(locale)) return;
    this.ensure(namespace, locale)?.catch(() => undefined);
  }

  private ensure(namespace: string, locale: string): Promise<void> | null {
    const entry = this.entry(namespace);
    if (entry.loaded.has(locale)) return null;
    const started = entry.loading.get(locale);
    if (started) return started;
    const source = entry.sources.get(locale);
    if (typeof source !== 'function') return null;
    entry.failed.delete(locale);
    const flight: Promise<void> = source().then(
      (catalog) => {
        this.sink.extend(locale, catalog);
        this.settle(namespace, locale);
        this.landed(locale, flight);
      },
      (error: unknown) => {
        entry.failed.add(locale);
        entry.loading.delete(locale);
        this.landed(locale, flight);
        throw error;
      },
    );
    entry.loading.set(locale, flight);
    this.flying(locale).add(flight);
    return flight;
  }

  private landed(locale: string, flight: Promise<void>): void {
    const flying = this.flying(locale);
    flying.delete(flight);
    if (flying.size === 0) this.sink.changed();
  }

  private flying(locale: string): Set<Promise<void>> {
    let flying = this.inFlight.get(locale);
    if (!flying) {
      flying = new Set();
      this.inFlight.set(locale, flying);
    }
    return flying;
  }

  private settle(namespace: string, locale: string): void {
    const entry = this.entry(namespace);
    entry.loaded.add(locale);
    entry.loading.delete(locale);
    entry.sources.delete(locale);
    entry.failed.delete(locale);
  }

  private entry(namespace: string): Entry {
    let entry = this.entries.get(namespace);
    if (!entry) {
      entry = {
        sources: new Map(),
        loaded: new Set(),
        loading: new Map(),
        failed: new Set(),
        needed: false,
      };
      this.entries.set(namespace, entry);
    }
    return entry;
  }
}
