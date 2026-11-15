import type { CatalogOrLoader, NamespaceCatalogs } from './announce';
import { namespaceOf, namespaceOfFile } from './layout';
import type { Catalog } from './types';

const LANDED: Promise<void> = Object.assign(Promise.resolve(), {
  status: 'fulfilled' as const,
  value: undefined,
});

interface Entry {
  readonly sources: Map<string, CatalogOrLoader>;
  readonly loaded: Set<string>;
  readonly loading: Map<string, Promise<void>>;
  readonly failed: Set<string>;
  readonly complete: Set<string>;
  needed: boolean;
}

/** What a locale reads in, and which locales never need another's help. */
export interface Reach {
  /** The locales a message is looked up in when `locale` renders, itself
   *  first. */
  chain(locale: string): readonly string[];
  /** Whether `locale` is held complete in every file. */
  whole(locale: string): boolean;
}

const ALONE: Reach = { chain: (locale) => [locale], whole: () => true };

/** Where a landed catalog goes, and how a view hears that a locale is whole. */
export interface CatalogSink {
  extend(locale: string, catalog: Catalog): void;
  changed(): void;
}

/**
 * Which catalog files exist, where each locale's comes from, and which of them
 * have landed. A file is a file, or one of the files a file is split
 * into. One a chunk announced is `needed`: its catalog for every warmed locale
 * is fetched at once. One only the folder glob offered is fetched when a key
 * of its file misses. A view is told once per locale, when the last fetch
 * in flight for it lands, rather than once per file.
 *
 * A locale that is not complete in a file is fetched together with the
 * locales it falls back to, down to the first complete one, so an unfinished
 * translation reads in its fallback and never as a key.
 */
export class Namespaces {
  private readonly entries = new Map<string, Entry>();
  private readonly byNamespace = new Map<string, Set<string>>();
  private readonly shipped = new Map<string, Set<string>>();
  private readonly warmed = new Set<string>();
  private readonly inFlight = new Map<string, Set<Promise<void>>>();
  private readonly pendingByLocale = new Map<string, Promise<void>>();

  constructor(
    private readonly sink: CatalogSink,
    shipped: Readonly<Record<string, Catalog>>,
    private readonly reach: Reach = ALONE,
  ) {
    for (const [locale, catalog] of Object.entries(shipped)) {
      this.shipped.set(locale, new Set(Object.keys(catalog).map(namespaceOf)));
    }
  }

  /** `complete` names the locales whose catalog answers every message of the
   *  file, where the caller knows; a locale it leaves out is fetched with its
   *  fallbacks unless it is whole everywhere. */
  announce(
    file: string,
    catalogs: NamespaceCatalogs,
    needed: boolean,
    complete: readonly string[] = [],
  ): void {
    const entry = this.entry(file);
    for (const locale of complete) entry.complete.add(locale);
    let landed = false;
    for (const [locale, source] of Object.entries(catalogs)) {
      if (typeof source === 'function') {
        if (!entry.loaded.has(locale)) entry.sources.set(locale, source);
        continue;
      }
      this.sink.extend(locale, source);
      this.settle(file, locale);
      landed = true;
    }
    if (landed) this.sink.changed();
    entry.needed ||= needed;
    if (entry.needed) {
      for (const locale of this.warmed) this.want(file, locale);
    }
  }

  /** From now on, fetch every needed catalog for `locale`. */
  warm(locale: string): void {
    if (this.warmed.has(locale)) return;
    this.warmed.add(locale);
    for (const [file, entry] of this.entries) {
      if (entry.needed) this.want(file, locale);
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

  /** What a view suspends on for `locale`: the promise from {@link pending}
   *  while catalogs are on their way, otherwise one already marked fulfilled.
   *  React's `use()` reads a thenable whose `status` is `fulfilled` without
   *  suspending, so a view can call it on every render, as `use()` requires. */
  ready(locale: string): Promise<void> {
    return this.pending(locale) ?? LANDED;
  }

  /** A key nothing answered in `locale`: fetch every file of its file
   *  for that locale, leaving alone a catalog whose fetch already failed. */
  missed(key: string, locale: string): void {
    for (const file of this.byNamespace.get(namespaceOf(key)) ?? []) {
      this.want(file, locale, false);
    }
  }

  private want(file: string, rendered: string, retry = true): void {
    const entry = this.entry(file);
    for (const locale of this.reach.chain(rendered)) {
      if (retry || !entry.failed.has(locale)) {
        const flight = this.ensure(file, locale);
        if (flight) this.flying(rendered).add(flight);
      }
      if (entry.complete.has(locale) || this.reach.whole(locale)) return;
    }
  }

  private ensure(file: string, locale: string): Promise<void> | null {
    const entry = this.entry(file);
    if (entry.loaded.has(locale)) return null;
    if (this.shipped.get(locale)?.has(namespaceOfFile(file))) return null;
    const started = entry.loading.get(locale);
    if (started) return started;
    const source = entry.sources.get(locale);
    if (typeof source !== 'function') return null;
    entry.failed.delete(locale);
    const flight: Promise<void> = source().then(
      (catalog) => {
        this.sink.extend(locale, catalog);
        this.settle(file, locale);
        this.landed(flight);
      },
      () => {
        entry.failed.add(locale);
        entry.loading.delete(locale);
        this.landed(flight);
      },
    );
    entry.loading.set(locale, flight);
    return flight;
  }

  private landed(flight: Promise<void>): void {
    let whole = false;
    for (const flying of this.inFlight.values()) {
      if (flying.delete(flight) && flying.size === 0) whole = true;
    }
    if (whole) this.sink.changed();
  }

  private flying(locale: string): Set<Promise<void>> {
    let flying = this.inFlight.get(locale);
    if (!flying) {
      flying = new Set();
      this.inFlight.set(locale, flying);
    }
    return flying;
  }

  private settle(file: string, locale: string): void {
    const entry = this.entry(file);
    entry.loaded.add(locale);
    entry.loading.delete(locale);
    entry.sources.delete(locale);
    entry.failed.delete(locale);
  }

  private entry(file: string): Entry {
    let entry = this.entries.get(file);
    if (!entry) {
      entry = {
        sources: new Map(),
        loaded: new Set(),
        loading: new Map(),
        failed: new Set(),
        complete: new Set(),
        needed: false,
      };
      this.entries.set(file, entry);
      const files = this.byNamespace.get(namespaceOfFile(file)) ?? new Set();
      files.add(file);
      this.byNamespace.set(namespaceOfFile(file), files);
    }
    return entry;
  }
}
