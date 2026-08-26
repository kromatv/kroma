// Art + colour for the genre cards on the Genres screens (web + TV): pick a
// library title to front each genre, and give every genre a stable signature
// colour. Works over the catalogue already in memory, like `browse.ts`.

import { compareTitles, type Sortable } from './browse';
import { hueFromString } from './format';
import { genreSlug, genreSlugs } from './genre';

const byRating = compareTitles('rating');

// A linear scan, not a sort: only one title per genre is ever read. Ties keep
// the earliest candidate, so the pick stays deterministic on engines with an
// unstable Array.sort (legacy webOS).
function bestUnused<T extends Sortable>(list: readonly T[], used: ReadonlySet<T>): T | undefined {
  let best: T | undefined;
  let free: T | undefined;
  for (const it of list) {
    if (best === undefined || byRating(it, best) < 0) best = it;
    if (!used.has(it) && (free === undefined || byRating(it, free) < 0)) free = it;
  }
  return free ?? best;
}

/** Per-genre showcase pick, keyed by genre slug: a highly-rated title with
 * real backdrop art to front each genre card. Scarcest genres are assigned
 * first and every genre takes its best not-yet-used title, so two cards only
 * ever share art when a genre has no unused candidate left. Deterministic
 * across renders. Genres whose titles have no backdrop at all are simply
 * absent from the map. */
export function genreShowcases<T extends Sortable>(items: readonly T[]): Map<string, T> {
  const byGenre = new Map<string, T[]>();
  for (const it of items) {
    if (!it.metadata?.backdropUrl) continue;
    for (const slug of genreSlugs(it.metadata)) {
      const list = byGenre.get(slug);
      if (list) list.push(it);
      else byGenre.set(slug, [it]);
    }
  }
  const order = [...byGenre.entries()].sort(
    (a, b) => a[1].length - b[1].length || a[0].localeCompare(b[0]),
  );
  const used = new Set<T>();
  const picks = new Map<string, T>();
  for (const [slug, list] of order) {
    const pick = bestUnused(list, used);
    if (pick === undefined) continue; // unreachable: every list has at least one entry
    picks.set(slug, pick);
    used.add(pick);
  }
  return picks;
}

/** Signature hues for the common TMDB genres, spread around the colour wheel
 * (the chromatic nod to the KROMA brand). Keyed by slug, so a genre keeps its
 * colour whichever language the library stored its name in. */
const GENRE_HUES: Readonly<Record<string, number>> = {
  action: 12,
  'action-adventure': 20,
  western: 28,
  history: 36,
  comedy: 46,
  reality: 60,
  war: 75,
  'war-politics': 75,
  family: 90,
  kids: 105,
  documentary: 125,
  adventure: 150,
  animation: 172,
  'science-fiction': 195,
  'sci-fi-fantasy': 208,
  'tv-movie': 218,
  thriller: 232,
  mystery: 252,
  drama: 268,
  fantasy: 285,
  soap: 300,
  music: 315,
  romance: 335,
  crime: 348,
  horror: 358,
};

/** The stable hue (0-359) for a genre, named or slugged: curated for the
 * genres TMDB publishes, hashed for anything else, so every genre always gets
 * the same colour whatever it was called when it reached us. */
export function genreHue(nameOrSlug: string): number {
  const slug = genreSlug(nameOrSlug);
  // Same hash the key-art gradients use, so both palettes stay one implementation.
  return GENRE_HUES[slug] ?? hueFromString(slug);
}

/** Deterministic two-stop gradient for a genre card (same shape `posterColors`
 * has for items). Comma-form hsl() so legacy TV engines parse it too. */
export function genreColors(name: string): [string, string] {
  const hue = genreHue(name);
  return [`hsl(${hue}, 45%, 32%)`, `hsl(${(hue + 30) % 360}, 60%, 12%)`];
}

/** The genre's vivid accent colour (caption bar / highlights). */
export function genreAccent(name: string): `hsl(${string})` {
  return `hsl(${genreHue(name)}, 82%, 62%)`;
}

/** Layered CSS background for the caption scrim on a genre card: a glow in the
 * genre's hue rising from the caption corner over a neutral legibility scrim,
 * so the artwork above keeps its true colours. Legacy-safe syntax. */
export function genreTint(name: string): string {
  const hue = genreHue(name);
  return (
    `radial-gradient(130% 96% at 10% 106%, hsla(${hue}, 78%, 34%, 0.62), hsla(${hue}, 78%, 34%, 0) 58%), ` +
    'linear-gradient(to top, rgba(7, 8, 11, 0.88), rgba(7, 8, 11, 0.34) 38%, rgba(7, 8, 11, 0.04) 68%)'
  );
}
