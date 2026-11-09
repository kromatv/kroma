import type { Trailer, TrailerList, TrailerVersion } from '@kromatv/client/trailers';
import type { MessageKey } from '@kromatv/i18n';

/** What the trailer button says, by how the trailer reaches the viewer: plain
 * when it speaks their language, marked when it is subtitled or original. */
export const TRAILER_LABEL: Record<TrailerVersion, MessageKey> = {
  localized: 'trailer.watch',
  subtitled: 'trailer.watchSubtitled',
  original: 'trailer.watchOriginal',
};

/** The trailer a title's button plays: the best one, and only when this
 * server can play it. */
export function playableTrailer(list: TrailerList | undefined): Trailer | null {
  if (!list?.playable) return null;
  return list.trailers[0] ?? null;
}

/** The trailer on YouTube itself, for a viewer to open when this server could
 * not fetch it. */
export function youtubeWatchUrl(video: string): string {
  return `https://www.youtube.com/watch?v=${encodeURIComponent(video)}`;
}
