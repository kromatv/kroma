import type { SectionItem } from '@kroma/core';

// A recommendation row entry is a movie *or* a show (the server mixes them).
export const entryId = (e: SectionItem): string => (e.type === 'show' ? e.show.id : e.item.id);
export const entryMetadata = (e: SectionItem) =>
  e.type === 'show' ? e.show.metadata : e.item.metadata;
