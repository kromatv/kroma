// Smart Hub preview card-builder: turns the live catalog (newest movies +
// resumable items) into the carousel tile JSON the TV expects.

import { type ContinueItem, type KromaClient, type MediaItem, metaLine } from '@kroma/core';
import type { DeepLink } from '#tv/shared/preview/types';

const RECENT_SECTION = 'Ajout récent';
const RESUME_SECTION = 'Reprendre la lecture';
const RECENT_BADGE = 'Nouveauté';
const RESUME_BADGE = 'Reprendre';
const MAX_TILES = 20;

function newest(movies: MediaItem[]): MediaItem[] {
  return [...movies].sort((a, b) => {
    if (a.addedAt < b.addedAt) return 1;
    if (a.addedAt > b.addedAt) return -1;
    return 0;
  });
}

interface Tile {
  title: string;
  subtitle: string;
  image_url: string;
  image_ratio: '16by9';
  action_data: string;
  is_playable: false;
}
interface Section {
  title: string;
  tiles: Tile[];
}

function hasArt(m: MediaItem): boolean {
  return !!(m.metadata?.backdropUrl || m.metadata?.posterUrl);
}

function deepLinkFor(m: MediaItem): DeepLink {
  return m.kind === 'episode' && m.showId
    ? { type: 'show', id: m.showId }
    : { type: 'movie', id: m.id };
}

function titleFor(m: MediaItem): string {
  return m.showTitle ?? m.title;
}

function subtitleFor(m: MediaItem): string {
  const type = m.kind === 'episode' || m.showId ? 'Série' : 'Film';
  const meta = metaLine(m);
  return meta ? `${type} · ${meta}` : type;
}

// `?v=<addedAt>` busts the TV's preview image cache when art changes.
function tile(client: KromaClient, m: MediaItem, badge: string, progress?: number): Tile {
  const params = new URLSearchParams({ label: badge, v: m.addedAt });
  if (progress != null && progress > 0) params.set('progress', progress.toFixed(3));
  return {
    title: titleFor(m),
    subtitle: subtitleFor(m),
    image_url: `${client.baseUrl}/api/items/${encodeURIComponent(m.id)}/card?${params.toString()}`,
    image_ratio: '16by9',
    action_data: JSON.stringify(deepLinkFor(m)),
    is_playable: false,
  };
}

/** The Smart Hub preview document, or `null` when there is nothing to show. */
export function buildPreviewData(
  client: KromaClient,
  movies: MediaItem[],
  continueItems: ContinueItem[] = [],
): string | null {
  const sections: Section[] = [];

  const resume = continueItems
    .filter((c) => hasArt(c.item))
    .slice(0, MAX_TILES)
    .map((c) =>
      tile(client, c.item, RESUME_BADGE, c.durationMs ? c.positionMs / c.durationMs : undefined),
    );
  if (resume.length) sections.push({ title: RESUME_SECTION, tiles: resume });

  const recent = newest(movies.filter(hasArt))
    .slice(0, MAX_TILES)
    .map((m) => tile(client, m, RECENT_BADGE));
  if (recent.length) sections.push({ title: RECENT_SECTION, tiles: recent });

  return sections.length ? JSON.stringify({ sections }) : null;
}
