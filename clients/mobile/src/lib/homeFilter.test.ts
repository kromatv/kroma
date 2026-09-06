import type { ContinueItem, MediaItem, SectionItem, Show } from '@kroma/client/media';
import { describe, expect, it } from 'vitest';
import { filterEntries, filterResume } from './homeFilter';

const movie = (id: string): SectionItem => ({ type: 'movie', item: { id } as MediaItem });
const show = (id: string): SectionItem => ({ type: 'show', show: { id } as Show });

const resume = (id: string, kind: MediaItem['kind']): ContinueItem =>
  ({ item: { id, kind } as MediaItem, positionMs: 0, durationMs: 0 }) as ContinueItem;

const ids = (entries: SectionItem[]) =>
  entries.map((entry) => (entry.type === 'movie' ? entry.item.id : entry.show.id));

describe('filterEntries', () => {
  it('keeps the movies of a mixed rail', () => {
    expect(ids(filterEntries([movie('a'), show('b'), movie('c')], 'movie'))).toEqual(['a', 'c']);
  });

  it('keeps the series of a mixed rail', () => {
    expect(ids(filterEntries([movie('a'), show('b')], 'show'))).toEqual(['b']);
  });

  it('hands the rail straight back when nothing is filtered', () => {
    const rail = [movie('a'), show('b')];

    expect(filterEntries(rail, null)).toBe(rail);
  });
});

describe('filterResume', () => {
  it('counts an episode toward its series and a movie toward movies', () => {
    const rail = [resume('a', 'movie'), resume('b', 'episode')];

    expect(filterResume(rail, 'movie').map((e) => e.item.id)).toEqual(['a']);
    expect(filterResume(rail, 'show').map((e) => e.item.id)).toEqual(['b']);
  });

  it('drops a loose video from either type filter', () => {
    const rail = [resume('a', 'video')];

    expect(filterResume(rail, 'movie')).toEqual([]);
    expect(filterResume(rail, 'show')).toEqual([]);
  });

  it('hands the rail straight back when nothing is filtered', () => {
    const rail = [resume('a', 'movie')];

    expect(filterResume(rail, null)).toBe(rail);
  });
});
