import type { DiscoverEpisode, DiscoverSeason } from '@kromatv/client/discovery';
import { daysFromToday } from './airdate';
import type { WatchableTarget } from './watchable';
import type { WatchSubject } from './watchable-stage';

export interface WatchNext {
  season: number;
  episode: number;
  title: string | null;
  stillUrl: string | null;
  runtimeMin: number | null;
  subject: WatchSubject;
}

/** What is known of the show beyond the download, a season absent from the map
 * being one not read yet. */
export interface WatchShowGuide {
  episodes: ReadonlyMap<number, readonly DiscoverEpisode[]>;
  show: { title: string | null; seasons: readonly DiscoverSeason[] } | null;
}

export type WatchGuideGap = { kind: 'season'; season: number } | { kind: 'show' };

const MAX_FOLLOWING = 20;

const aired = (listed: DiscoverEpisode, now: Date): boolean =>
  listed.airDate !== null && daysFromToday(listed.airDate, now) <= 0;

function playing({ entry, file }: WatchableTarget): { season: number; episode: number } | null {
  if (entry.kind !== 'show' || file.season == null || file.episode == null) return null;
  return { season: file.season, episode: file.episode };
}

function heldIndex(target: WatchableTarget, season: number, episode: number): number | null {
  const held = target.entry.files.find(
    (file) => file.isVideo && file.season === season && file.episode === episode,
  );
  return held?.index ?? null;
}

function episodesAfter(
  target: WatchableTarget,
  guide: WatchShowGuide,
  season: number,
  after: number,
  now: Date,
): number[] {
  const listed = (guide.episodes.get(season) ?? []).filter((e) => aired(e, now));
  const held = target.entry.files.flatMap((file) =>
    file.isVideo && file.season === season && file.episode != null ? [file.episode] : [],
  );
  const numbers = new Set([...listed.map((e) => e.episode), ...held]);
  return [...numbers].filter((n) => n > after).sort((a, b) => a - b);
}

function seasonAfter(
  target: WatchableTarget,
  guide: WatchShowGuide,
  season: number,
): number | null {
  const listed = (guide.show?.seasons ?? []).filter((s) => s.episodeCount > 0).map((s) => s.season);
  const held = target.entry.files.flatMap((file) =>
    file.isVideo && file.season != null ? [file.season] : [],
  );
  const later = [...listed, ...held].filter((s) => s > season);
  return later.length ? Math.min(...later) : null;
}

function subjectOf(
  target: WatchableTarget,
  guide: WatchShowGuide,
  at: { season: number; episode: number },
): WatchSubject | null {
  const file = heldIndex(target, at.season, at.episode);
  if (file !== null) return { kind: 'download', downloadId: target.entry.id, file };
  const { tmdbId, year } = target.entry;
  const title = target.entry.title ?? guide.show?.title ?? null;
  if (tmdbId === null || !title) return null;
  return { kind: 'title', title: { tmdbId, kind: 'show', title, year, ...at } };
}

function nextOf(
  target: WatchableTarget,
  guide: WatchShowGuide,
  season: number,
  episode: number,
): WatchNext | null {
  const subject = subjectOf(target, guide, { season, episode });
  if (!subject) return null;
  const listed = guide.episodes.get(season)?.find((e) => e.episode === episode);
  return {
    season,
    episode,
    title: listed?.title ?? null,
    stillUrl: listed?.stillUrl ?? null,
    runtimeMin: listed?.runtimeMin ?? null,
    subject,
  };
}

/** The episodes after the one `target` plays, in order: the rest of its season
 * that has aired or that the download holds, else the next season's. Empty for
 * a film and for a file whose name gives no episode. */
export function watchFollowing(
  target: WatchableTarget,
  guide: WatchShowGuide,
  now: Date = new Date(),
): WatchNext[] {
  const at = playing(target);
  if (!at) return [];
  let season = at.season;
  let numbers = episodesAfter(target, guide, season, at.episode, now);
  const later = numbers.length ? null : seasonAfter(target, guide, season);
  if (later !== null) {
    season = later;
    numbers = episodesAfter(target, guide, season, 0, now);
  }
  return numbers
    .slice(0, MAX_FOLLOWING)
    .flatMap((episode) => nextOf(target, guide, season, episode) ?? []);
}

/** What to read next for {@link watchFollowing} to answer in full, null once
 * nothing is missing. */
export function watchGuideGap(
  target: WatchableTarget,
  guide: WatchShowGuide,
  now: Date = new Date(),
): WatchGuideGap | null {
  const at = playing(target);
  if (!at || target.entry.tmdbId === null) return null;
  if (!guide.episodes.has(at.season)) return { kind: 'season', season: at.season };
  if (episodesAfter(target, guide, at.season, at.episode, now).length) return null;
  if (!guide.show) return { kind: 'show' };
  const later = seasonAfter(target, guide, at.season);
  return later !== null && !guide.episodes.has(later) ? { kind: 'season', season: later } : null;
}

export const watchNextId = ({ season, episode }: Pick<WatchNext, 'season' | 'episode'>): string =>
  `s${season}e${episode}`;
