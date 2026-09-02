import type { Catalog } from './types';

/** One locale's catalog, or a loader that fetches it when the locale is wanted. */
export type CatalogOrLoader = Catalog | (() => Promise<Catalog>);

/** A namespace's catalogs by locale, as the module that carries them hands
 *  them over. */
export type NamespaceCatalogs = Readonly<Record<string, CatalogOrLoader>>;

export interface Announced {
  readonly namespace: string;
  readonly catalogs: NamespaceCatalogs;
}

// A queue at module scope, on purpose: the chunk that carries a namespace
// announces it the moment it evaluates, and this is the one module both it and
// the engine can import without either waiting on the other. The engine drains
// what arrived before it and takes every announcement after.
const queue: Announced[] = [];
let sink: ((announced: Announced) => void) | null = null;

/** Hand a namespace to whichever engine drains the queue, now or later. Called
 *  by the module `@kroma/i18n/vite` generates per namespace. */
export function announceCatalogs(namespace: string, catalogs: NamespaceCatalogs): void {
  const announced = { namespace, catalogs };
  if (sink) sink(announced);
  else queue.push(announced);
}

/** Take every announcement made so far, and every one to come. */
export function drainAnnouncements(next: (announced: Announced) => void): void {
  sink = next;
  for (const announced of queue.splice(0)) next(announced);
}
