import type { StoreCatalog, StoreModule } from '@kromatv/client/modules';

/** The cache key of the catalog the offers are read from. */
export const OFFERS_QUERY = ['setup', 'modules'] as const;

/** The points the core calls. A module that answers one is offered by what
 * that point does for the owner. */
export const OFFER_KINDS = [
  'acquisition',
  'network',
  'transcriber',
  'embedder',
  'trailer',
] as const;

export type OfferKind = (typeof OFFER_KINDS)[number];

export const OFFER_GROUPS = ['library', 'watching', 'more'] as const;

export type OfferGroup = (typeof OFFER_GROUPS)[number];

const GROUP_OF: Record<OfferKind, OfferGroup> = {
  acquisition: 'library',
  network: 'library',
  transcriber: 'watching',
  embedder: 'watching',
  trailer: 'watching',
};

/** One module the setup offers. */
export interface Offer {
  module: StoreModule;
  /** The core point the module answers, or none. */
  kind: OfferKind | null;
  /** The modules it cannot run without and the server does not hold yet. */
  needs: StoreModule[];
  /** Whether the server holds the module already. */
  installed: boolean;
}

function extendsAnotherModule(module: StoreModule): boolean {
  const points = module.contributes.map((answer) => answer.point);
  return points.length > 0 && points.every((point) => point.includes('/'));
}

function offerKind(module: StoreModule): OfferKind | null {
  const points = new Set(module.contributes.map((answer) => answer.point));
  return OFFER_KINDS.find((kind) => points.has(kind)) ?? null;
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

/** The modules the setup may offer: from an official registry and of use
 * alone. A shared library and a module that only extends another one are left
 * to the Store. One the server holds already stays in the list, as installed. */
export function offers(catalog: StoreCatalog): Offer[] {
  const official = new Set(
    catalog.registries.filter((registry) => registry.official).map((registry) => registry.name),
  );
  return catalog.modules
    .filter(
      (module) => official.has(module.source) && !module.library && !extendsAnotherModule(module),
    )
    .map((module) => ({
      module,
      kind: offerKind(module),
      needs: needsOf(module, catalog),
      installed: Boolean(module.installedVersion),
    }));
}

/** The offers under the heading each one belongs to, and no empty heading. */
export function groupedOffers(all: readonly Offer[]): { group: OfferGroup; offers: Offer[] }[] {
  return OFFER_GROUPS.map((group) => ({
    group,
    offers: all.filter((offer) => (offer.kind ? GROUP_OF[offer.kind] : 'more') === group),
  })).filter((section) => section.offers.length > 0);
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
