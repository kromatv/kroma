import { MediaCard, Metadata, Show } from '@kromatv/client/media';
import type { HomeEntry } from './home-sections';

interface Titled {
  title?: string;
  overview?: string;
  matched?: string;
  backdrop?: string;
}

const metadata = ({ matched, overview, backdrop }: Titled) =>
  matched === undefined && overview === undefined && backdrop === undefined
    ? null
    : Metadata.parse({
        provider: 'tmdb',
        tmdbId: 1,
        title: matched ?? null,
        overview: overview ?? null,
        genres: [],
        backdropUrl: backdrop,
        tmdbUrl: 'https://tmdb.test/1',
      });

const catalog = (id: string, over: Titled) => ({
  id,
  title: over.title ?? id,
  year: null,
  library: 'lib',
  video: null,
  addedAt: '2026-01-01T00:00:00Z',
  metadata: metadata(over),
});

export function movieCard(id: string, over: Titled = {}) {
  return MediaCard.parse({ ...catalog(id, over), kind: 'movie', durationMs: null });
}

export function showCard(id: string, over: Titled = {}) {
  return Show.parse({ ...catalog(id, over), seasonCount: 1, episodeCount: 1 });
}

export function movieEntry(id: string, over: Titled = {}): HomeEntry {
  return { type: 'movie', item: movieCard(id, over) };
}

export function showEntry(id: string, over: Titled = {}): HomeEntry {
  return { type: 'show', show: showCard(id, over) };
}
