import type { Catalog } from './types';

/** One locale's catalog, or a loader that fetches it when the locale is wanted. */
export type CatalogOrLoader = Catalog | (() => Promise<Catalog>);

/** One catalog file's catalogs by locale, as the module that carries them
 *  hands them over. */
export type NamespaceCatalogs = Readonly<Record<string, CatalogOrLoader>>;

export interface Announced {
  /** `nav`, or `admin/users` for a file a namespace is split into. */
  readonly file: string;
  readonly catalogs: NamespaceCatalogs;
  /** The locales whose catalog answers every message of the file. */
  readonly complete?: readonly string[];
}

// A queue at module scope, on purpose: the chunk that carries a catalog
// announces it the moment it evaluates, and this is the one module both it and
// the engine can import without either waiting on the other. The engine drains
// what arrived before it and takes every announcement after.
const queue: Announced[] = [];
let sink: ((announced: Announced) => void) | null = null;

/** Hand a catalog file to whichever engine drains the queue, now or later.
 *  Called by the module `@kromatv/i18n/vite` generates per file. */
export function announceCatalogs(
  file: string,
  catalogs: NamespaceCatalogs,
  complete?: readonly string[],
): void {
  const announced = { file, catalogs, complete };
  if (sink) sink(announced);
  else queue.push(announced);
}

/** Take every announcement made so far, and every one to come. */
export function drainAnnouncements(next: (announced: Announced) => void): void {
  sink = next;
  for (const announced of queue.splice(0)) {
    next(announced);
  }
}
