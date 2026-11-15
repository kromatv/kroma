import type { KromaClient } from '@kromatv/client';
import type { CardSection } from '@kromatv/client/media';
import { formatRuntime, genreLabels } from '@kromatv/core';
import type { Translate } from '@kromatv/i18n';

export type HomeSection = CardSection;
export type HomeEntry = CardSection['items'][number];

const titleOf = (entry: HomeEntry) => (entry.type === 'show' ? entry.show : entry.item);

export const entryId = (entry: HomeEntry) => titleOf(entry).id;

export const entryTitle = (entry: HomeEntry): string => titleOf(entry).title;

export const entryMetadata = (entry: HomeEntry) => titleOf(entry).metadata ?? null;

export function entryPoster(client: KromaClient, entry: HomeEntry, width?: number): string {
  return entry.type === 'show'
    ? client.media.artwork.showPosterFor(entry.show, width)
    : client.media.artwork.posterFor(entry.item, width);
}

/** The landscape art of an entry, falling back to its poster so a title the
 * provider has no backdrop for still fills a wide frame. */
export function entryBackdrop(client: KromaClient, entry: HomeEntry, width?: number): string {
  return (
    client.media.artwork.backdropFor(titleOf(entry), width) ?? entryPoster(client, entry, width)
  );
}

/** Year, then runtime for a film or the season count for a show, then up to
 * two genres. */
export function entryFacts(t: Translate, entry: HomeEntry): string[] {
  const { year } = titleOf(entry);
  const span =
    entry.type === 'show'
      ? t('content.seasonCount', { count: entry.show.seasonCount })
      : formatRuntime(entry.item.durationMs);
  const genres = genreLabels(t, entryMetadata(entry)).slice(0, 2);
  return [year ? String(year) : null, span || null, ...genres].filter(
    (fact): fact is string => fact !== null,
  );
}
