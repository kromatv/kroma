// One row per genre: the id a provider knows it by, and the glyph it is drawn
// with. Its NAMES live in the `genre.*` copy in `locales/`, which is where the
// fold in `genre.ts` reads them from, so no spelling is written down twice.

/** TMDB's ids are the same in every language, which is what makes them the
 * identity a URL and a colour can hang off. Ordered by slug. */
export const GENRES = [
  { slug: 'action', tmdb: 28, glyph: 'karate' },
  { slug: 'action-adventure', tmdb: 10759, glyph: 'run' },
  { slug: 'adventure', tmdb: 12, glyph: 'compass' },
  { slug: 'animation', tmdb: 16, glyph: 'palette' },
  { slug: 'comedy', tmdb: 35, glyph: 'joker' },
  { slug: 'crime', tmdb: 80, glyph: 'gavel' },
  { slug: 'documentary', tmdb: 99, glyph: 'video' },
  { slug: 'drama', tmdb: 18, glyph: 'masks-theater' },
  { slug: 'family', tmdb: 10751, glyph: 'friends' },
  { slug: 'fantasy', tmdb: 14, glyph: 'dragon' },
  { slug: 'history', tmdb: 36, glyph: 'building-monument' },
  { slug: 'horror', tmdb: 27, glyph: 'ghost' },
  { slug: 'kids', tmdb: 10762, glyph: 'mood-kid' },
  { slug: 'music', tmdb: 10402, glyph: 'music' },
  { slug: 'mystery', tmdb: 9648, glyph: 'footsteps' },
  { slug: 'news', tmdb: 10763, glyph: 'news' },
  { slug: 'reality', tmdb: 10764, glyph: 'camera-selfie' },
  { slug: 'romance', tmdb: 10749, glyph: 'heart' },
  { slug: 'sci-fi-fantasy', tmdb: 10765, glyph: 'planet' },
  { slug: 'science-fiction', tmdb: 878, glyph: 'ufo' },
  { slug: 'soap', tmdb: 10766, glyph: 'heart-broken' },
  { slug: 'talk', tmdb: 10767, glyph: 'microphone' },
  { slug: 'thriller', tmdb: 53, glyph: 'spy' },
  { slug: 'tv-movie', tmdb: 10770, glyph: 'device-tv-old' },
  { slug: 'war', tmdb: 10752, glyph: 'tank' },
  { slug: 'war-politics', tmdb: 10768, glyph: 'building-bank' },
  { slug: 'western', tmdb: 37, glyph: 'cactus' },
] as const satisfies readonly { slug: string; tmdb: number; glyph: string }[];

export type GenreRow = (typeof GENRES)[number];

export type GenreSlug = GenreRow['slug'];

/** The copy key naming a genre, which is what `genreLabel` looks up. Assigning
 * it to a `MessageKey` is what makes a row with no `genre.*` copy fail to
 * compile. */
export type GenreCopyKey = `genre.${GenreSlug}`;
