// What a request covers, while an admin is editing it.
//
// The wire shape is a union of whole SEASONS and individual EPISODES, with both
// absent meaning the whole show. That is the right thing to store -- a season
// asked for whole keeps covering episodes TMDB has not announced yet -- but it
// is the wrong thing to edit against, because the same episode can be covered
// two ways. So the draft is a flat set of (season, episode) pairs plus the set
// of seasons taken whole, and it collapses back to the wire shape on save.

import type {
  LedgerEpisode,
  LedgerSeason,
  RequestCoverage,
  RequestCoverageBody,
} from '@kroma/core';

/** How a draft names one episode: `season:episode`. */
export const keyOf = (season: number, episode: number): string => `${season}:${episode}`;

export interface CoverageDraft {
  /** Seasons taken whole: future episodes of these are covered too. */
  seasons: Set<number>;
  /** Episodes picked one at a time, outside any whole season, keyed by
   *  [`keyOf`]. */
  episodes: Set<string>;
}

/** Where a request starts when the editor opens. A whole-show request has no
 * seasons listed, so it cannot be expressed until the season list is known. */
export function draftOf(coverage: RequestCoverage, all: readonly LedgerSeason[]): CoverageDraft {
  const wholeShow = coverage.seasons == null && coverage.episodes == null;
  return {
    seasons: new Set(wholeShow ? all.map((s) => s.season) : (coverage.seasons ?? [])),
    episodes: new Set((coverage.episodes ?? []).map((e) => keyOf(e.season, e.episode))),
  };
}

/** Whether one episode is covered: by its season being taken whole, or on its
 * own. */
export function covers(draft: CoverageDraft, season: number, episode: number): boolean {
  return draft.seasons.has(season) || draft.episodes.has(keyOf(season, episode));
}

/** How much of a season is covered, for the chip that stands in for its rows.
 * `some` is the state a checkbox cannot show and a season chip must. */
export type SeasonCoverage = 'none' | 'some' | 'all';

export function seasonCoverage(
  draft: CoverageDraft,
  season: number,
  episodes: readonly LedgerEpisode[] | null,
): SeasonCoverage {
  if (draft.seasons.has(season)) return 'all';
  // Without the season's rows, individually-picked episodes are all that can be
  // seen: enough to say "some", never enough to say "all".
  const picked = [...draft.episodes].filter((k) => k.startsWith(`${season}:`)).length;
  if (picked === 0) return 'none';
  if (episodes && picked >= episodes.length) return 'all';
  return 'some';
}

/** Take a whole season, or drop it and everything picked inside it. */
export function toggleSeason(draft: CoverageDraft, season: number, on: boolean): CoverageDraft {
  const seasons = new Set(draft.seasons);
  const episodes = new Set([...draft.episodes].filter((k) => !k.startsWith(`${season}:`)));
  if (on) seasons.add(season);
  else seasons.delete(season);
  return { seasons, episodes };
}

/** Add or remove one episode. Unticking one inside a whole season breaks that
 * season apart into its episodes, which is the only way to say "all but this
 * one" in a shape that has no exclusions. */
export function toggleEpisode(
  draft: CoverageDraft,
  season: number,
  episode: number,
  all: readonly LedgerEpisode[],
): CoverageDraft {
  if (draft.seasons.has(season)) {
    const seasons = new Set(draft.seasons);
    seasons.delete(season);
    const episodes = new Set(draft.episodes);
    for (const ep of all) {
      if (ep.episode !== episode) episodes.add(keyOf(season, ep.episode));
    }
    return { seasons, episodes };
  }
  const episodes = new Set(draft.episodes);
  const key = keyOf(season, episode);
  if (episodes.has(key)) episodes.delete(key);
  else episodes.add(key);
  return { seasons: draft.seasons, episodes };
}

/** How many episodes the draft covers, of the seasons whose rows are known. A
 * whole season with no rows loaded counts what TMDB said it holds. */
export function coveredCount(draft: CoverageDraft, all: readonly LedgerSeason[]): number {
  const whole = all
    .filter((s) => draft.seasons.has(s.season))
    .reduce((n, s) => n + s.episodeCount, 0);
  return whole + draft.episodes.size;
}

/** Collapse to the wire shape. Every season taken whole is the whole show, which
 * is worth saying as `null`: it keeps covering seasons TMDB has not announced. */
export function toBody(draft: CoverageDraft, all: readonly LedgerSeason[]): RequestCoverageBody {
  const seasons = [...draft.seasons].sort((a, b) => a - b);
  const wholeShow = all.length > 0 && seasons.length === all.length && draft.episodes.size === 0;
  if (wholeShow) return { seasons: null, episodes: null };
  const episodes = [...draft.episodes]
    .map((k) => k.split(':').map(Number))
    .map(([season, episode]) => ({ season: season ?? 0, episode: episode ?? 0 }))
    .sort((a, b) => a.season - b.season || a.episode - b.episode);
  return {
    seasons: seasons.length > 0 ? seasons : null,
    episodes: episodes.length > 0 ? episodes : null,
  };
}

/** Nothing at all is not a request; the editor refuses to save it. */
export function isEmpty(draft: CoverageDraft): boolean {
  return draft.seasons.size === 0 && draft.episodes.size === 0;
}
