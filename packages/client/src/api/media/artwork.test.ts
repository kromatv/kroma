import { afterEach, describe, expect, it } from 'vitest';
import { recordingClient } from '../../kroma-client.fixture';
import { artworkScaleValue, artworkWidth, setArtworkScale } from './artwork-scale';
import { ItemId, ShowId } from './ids';

const { client } = recordingClient();
const artwork = client.media.artwork;
const item = ItemId.parse('a b');
const show = ShowId.parse('s 1');

afterEach(() => setArtworkScale(1));

describe('artwork resolution setting', () => {
  it('scales every width a caller asks for', () => {
    setArtworkScale(0.5);
    expect(artwork.resolve('/api/images/p.webp', 480)).toBe(
      'http://kroma.test/api/images/p.webp?w=240',
    );
  });

  it('leaves an unsized URL unsized: there is no width to scale', () => {
    setArtworkScale(0.5);
    expect(artwork.resolve('/api/images/p.webp')).toBe('http://kroma.test/api/images/p.webp');
  });

  it('asks for the smallest rendition that exists, however small the art', () => {
    setArtworkScale(0.25);
    expect(artworkWidth(160)).toBe(160);
  });

  it('clamps out of range: past 1 gains nothing at 1x, and a quarter is the floor', () => {
    setArtworkScale(4);
    expect(artworkScaleValue()).toBe(1);
    setArtworkScale(0.01);
    expect(artworkScaleValue()).toBe(0.25);
  });
});

describe('artworkWidth', () => {
  it('snaps to the ladder, so neighbouring cell widths share one URL', () => {
    expect(artworkWidth(203)).toBe(artworkWidth(219));
  });

  it('caps at the widest rendition, so two viewports share one cache key', () => {
    expect(artworkWidth(4000)).toBe(960);
    expect(artworkWidth(8000)).toBe(960);
  });

  it('caps before scaling, so a lower step always asks for less', () => {
    setArtworkScale(0.5);
    expect(artworkWidth(4000)).toBe(480);
  });

  it('never asks below the smallest rendition the server keeps', () => {
    setArtworkScale(0.25);
    expect(artworkWidth(1)).toBe(160);
  });
});

describe('resolving stored art', () => {
  it('resolves a relative path against the origin and passes an absolute URL through', () => {
    expect(artwork.resolve('/api/images/p.webp')).toBe('http://kroma.test/api/images/p.webp');
    expect(artwork.resolve('https://image.tmdb.org/p.jpg')).toBe('https://image.tmdb.org/p.jpg');
    expect(artwork.resolve(null)).toBeNull();
    expect(artwork.resolve(undefined)).toBeNull();
  });

  it('joins the width onto a path that already has a query', () => {
    expect(artwork.resolve('/api/images/p.webp?v=2', 320)).toBe(
      'http://kroma.test/api/images/p.webp?v=2&w=320',
    );
  });

  it('encodes the id of a generated poster', () => {
    expect(artwork.posterUrl(item)).toBe('http://kroma.test/api/items/a%20b/poster');
    expect(artwork.showPosterUrl(show)).toBe('http://kroma.test/api/shows/s%201/poster');
  });

  it('posterFor uses cached art when present, else the generated poster', () => {
    const metadata = { posterUrl: '/api/images/p.webp' } as never;
    expect(artwork.posterFor({ id: item, metadata })).toBe('http://kroma.test/api/images/p.webp');
    expect(artwork.posterFor({ id: item, metadata: null })).toBe(
      'http://kroma.test/api/items/a%20b/poster',
    );
  });

  it('showPosterFor uses cached art when present, else the generated poster', () => {
    const metadata = { posterUrl: '/api/images/s.webp' } as never;

    expect(artwork.showPosterFor({ id: show, metadata })).toBe(
      'http://kroma.test/api/images/s.webp',
    );
    expect(artwork.showPosterFor({ id: show, metadata: null })).toBe(
      'http://kroma.test/api/shows/s%201/poster',
    );
  });

  it('backdropFor and themeFor resolve or answer null', () => {
    const metadata = { backdropUrl: '/api/images/b.webp', themeUrl: null } as never;
    expect(artwork.backdropFor({ metadata })).toBe('http://kroma.test/api/images/b.webp');
    expect(artwork.themeFor({ metadata })).toBeNull();
    expect(artwork.backdropFor({ metadata: null })).toBeNull();
  });
});

describe('posterBlob', () => {
  it('fetches an absolute (TMDB) poster directly, with no /api prefix and no auth', async () => {
    const { client: c, calls } = recordingClient(() => ({ text: 'bytes' }), { authToken: 'tok' });

    const blob = await c.media.artwork.posterBlob({
      id: item,
      metadata: { posterUrl: 'https://image.tmdb.org/p.jpg' } as never,
    });

    expect(blob).toBeInstanceOf(Blob);
    expect(calls[0]?.url).toBe('https://image.tmdb.org/p.jpg');
    expect(calls[0]?.headers.get('Authorization')).toBeNull();
  });

  it('throws when an absolute poster fetch is not ok', async () => {
    const { client: c } = recordingClient(() => ({ ok: false, status: 404 }));

    await expect(
      c.media.artwork.posterBlob({ id: item, metadata: { posterUrl: 'https://img/x' } as never }),
    ).rejects.toThrow('poster 404');
  });

  it('strips a single /api prefix from a cached-art path and refetches it', async () => {
    const { client: c, calls } = recordingClient(() => ({ text: 'bytes' }));

    await c.media.artwork.posterBlob({
      id: item,
      metadata: { posterUrl: '/api/images/p.webp' } as never,
    });

    expect(calls[0]?.url).toBe('http://kroma.test/api/images/p.webp');
  });

  it('falls back to the generated poster endpoint, encoding the id', async () => {
    const { client: c, calls } = recordingClient(() => ({ text: 'bytes' }));

    await c.media.artwork.posterBlob({ id: item, metadata: null });

    expect(calls[0]?.url).toBe('http://kroma.test/api/items/a%20b/poster');
  });
});
