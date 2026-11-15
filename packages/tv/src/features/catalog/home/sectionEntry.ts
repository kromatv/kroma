import type { KromaClient } from '@kromatv/client';
import type { MediaCard, Show } from '@kromatv/client/media';

/** A home spotlight or rail entry: a server section's movie or show, or a
 * catalogue card standing in for one. Every `SectionItem` is one. */
export type HomeEntry = { type: 'movie'; item: MediaCard } | { type: 'show'; show: Show };

export const entryId = (e: HomeEntry): string => (e.type === 'show' ? e.show.id : e.item.id);
export const entryTitle = (e: HomeEntry): string =>
  e.type === 'show' ? e.show.title : e.item.title;
export const entryMetadata = (e: HomeEntry) =>
  e.type === 'show' ? e.show.metadata : e.item.metadata;

/** Landscape art for an entry, falling back to its poster so a tile is never
 * left on its tint. */
export function entryBackdrop(e: HomeEntry, client: KromaClient, width: number): string {
  const art = client.media.artwork;
  return e.type === 'show'
    ? (art.backdropFor(e.show, width) ?? art.showPosterFor(e.show, width))
    : (art.backdropFor(e.item, width) ?? art.posterFor(e.item, width));
}

export function entryPortrait(e: HomeEntry, client: KromaClient, width: number): string {
  const art = client.media.artwork;
  return e.type === 'show' ? art.showPosterFor(e.show, width) : art.posterFor(e.item, width);
}
