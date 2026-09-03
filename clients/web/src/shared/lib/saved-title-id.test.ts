import { describe, expect, it } from 'vitest';
import { savedTitleId } from './saved-title-id';

describe('the id a title is saved under', () => {
  it('uses the library id once the title has one', () => {
    expect(savedTitleId('movie', 'i1', 603)).toBe('i1');
  });

  it('falls back to the TMDB id, prefixed, before the title is in the library', () => {
    expect(savedTitleId('show', null, 1399)).toBe('tmdb:1399');
  });

  it('answers null for a title with neither id', () => {
    expect(savedTitleId('movie', null, null)).toBeNull();
    expect(savedTitleId('movie', undefined, null)).toBeNull();
  });

  it('brands a show and a movie apart, so one list membership is not the other', () => {
    expect(savedTitleId('show', 's1', null)).toBe('s1');
    expect(savedTitleId('movie', 'i1', null)).toBe('i1');
  });
});
