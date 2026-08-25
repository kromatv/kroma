/** Every genre TMDB can hand us, in both display languages, keyed by display
 * name. Look one up with `genreGlyph`, which folds the key before matching. */
export const GENRE_GLYPHS: Readonly<Record<string, string>> = {
  Action: 'karate',
  'Action & Adventure': 'run',
  Adventure: 'compass',
  Animation: 'palette',
  Aventure: 'compass',
  Comédie: 'joker',
  Comedy: 'joker',
  Crime: 'gavel',
  Documentaire: 'video',
  Documentary: 'video',
  Drama: 'masks-theater',
  Drame: 'masks-theater',
  Familial: 'friends',
  Family: 'friends',
  Fantastique: 'dragon',
  Fantasy: 'dragon',
  Guerre: 'tank',
  Histoire: 'building-monument',
  History: 'building-monument',
  Horreur: 'ghost',
  Horror: 'ghost',
  Kids: 'mood-kid',
  Music: 'music',
  Musique: 'music',
  Mystère: 'footsteps',
  Mystery: 'footsteps',
  News: 'news',
  Reality: 'camera-selfie',
  Romance: 'heart',
  'Sci-Fi & Fantasy': 'planet',
  'Science Fiction': 'ufo',
  'Science-Fiction & Fantastique': 'planet',
  Soap: 'heart-broken',
  Talk: 'microphone',
  Téléfilm: 'device-tv-old',
  Thriller: 'spy',
  'TV Movie': 'device-tv-old',
  War: 'tank',
  'War & Politics': 'building-bank',
  Western: 'cactus',
};

// The combining-marks range, not `\p{M}`: this module ships to the legacy webOS
// tier, whose engine cannot parse unicode property escapes.
function foldKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const BY_KEY = new Map(Object.entries(GENRE_GLYPHS).map(([name, glyph]) => [foldKey(name), glyph]));

/** The glyph name for a genre, or `undefined` for a name TMDB does not publish.
 * Case, accents, spacing and punctuation are folded away. */
export function genreGlyph(name: string): string | undefined {
  return BY_KEY.get(foldKey(name));
}
