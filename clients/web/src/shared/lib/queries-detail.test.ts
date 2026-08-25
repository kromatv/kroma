import { describe, expect, it, vi } from 'vitest';
import { c, installHarness, run, show } from './queries.fixture';

vi.mock('#web/shared/lib/api', () => ({
  kromaClient: () => c,
  toMovieView: (_c: unknown, m: { id: string }) => ({ ...m, mapped: 'movie' }),
  toShowView: (_c: unknown, s: { id: string }) => ({ ...s, mapped: 'show' }),
}));

const { catalogQueries } = await import('#web/shared/lib/queries');

installHarness();

describe('the show bundle', () => {
  const detail = (id: string, genres: string[], tmdbId: number | null = null) => ({
    show: show(id, genres, tmdbId),
  });

  it('prefers shows that share a genre', async () => {
    c.show.mockResolvedValue(detail('s1', ['Drama']));
    c.shows.mockResolvedValue([
      show('s1', ['Drama']),
      show('a', ['Drama']),
      show('b', ['Drama']),
      show('c', ['Drama']),
      show('z', ['Comedy']),
    ]);

    const { similarShows } = await run(catalogQueries.showBundle('s1'));
    expect(similarShows.map((s: { id: string }) => s.id)).toEqual(['a', 'b', 'c']);
  });

  it('tolerates a show, and a catalogue, with no metadata at all', async () => {
    c.show.mockResolvedValue({ show: { id: 's1' } });
    c.shows.mockResolvedValue([{ id: 's1' }, { id: 'a' }, { id: 'b' }]);

    const { similarShows } = await run(catalogQueries.showBundle('s1'));
    expect(similarShows.map((s: { id: string }) => s.id)).toEqual(['a', 'b']);
  });

  it('never suggests the show you are already looking at', async () => {
    c.show.mockResolvedValue(detail('s1', ['Drama']));
    c.shows.mockResolvedValue([show('s1', ['Drama']), show('a', ['Drama'])]);

    const { similarShows } = await run(catalogQueries.showBundle('s1'));
    expect(similarShows.map((s: { id: string }) => s.id)).not.toContain('s1');
  });

  it('falls back to the rest of the catalogue rather than showing one lonely card', async () => {
    c.show.mockResolvedValue(detail('s1', ['Drama']));
    c.shows.mockResolvedValue([
      show('s1', ['Drama']),
      show('a', ['Drama']),
      show('x', ['Comedy']),
      show('y', ['Horror']),
    ]);

    const { similarShows } = await run(catalogQueries.showBundle('s1'));
    expect(similarShows.map((s: { id: string }) => s.id)).toEqual(['a', 'x', 'y']);
  });

  it('caps the rail so a big library does not render hundreds of cards', async () => {
    c.show.mockResolvedValue(detail('s1', ['Drama']));
    c.shows.mockResolvedValue([
      show('s1', ['Drama']),
      ...Array.from({ length: 30 }, (_, i) => show(`o${i}`, ['Drama'])),
    ]);

    const { similarShows } = await run(catalogQueries.showBundle('s1'));
    expect(similarShows).toHaveLength(12);
  });

  it('skips the discover overlay entirely for a show TMDB never matched', async () => {
    c.show.mockResolvedValue(detail('s1', [], null));

    const { discover } = await run(catalogQueries.showBundle('s1'));
    expect(discover).toBeNull();
    expect(c.discoverDetail).not.toHaveBeenCalled();
  });

  it('asks for the overlay by the show tmdb id when there is one', async () => {
    c.show.mockResolvedValue(detail('s1', [], 1396));
    c.discoverDetail.mockResolvedValue({ seasons: [] });

    const { discover } = await run(catalogQueries.showBundle('s1'));
    expect(c.discoverDetail).toHaveBeenCalledWith('tv', 1396);
    expect(discover).toEqual({ seasons: [] });
  });

  it('still renders the page for a viewer who may not request', async () => {
    c.show.mockResolvedValue(detail('s1', [], 1396));
    c.discoverDetail.mockRejectedValue(new Error('403'));
    c.upNext.mockRejectedValue(new Error('403'));

    const bundle = await run(catalogQueries.showBundle('s1'));
    expect(bundle.discover).toBeNull();
    expect(bundle.upNext).toBeNull();
    expect(bundle.detail).toBeTruthy();
  });
});

describe('the optional lookups', () => {
  it('treat a missing similar list as no suggestions', async () => {
    c.similar.mockRejectedValue(new Error('boom'));
    expect(await run(catalogQueries.similar('m1'))).toEqual([]);
  });

  it('keep the credit name when the person profile cannot be fetched', async () => {
    c.personDetails.mockRejectedValue(new Error('boom'));
    expect(await run(catalogQueries.personDetails('Greta Gerwig'))).toEqual({
      name: 'Greta Gerwig',
      person: null,
      credits: [],
    });
  });
});

describe('the watch payload', () => {
  it('carries the item mapped, plus the episode autoplay will roll to', async () => {
    c.item.mockResolvedValue({ id: 'e1' });
    c.followingEpisodes.mockResolvedValue([{ id: 'e2' }, { id: 'e3' }]);

    const out = await run(catalogQueries.watch('e1'));
    expect(out.item).toEqual({ id: 'e1', mapped: 'movie' });
    expect(out.next).toEqual({ id: 'e2' });
    expect(out.following).toHaveLength(2);
  });

  it('has no next episode at the end of a show', async () => {
    c.item.mockResolvedValue({ id: 'e9' });
    c.followingEpisodes.mockResolvedValue([]);

    const out = await run(catalogQueries.watch('e9'));
    expect(out.next).toBeNull();
    expect(out.following).toEqual([]);
  });
});
