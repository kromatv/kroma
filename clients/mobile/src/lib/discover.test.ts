import type { KromaClient } from '@kromatv/client';
import type { DiscoverEntry } from '@kromatv/client/discovery';
import { describe, expect, it } from 'vitest';
import { discoverCard } from '#mobile/lib/discover';

const client = {
  media: { artwork: { resolve: (url?: string | null) => url ?? null } },
} as unknown as KromaClient;

const entry = (over: Partial<DiscoverEntry> = {}): DiscoverEntry =>
  ({
    kind: 'movie',
    tmdbId: 45_745,
    title: 'Sintel',
    year: 2010,
    posterUrl: '/art/sintel.jpg',
    ...over,
  }) as unknown as DiscoverEntry;

describe('a title the phone found beyond the library', () => {
  it('opens the discovery page of a film under the route vocabulary', () => {
    expect(discoverCard(entry(), client, 200).route).toBe('/discover/movie/45745');
  });

  it('opens a series under the same vocabulary the discovery routes are spelled in', () => {
    expect(discoverCard(entry({ kind: 'show' }), client, 200).route).toBe('/discover/tv/45745');
  });

  it('keys itself apart from a library card of the same number', () => {
    expect(discoverCard(entry(), client, 200).key).toBe('tmdb:45745');
  });
});
