// The episode selection on a show's page, keyed `"<season>-<episode>"`. The
// season switcher clears it, so what the request bar counts is always what the
// screen is showing.

import type { EpisodeRef } from '@kroma/core';

export const epKey = (season: number, episode: number) => `${season}-${episode}`;

export function toggle(prev: ReadonlySet<string>, key: string): Set<string> {
  const next = new Set(prev);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
}

/** The selection as the API wants it, ordered so a request reads season by
 * season. Malformed keys are dropped rather than sent as NaN. */
export function toEpisodeRefs(selection: ReadonlySet<string>): EpisodeRef[] {
  const refs: EpisodeRef[] = [];
  for (const key of selection) {
    const [s, e] = key.split('-');
    // `Number('')` is 0, which passes an integer check, so the emptiness of each
    // half has to be tested on its own.
    if (!s || !e) continue;
    const season = Number(s);
    const episode = Number(e);
    if (!Number.isInteger(season) || season < 0) continue;
    if (!Number.isInteger(episode) || episode < 1) continue;
    refs.push({ season, episode });
  }
  return refs.sort((a, b) => a.season - b.season || a.episode - b.episode);
}
