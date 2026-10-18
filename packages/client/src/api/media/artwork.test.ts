import { afterEach, describe, expect, it } from 'vitest';
import { recordingClient } from '../../kroma-client.fixture';
import { artworkWidth } from './artwork-scale';
import { ItemId, ShowId } from './ids';

const { client } = recordingClient();
const artwork = client.media.artwork;
const item = ItemId.parse('a b');
const show = ShowId.parse('s 1');

afterEach(() => {
  client.session.setSessionMediaTicket(undefined);
});

describe('artwork resolution setting', () => {
  it('reads changing quality from its own client without affecting another root', () => {
    let scale = 0.5;
    const first = recordingClient(undefined, { artworkScale: () => scale }).client.media.artwork;
    const second = recordingClient().client.media.artwork;
    expect(first.resolve('/api/images/p.webp', 960)).toContain('w=480');
    expect(second.resolve('/api/images/p.webp', 960)).toContain('w=960');
    scale = 0.75;
    expect(first.resolve('/api/images/p.webp', 960)).toContain('w=780');
    expect(second.resolve('/api/images/p.webp', 960)).toContain('w=960');
  });

  it('scales every width a caller asks for', () => {
    const { client: scaled } = recordingClient(undefined, { artworkScale: () => 0.5 });
    const artwork = scaled.media.artwork;
    expect(artwork.resolve('/api/images/p.webp', 480)).toBe(
      'http://kroma.test/api/images/p.webp?w=240',
    );
  });

  it('leaves an unsized URL unsized: there is no width to scale', () => {
    const { client: scaled } = recordingClient(undefined, { artworkScale: () => 0.5 });
    const artwork = scaled.media.artwork;
    expect(artwork.resolve('/api/images/p.webp')).toBe('http://kroma.test/api/images/p.webp');
  });

  it('asks for the smallest rendition that exists, however small the art', () => {
    expect(artworkWidth(160, 0.25)).toBe(160);
  });

  it('clamps out of range: past 1 gains nothing at 1x, and a quarter is the floor', () => {
    expect(artworkWidth(960, 4)).toBe(960);
    expect(artworkWidth(960, 0.01)).toBe(240);
  });
});

describe('a media-byte path the server composed itself', () => {
  const SIGNED_IN_USER = {
    id: 'u1',
    email: 'a@b.c',
    username: 'alice',
    permissions: ['playback'],
    createdAt: '2026-01-01T00:00:00Z',
    hasPin: false,
  };

  async function ticketed() {
    const { client: signedIn } = recordingClient(() => ({
      json: { token: 'tok', mediaTicket: 'dev.999.sig', user: SIGNED_IN_USER },
    }));
    await signedIn.accounts.exchangeToken('access-token');
    return signedIn.media.artwork;
  }

  it('gains the media ticket, keeping the query the server already wrote', async () => {
    const art = await ticketed();

    expect(art.resolve('/api/items/i1/storyboard.img?v=k')).toBe(
      'http://kroma.test/api/items/i1/storyboard.img?v=k&t=dev.999.sig',
    );
    expect(art.resolve('/api/items/i1/subtitles/dl/d1.vtt')).toBe(
      'http://kroma.test/api/items/i1/subtitles/dl/d1.vtt?t=dev.999.sig',
    );
  });

  it('does not put the ticket on art, which is not library bytes', async () => {
    const art = await ticketed();

    expect(art.resolve('/api/images/p.webp', 480)).toBe(
      'http://kroma.test/api/images/p.webp?w=480',
    );
    expect(art.resolve('/api/themes/1234.mp3')).toBe('http://kroma.test/api/themes/1234.mp3');
    expect(art.resolve('https://image.tmdb.org/b.jpg')).toBe('https://image.tmdb.org/b.jpg');
  });

  it('is left ticketless before a sign-in has handed one over', () => {
    expect(artwork.resolve('/api/items/i1/storyboard.img?v=k')).toBe(
      'http://kroma.test/api/items/i1/storyboard.img?v=k',
    );
  });
});

describe('artworkWidth', () => {
  it('snaps to the ladder, so neighbouring cell widths share one URL', () => {
    expect(artworkWidth(203)).toBe(artworkWidth(219));
  });

  it('caps at the widest rendition, so two viewports share one cache key', () => {
    expect(artworkWidth(4000)).toBe(1280);
    expect(artworkWidth(8000)).toBe(1280);
  });

  it('caps before scaling, so a lower step always asks for less', () => {
    expect(artworkWidth(4000, 0.5)).toBe(780);
  });

  it('never asks below the smallest rendition the server keeps', () => {
    expect(artworkWidth(1, 0.25)).toBe(160);
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
