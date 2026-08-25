import { GENRE_GLYPHS } from '@kroma/core';
import { hasGlyph } from '@kroma/ui/kit';
import { describe, expect, it } from 'vitest';
import { genreIcon } from './genre-icon';

describe('genreIcon', () => {
  it('names a glyph the kit can draw for every genre in the table', () => {
    const unknown = Object.entries(GENRE_GLYPHS).filter(([, glyph]) => !hasGlyph(glyph));

    expect(unknown).toEqual([]);
  });

  it('resolves a genre name to its kit icon', () => {
    expect(genreIcon('Science-Fiction')).toBe('ufo');
  });

  it('has no icon for a genre the table does not serve', () => {
    expect(genreIcon('K-Drama')).toBeUndefined();
  });
});
