import type { StoreCatalog, StoreModule } from '@kromatv/client/modules';

/** The cache key of the catalog the offers are read from. */
export const OFFERS_QUERY = ['setup', 'modules'] as const;

/** One module the setup offers. */
export interface Offer {
  module: StoreModule;
  /** The modules it cannot run without and the server does not hold yet. */
  needs: StoreModule[];
  /** Whether the server holds the module already. */
  installed: boolean;
}

function needsOf(module: StoreModule, catalog: StoreCatalog): StoreModule[] {
  const byId = new Map(catalog.modules.map((entry) => [String(entry.id), entry]));
  const found = new Map<string, StoreModule>();
  const queue = Object.keys(module.dependencies);
  for (const id of queue) {
    const entry = byId.get(id);
    if (entry && !entry.installedVersion && !found.has(id)) {
      found.set(id, entry);
      queue.push(...Object.keys(entry.dependencies));
    }
  }
  found.delete(String(module.id));
  return [...found.values()];
}

/** The modules the setup offers: the ones the official registry lists for it,
 * in its order. One the server holds already stays in the list, as installed. */
export function offers(catalog: StoreCatalog): Offer[] {
  const byId = new Map(catalog.modules.map((entry) => [String(entry.id), entry]));
  return catalog.setup.flatMap((id) => {
    const module = byId.get(String(id));
    if (!module) {
      return [];
    }
    return [
      { module, needs: needsOf(module, catalog), installed: Boolean(module.installedVersion) },
    ];
  });
}

/** What the picked offers download, in bytes: each module once, with what it
 * needs. */
export function pickedBytes(all: readonly Offer[], picked: readonly string[]): number {
  const sizes = new Map<string, number>();
  for (const offer of all.filter((candidate) => picked.includes(String(candidate.module.id)))) {
    for (const module of [offer.module, ...offer.needs]) {
      sizes.set(String(module.id), module.size ?? 0);
    }
  }
  return [...sizes.values()].reduce((sum, size) => sum + size, 0);
}

export type OfferState = 'installed' | 'leaving' | 'installing' | 'picked' | 'open';

/** What the owner chose so far, as the offers read it. */
export interface OfferChoices {
  picked: readonly string[];
  dropped: readonly string[];
  started: readonly string[];
}

/** Where an offer stands: on the server, on the server and deselected, on its
 * way there, selected, or none of these. */
export function offerState(offer: Offer, picks: OfferChoices): OfferState {
  const id = String(offer.module.id);
  if (offer.installed) {
    return picks.dropped.includes(id) ? 'leaving' : 'installed';
  }
  if (picks.started.includes(id)) {
    return 'installing';
  }
  return picks.picked.includes(id) ? 'picked' : 'open';
}
