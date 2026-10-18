import type { VideoTrack } from '@kromatv/client/media';
import type { MonitoredSummary, TitleRef } from '@kromatv/client/monitoring';
import type { LedgerEpisode, LedgerSeason, RequestKind } from '@kromatv/client/requests';
import { codecLabel } from '@kromatv/core';
import type { MessageKey } from '@kromatv/i18n';

export type MonitoringKind = RequestKind | 'all';

interface MonitoringFilter {
  kind: MonitoringKind;
  onlyMissing: boolean;
  needle: string;
}

export type EpisodeState = 'available' | 'grabbed' | 'missing' | 'untracked' | 'upcoming';

export type MonitoredRow = Pick<MonitoredSummary, 'kind' | 'title' | 'missing'>;

type EpisodeRow = Pick<LedgerEpisode, 'airDate' | 'onDisk' | 'wantedId' | 'wantedStatus'>;

export interface MonitorCandidate extends TitleRef {
  title: string;
  year: number | null;
  posterUrl: string | null;
}

interface CatalogTitle {
  title: string;
  year: number | null;
  metadata?: { tmdbId: number; posterUrl?: string | null } | null;
}

const AIR_STATUS_KEYS: Record<string, MessageKey> = {
  Canceled: 'monitoring.airCanceled',
  Ended: 'monitoring.airEnded',
  'In Production': 'monitoring.airInProduction',
  Planned: 'monitoring.airPlanned',
  'Post Production': 'monitoring.airPostProduction',
  Released: 'monitoring.airReleased',
  'Returning Series': 'monitoring.airReturning',
  Rumored: 'monitoring.airRumored',
};

/** The episode's state, dated against the server's own `today` so it agrees
 * with the search gate. */
export function episodeState(episode: EpisodeRow, today: string): EpisodeState {
  if (episode.onDisk || episode.wantedStatus === 'available') return 'available';
  if (episode.wantedId === null) return 'untracked';
  if (episode.wantedStatus === 'grabbed') return 'grabbed';
  return episode.airDate !== null && episode.airDate > today ? 'upcoming' : 'missing';
}

function matches(title: string, needle: string): boolean {
  return !needle || title.toLocaleLowerCase().includes(needle);
}

function needleOf(filter: Pick<MonitoringFilter, 'needle'>): string {
  return filter.needle.trim().toLocaleLowerCase();
}

/** The monitored titles this filter leaves, by title. */
export function filterMonitored<T extends MonitoredRow>(
  rows: readonly T[],
  filter: MonitoringFilter,
): T[] {
  const needle = needleOf(filter);
  return rows
    .filter(
      (row) =>
        (filter.kind === 'all' || row.kind === filter.kind) &&
        (!filter.onlyMissing || row.missing > 0) &&
        matches(row.title, needle),
    )
    .sort((a, b) => a.title.localeCompare(b.title));
}

/**
 * The library titles the bulk dialog can offer: those a provider matched and
 * nothing monitors yet, each once, by title.
 */
export function monitorCandidates(
  movies: readonly CatalogTitle[],
  shows: readonly CatalogTitle[],
  monitored: readonly TitleRef[],
): MonitorCandidate[] {
  const taken = new Set(monitored.map((title) => `${title.kind}:${title.tmdbId}`));
  const found = new Map<string, MonitorCandidate>();
  const offer = (kind: RequestKind, entries: readonly CatalogTitle[]) => {
    for (const entry of entries) {
      const tmdbId = entry.metadata?.tmdbId;
      if (tmdbId === undefined) continue;
      const key = `${kind}:${tmdbId}`;
      if (taken.has(key) || found.has(key)) continue;
      found.set(key, {
        kind,
        tmdbId,
        title: entry.title,
        year: entry.year,
        posterUrl: entry.metadata?.posterUrl ?? null,
      });
    }
  };
  offer('movie', movies);
  offer('show', shows);
  return [...found.values()].sort((a, b) => a.title.localeCompare(b.title));
}

export function searchCandidates(
  candidates: readonly MonitorCandidate[],
  needle: string,
): MonitorCandidate[] {
  const trimmed = needle.trim().toLocaleLowerCase();
  return candidates.filter((candidate) => matches(candidate.title, trimmed));
}

/** The message naming a TMDB air status, or null for one the catalog has no
 * word for. */
export function airStatusKey(status: string | null): MessageKey | null {
  return status === null ? null : (AIR_STATUS_KEYS[status] ?? null);
}

/** What a show runs to, specials left out: TMDB files them as season 0. */
export function showTotals(seasons: readonly Pick<LedgerSeason, 'season' | 'episodeCount'>[]): {
  seasons: number;
  episodes: number;
} {
  const runs = seasons.filter((season) => season.season > 0);
  return {
    seasons: runs.length,
    episodes: runs.reduce((total, season) => total + season.episodeCount, 0),
  };
}

const RUNGS = [2160, 1440, 1080, 720, 576, 480];

/** What the library holds for one episode, as `1080p · H.264`. Null when
 * nothing was probed. The height is snapped to the rung below it, so a 1088-line
 * file still reads as 1080p. */
export function fileLabel(video: VideoTrack | null): string | null {
  if (!video) return null;
  const height = video.height ?? 0;
  const rung = RUNGS.find((step) => height >= step);
  const parts = [rung ? `${rung}p` : null, video.codec ? codecLabel(video.codec) : null];
  const label = parts.filter(Boolean).join(' · ');
  return label || null;
}
