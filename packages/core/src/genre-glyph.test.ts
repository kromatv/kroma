import { describe, expect, it } from 'vitest';
import { genreGlyph } from './genre-glyph';

const TMDB_GENRES: readonly (readonly [string, string])[] = [
  ['Action', 'Action'],
  ['Action & Adventure', 'Action & Adventure'],
  ['Adventure', 'Aventure'],
  ['Animation', 'Animation'],
  ['Comedy', 'Comédie'],
  ['Crime', 'Crime'],
  ['Documentary', 'Documentaire'],
  ['Drama', 'Drame'],
  ['Family', 'Familial'],
  ['Fantasy', 'Fantastique'],
  ['History', 'Histoire'],
  ['Horror', 'Horreur'],
  ['Kids', 'Kids'],
  ['Music', 'Musique'],
  ['Mystery', 'Mystère'],
  ['News', 'News'],
  ['Reality', 'Reality'],
  ['Romance', 'Romance'],
  ['Sci-Fi & Fantasy', 'Science-Fiction & Fantastique'],
  ['Science Fiction', 'Science-Fiction'],
  ['Soap', 'Soap'],
  ['Talk', 'Talk'],
  ['Thriller', 'Thriller'],
  ['TV Movie', 'Téléfilm'],
  ['War', 'Guerre'],
  ['War & Politics', 'War & Politics'],
  ['Western', 'Western'],
];

describe('genreGlyph', () => {
  it('serves every genre TMDB publishes, in either language', () => {
    const bare = TMDB_GENRES.flat().filter((name) => genreGlyph(name) === undefined);

    expect(bare).toEqual([]);
  });

  it('gives both localizations of a genre the same glyph', () => {
    expect(genreGlyph('Horror')).toBe('ghost');
    expect(genreGlyph('Horreur')).toBe('ghost');
  });

  it('matches through case, spacing and punctuation', () => {
    expect(genreGlyph('  SCIENCE fiction ')).toBe('ufo');
    expect(genreGlyph('Science-Fiction')).toBe('ufo');
  });

  it('matches a genre spelled without its accents', () => {
    expect(genreGlyph('telefilm')).toBe('device-tv-old');
  });

  it('gives a compound genre its own glyph, not the one it starts with', () => {
    expect(genreGlyph('War')).toBe('tank');
    expect(genreGlyph('War & Politics')).toBe('building-bank');
  });

  it('has no glyph for a genre outside the TMDB set', () => {
    expect(genreGlyph('K-Drama')).toBeUndefined();
    expect(genreGlyph('')).toBeUndefined();
  });
});
