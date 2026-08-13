// What a free-text sweep is hunting for.
//
// The form used to ask three things at once -- text, a season box and an episode
// box -- and two of them were nonsense for a film. There is only ever ONE
// decision here (what kind of thing am I after), and the numbers belong to that
// decision rather than standing beside it.
//
// It is not cosmetic. A season turns the sweep into a TV search, so the tracker
// answers from its TV categories instead of its film ones; leaving the boxes
// empty on a series is why a search comes back with nothing. The target says
// that out loud, and [`queryPreview`] shows what the indexers will be asked.

/** What the sweep is after. Chosen by the admin, defaulted from the request. */
export type FreeTarget = 'movie' | 'season' | 'episode';

/** The target a request opens on. A film asks about films; a show is most often
 * hunted a season at a time, which is also the shape a pack comes in. */
export function defaultTarget(kind: 'movie' | 'show'): FreeTarget {
  return kind === 'movie' ? 'movie' : 'season';
}

export function needsSeason(target: FreeTarget): boolean {
  return target !== 'movie';
}

export function needsEpisode(target: FreeTarget): boolean {
  return target === 'episode';
}

/** A box's contents as a number, or null for empty/nonsense. Season 0 is real
 * (specials), so only a negative or unparseable value is rejected. */
export function numberOrNull(value: string): number | null {
  const n = Number.parseInt(value.trim(), 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** The season/episode the sweep will carry, which is only what the target asks
 * for: a number left over from a previous target must not travel. */
export function scopeOf(
  target: FreeTarget,
  season: string,
  episode: string,
): { season: number | null; episode: number | null } {
  return {
    season: needsSeason(target) ? numberOrNull(season) : null,
    episode: needsEpisode(target) ? numberOrNull(episode) : null,
  };
}

const pad = (n: number) => String(n).padStart(2, '0');

/** What the indexers will actually be asked, e.g. `Alien: Earth S01E06`. Shown
 * under the field: the numbers change the query silently otherwise, and a sweep
 * that found nothing is unreadable without knowing what was sent. Empty when
 * there is nothing to search for yet. */
export function queryPreview(query: string, target: FreeTarget, season: string, episode: string) {
  const text = query.trim();
  if (!text) return '';
  const scope = scopeOf(target, season, episode);
  if (scope.season == null) return text;
  const tag =
    scope.episode == null ? `S${pad(scope.season)}` : `S${pad(scope.season)}E${pad(scope.episode)}`;
  return `${text} ${tag}`;
}

/** Whether the form can be submitted: some text, and the numbers the target
 * needs. A season search with no season is a film search wearing a label. */
export function canSearch(query: string, target: FreeTarget, season: string, episode: string) {
  if (!query.trim()) return false;
  const scope = scopeOf(target, season, episode);
  if (needsSeason(target) && scope.season == null) return false;
  return !(needsEpisode(target) && scope.episode == null);
}
