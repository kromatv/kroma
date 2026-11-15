import type { MediaCard, Show } from '@kromatv/client/media';

/** A home spotlight or rail entry: a server section's movie or show, or a
 * catalogue card standing in for one. Every `SectionItem` is one. */
export type HomeEntry = { type: 'movie'; item: MediaCard } | { type: 'show'; show: Show };

export const entryId = (e: HomeEntry): string => (e.type === 'show' ? e.show.id : e.item.id);
export const entryMetadata = (e: HomeEntry) =>
  e.type === 'show' ? e.show.metadata : e.item.metadata;
