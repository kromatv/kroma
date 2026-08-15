import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Metadata } from '../types';
import {
  artworkScaleValue,
  artworkWidth,
  backdropFor,
  posterFor,
  posterUrl,
  resolveArt,
  setArtworkScale,
  showPosterUrl,
  themeFor,
} from './artwork';
import type { RequestContext } from './base';

// The URL builders only read `ctx.baseUrl`, so a minimal stub suffices.
const ctx = { baseUrl: 'http://kroma.test' } as unknown as RequestContext;

describe('generated poster URLs', () => {
  it('encodes the id', () => {
    expect(posterUrl(ctx, 'id')).toBe('http://kroma.test/api/items/id/poster');
    expect(showPosterUrl(ctx, 's/1')).toBe('http://kroma.test/api/shows/s%2F1/poster');
  });
});

describe('artwork resolution setting', () => {
  afterEach(() => setArtworkScale(1));

  it('scales every width a caller asks for', () => {
    setArtworkScale(0.5);
    // 200 device pixels, served by the 240 rendition.
    expect(resolveArt(ctx, '/api/images/x.webp', 400)).toBe(
      'http://kroma.test/api/images/x.webp?w=240',
    );
  });

  it('leaves an unsized URL unsized: there is no width to scale', () => {
    setArtworkScale(0.5);
    expect(resolveArt(ctx, '/api/images/x.webp')).toBe('http://kroma.test/api/images/x.webp');
  });

  it('asks for the smallest rendition that exists, however small the art', () => {
    setArtworkScale(0.25);
    expect(resolveArt(ctx, '/api/images/x.webp', 1)).toBe(
      'http://kroma.test/api/images/x.webp?w=160',
    );
  });

  it('clamps out of range: past 1 gains nothing at 1x, and a quarter is the floor', () => {
    setArtworkScale(4);
    expect(artworkScaleValue()).toBe(1);
    setArtworkScale(0.01);
    expect(artworkScaleValue()).toBe(0.25);
  });

  // The server buckets at 160/240/320/480/780/960, so a step that does not
  // cross a boundary is a label with no behaviour behind it.
  it('gives each quality step its own bucket at a rail tile and at the hero', () => {
    const asks = (displayWidth: number) =>
      [1, 0.75, 0.5].map((scale) => {
        setArtworkScale(scale);
        return artworkWidth(displayWidth);
      });
    expect(asks(320)).toEqual([320, 240, 160]);
    expect(asks(960)).toEqual([960, 780, 480]);
  });
});

describe('artworkWidth', () => {
  afterEach(() => {
    setArtworkScale(1);
    vi.unstubAllGlobals();
  });

  it('asks in device pixels, capped at 2x', () => {
    vi.stubGlobal('devicePixelRatio', 2);
    // 192 device pixels, snapped up to the 240 rendition; 96 alone would take 160.
    expect(artworkWidth(96)).toBe(240);
    expect(artworkWidth(48)).toBe(160);
    vi.stubGlobal('devicePixelRatio', 3);
    expect(artworkWidth(96)).toBe(240);
  });

  // A fluid grid's cell width moves with the window. Every ask inside one step
  // of the ladder has to resolve to the same URL, or a resize re-fetches and
  // re-decodes a grid's worth of artwork that the cache already held.
  it('snaps to the ladder, so neighbouring cell widths share one URL', () => {
    expect(artworkWidth(203)).toBe(240);
    expect(artworkWidth(219)).toBe(240);
    expect(artworkWidth(240)).toBe(240);
    expect(artworkWidth(241)).toBe(320);
  });

  it('caps at the widest rendition, so two viewports share one cache key', () => {
    expect(artworkWidth(1280)).toBe(960);
    vi.stubGlobal('devicePixelRatio', 2);
    expect(artworkWidth(1280)).toBe(960);
    expect(artworkWidth(960)).toBe(960);
  });

  it('caps before scaling, so a lower step always asks for less', () => {
    setArtworkScale(0.5);
    vi.stubGlobal('devicePixelRatio', 2);
    expect(artworkWidth(1280)).toBe(480);
  });

  it('never asks below the smallest rendition the server keeps', () => {
    setArtworkScale(0.25);
    expect(artworkWidth(0)).toBe(160);
  });
});

describe('resolveArt + art helpers', () => {
  const meta = (m: Partial<Metadata>): { metadata?: Metadata | null } => ({
    metadata: m as Metadata,
  });

  it('resolves relative art against the origin and passes absolute URLs through', () => {
    expect(resolveArt(ctx, '/api/images/x.webp')).toBe('http://kroma.test/api/images/x.webp');
    expect(resolveArt(ctx, 'https://image.tmdb.org/x.jpg')).toBe('https://image.tmdb.org/x.jpg');
    expect(resolveArt(ctx, null)).toBeNull();
    expect(resolveArt(ctx, undefined)).toBeNull();
  });

  // Cached art can already carry a query of its own, and appending a second `?`
  // would make the width unreadable to the server and mint a URL that misses in
  // every cache.
  it('joins the width onto a path that already has a query', () => {
    expect(resolveArt(ctx, '/api/images/x.webp?v=2', 320)).toBe(
      'http://kroma.test/api/images/x.webp?v=2&w=320',
    );
  });

  it('asks the server for the width the artwork is actually drawn at', () => {
    expect(resolveArt(ctx, '/api/images/x.webp', 320)).toBe(
      'http://kroma.test/api/images/x.webp?w=320',
    );
    expect(
      posterFor(ctx, { id: 'i', metadata: { posterUrl: '/api/images/p.webp' } as Metadata }, 203),
    ).toBe('http://kroma.test/api/images/p.webp?w=240');
    expect(backdropFor(ctx, meta({ backdropUrl: '/api/images/b.webp' }), 320)).toBe(
      'http://kroma.test/api/images/b.webp?w=320',
    );
    expect(resolveArt(ctx, '/api/images/x.webp')).toBe('http://kroma.test/api/images/x.webp');
    // An absolute TMDB fallback is not ours to resize.
    expect(resolveArt(ctx, 'https://image.tmdb.org/x.jpg', 320)).toBe(
      'https://image.tmdb.org/x.jpg',
    );
  });

  it('caps a full-screen ask at the widest bucket instead of asking for the master', () => {
    expect(backdropFor(ctx, meta({ backdropUrl: '/api/images/b.webp' }), 1920)).toBe(
      'http://kroma.test/api/images/b.webp?w=960',
    );
  });

  it('posterFor uses cached art when present, else the generated poster', () => {
    expect(
      posterFor(ctx, { id: 'i1', metadata: { posterUrl: '/api/images/p.webp' } as Metadata }),
    ).toBe('http://kroma.test/api/images/p.webp');
    expect(posterFor(ctx, { id: 'i2', metadata: null })).toBe(
      'http://kroma.test/api/items/i2/poster',
    );
  });

  it('backdropFor / themeFor resolve or return null', () => {
    expect(backdropFor(ctx, meta({ backdropUrl: '/api/images/b.webp' }))).toBe(
      'http://kroma.test/api/images/b.webp',
    );
    expect(backdropFor(ctx, meta({}))).toBeNull();
    expect(themeFor(ctx, meta({ themeUrl: '/api/themes/1.mp3' }))).toBe(
      'http://kroma.test/api/themes/1.mp3',
    );
    expect(themeFor(ctx, {})).toBeNull();
  });
});
