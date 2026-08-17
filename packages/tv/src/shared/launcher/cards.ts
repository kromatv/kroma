// Card-builders for the rows KROMA publishes OUT to a television's home screen:
// the Android TV preview channels and the Watch Next row. The providers own the
// effects; this owns the shape, so it is testable without React.

import type { ContinueItem, KromaClient, MediaItem, Section } from '@kroma/core';

// A launcher card is drawn 1280 wide; asking for the original ships a
// multi-megabyte still to a shelf that shows a thumbnail.
const LAUNCHER_ART_W = 1280;
const MAX_PROGRAMS = 20;

// Only the evergreen rows are mirrored: the personalized/themed rows `/api/home`
// also returns make unstable launcher channels. Their server ids are fixed (see
// services/sections build_home).
const GENERIC_HOME_ROWS = ['recent', 'for-you', 'trending'] as const;

export type HomeProgram = {
  id: string;
  title: string;
  subtitle: string;
  imageUrl: string;
  backdropUrl?: string;
  kind: string;
};

// The launcher backend keys each channel by its ROW INDEX (see HomeChannel.kt),
// so the section id is not sent - only the display title + its programs.
export type HomeChannelSpec = { title: string; items: HomeProgram[] };

export type WatchNextItem = {
  id: string;
  title: string;
  subtitle: string;
  imageUrl: string;
  backdropUrl?: string;
  showId?: string;
  progressMs: number;
  durationMs: number;
  kind: string;
  updatedAtMs: number;
};

function toProgram(movie: MediaItem, client: KromaClient): HomeProgram {
  const art = `${client.baseUrl}/api/items/${encodeURIComponent(movie.id)}/card?v=${encodeURIComponent(movie.addedAt)}`;
  return {
    id: movie.id,
    title: movie.title,
    subtitle: movie.year ? String(movie.year) : '',
    imageUrl: art,
    backdropUrl: client.backdropFor(movie, LAUNCHER_ART_W) ?? undefined,
    kind: 'movie',
  };
}

// Movies only: the launcher preview deep link resolves a movie id.
function programsOf(section: Section, client: KromaClient): HomeProgram[] {
  const seen = new Set<string>();
  const items: HomeProgram[] = [];
  for (const e of section.items) {
    if (e.type !== 'movie' || seen.has(e.item.id)) continue;
    seen.add(e.item.id);
    items.push(toProgram(e.item, client));
    if (items.length >= MAX_PROGRAMS) break;
  }
  return items;
}

export function buildHomeChannels(sections: Section[], client: KromaClient): HomeChannelSpec[] {
  const byId = new Map(sections.map((s) => [s.id, s]));
  const channels: HomeChannelSpec[] = [];
  for (const id of GENERIC_HOME_ROWS) {
    const s = byId.get(id);
    if (!s) continue;
    const items = programsOf(s, client);
    if (items.length) channels.push({ title: s.title, items });
  }
  // A server that renamed those ids would silently publish nothing.
  if (!channels.length && sections.length) {
    console.warn('[KROMA] no generic home rows matched section ids', GENERIC_HOME_ROWS);
  }
  return channels;
}

function cardArt(c: ContinueItem, client: KromaClient): string {
  const progress = c.durationMs ? c.positionMs / c.durationMs : 0;
  const params = new URLSearchParams({ label: 'Reprendre', v: c.item.addedAt });
  if (progress > 0) params.set('progress', progress.toFixed(3));
  return `${client.baseUrl}/api/items/${encodeURIComponent(c.item.id)}/card?${params}`;
}

// `backdropUrl` is the clean art for Top Shelf, which draws its own title and
// progress bar and would otherwise show two.
export function buildWatchNext(items: ContinueItem[], client: KromaClient): WatchNextItem[] {
  return items.map((c) => {
    const it = c.item;
    return {
      id: it.id,
      title: it.showTitle ?? it.title,
      subtitle: it.episodeTitle ?? (it.year ? String(it.year) : ''),
      imageUrl: cardArt(c, client),
      backdropUrl: client.backdropFor(it, LAUNCHER_ART_W) ?? undefined,
      // Launchers link an episode card to the SHOW: the movie catalogue cannot
      // resolve an episode id.
      showId: it.showId ?? undefined,
      progressMs: Math.round(c.positionMs),
      durationMs: Math.round(c.durationMs ?? 0),
      kind: it.kind,
      updatedAtMs: Date.parse(c.updatedAt) || Date.now(),
    };
  });
}
