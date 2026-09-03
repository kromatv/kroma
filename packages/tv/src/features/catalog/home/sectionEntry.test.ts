import type { MediaItem, SectionItem, Show } from '@kroma/client/media';
import { describe, expect, it } from 'vitest';
import { entryId, entryMetadata } from './sectionEntry';

const METADATA = { tmdbId: 1, overview: 'a' } as unknown as MediaItem['metadata'];

const movie: SectionItem = {
  type: 'movie',
  item: { id: 'it_1', metadata: METADATA } as MediaItem,
};
const show: SectionItem = {
  type: 'show',
  show: { id: 'sh_1', metadata: METADATA } as Show,
};

describe('a recommendation row entry, which is a movie or a show', () => {
  it('reads the id off the item when the row mixed in a film', () => {
    expect(entryId(movie)).toBe('it_1');
  });

  it('reads the id off the show when the row mixed in a series', () => {
    expect(entryId(show)).toBe('sh_1');
  });

  it('reaches the artwork through whichever half the entry carries', () => {
    expect(entryMetadata(movie)).toBe(METADATA);
    expect(entryMetadata(show)).toBe(METADATA);
  });
});
