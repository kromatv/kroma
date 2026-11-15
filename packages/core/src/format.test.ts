import type { MediaItem, VideoTrack } from '@kromatv/client/media';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  channelLabel,
  codecLabel,
  commitLabel,
  episodeTag,
  formatBuildDate,
  formatRuntime,
  hueFromString,
  langCode,
  metaLine,
  playerSubtitle,
  posterColors,
  posterGradient,
  qualityBadge,
  qualityBadgeForVideo,
  repoLabel,
  resolveImageUrl,
  sizedImageUrl,
} from './format';

function episode(p: {
  season?: number | null;
  episode?: number | null;
  episodeEnd?: number | null;
  showTitle?: string | null;
  title?: string;
}): MediaItem {
  return {
    kind: 'episode',
    title: p.title ?? 'Pilot',
    showTitle: 'showTitle' in p ? p.showTitle : 'The Show',
    season: 'season' in p ? p.season : 1,
    episode: 'episode' in p ? p.episode : 5,
    episodeEnd: p.episodeEnd ?? null,
  } as unknown as MediaItem;
}

const MOVIE = {
  kind: 'movie',
  title: 'Blade Runner',
  year: 1982,
  durationMs: 7620000,
  video: { codec: 'hevc', width: 3840, hdr: true },
} as unknown as MediaItem;

describe('episodeTag', () => {
  it('zero-pads season and episode', () => {
    expect(episodeTag(episode({ season: 1, episode: 5 }))).toBe('S01E05');
    expect(episodeTag(episode({ season: 12, episode: 34 }))).toBe('S12E34');
  });

  it('renders a range for a multi-episode file', () => {
    expect(episodeTag(episode({ season: 1, episode: 5, episodeEnd: 6 }))).toBe('S01E05-E06');
  });

  it('ignores a degenerate episodeEnd (<= episode)', () => {
    expect(episodeTag(episode({ season: 2, episode: 3, episodeEnd: 3 }))).toBe('S02E03');
  });

  it('returns an empty string when unnumbered', () => {
    expect(episodeTag(episode({ season: null, episode: 5 }))).toBe('');
    expect(episodeTag(episode({ season: 1, episode: null }))).toBe('');
  });
});

describe('playerSubtitle', () => {
  it('joins show title and the S/E tag for an episode', () => {
    expect(playerSubtitle(episode({ showTitle: 'Severance', season: 1, episode: 5 }))).toBe(
      'Severance · S01E05',
    );
  });

  it('falls back to just the tag when the show title is missing', () => {
    expect(playerSubtitle(episode({ showTitle: null, season: 3, episode: 2 }))).toBe('S03E02');
  });

  it('uses the movie meta line for non-episodes', () => {
    expect(playerSubtitle(MOVIE)).toBe(metaLine(MOVIE));
  });

  it('falls back to the meta line for an episode with neither show nor numbering', () => {
    const orphan = episode({ showTitle: null, season: null, episode: null });
    expect(playerSubtitle(orphan)).toBe(metaLine(orphan));
  });
});

// The pixel ratio is read from the global at call time, so a stub must not leak
// into the next test.
afterEach(() => vi.unstubAllGlobals());

describe('sizedImageUrl', () => {
  // jsdom reports a ratio of 1, which is also what a 1920x1080 television
  // reports.
  it('asks for the display width on a 1x screen (a television)', () => {
    expect(sizedImageUrl('/api/images/abc.webp', 200)).toBe('/api/images/abc.webp?w=240');
  });

  it('asks for 2x on a retina screen', () => {
    vi.stubGlobal('devicePixelRatio', 2);
    expect(sizedImageUrl('/api/images/abc.webp', 200)).toBe('/api/images/abc.webp?w=480');
  });

  it('caps the ratio at 2, so a 3x phone does not decode 3x the pixels', () => {
    vi.stubGlobal('devicePixelRatio', 3);
    expect(sizedImageUrl('/api/images/abc.webp', 200)).toBe('/api/images/abc.webp?w=480');
  });

  it('snaps neighbouring display widths onto one rendition', () => {
    expect(sizedImageUrl('/api/images/x', 100.4)).toBe('/api/images/x?w=160');
    expect(sizedImageUrl('/api/images/x', 0)).toBe('/api/images/x?w=160');
  });

  it('caps a full-screen ask at the widest rendition the server keeps', () => {
    expect(sizedImageUrl('/api/images/abc.webp', 1920)).toBe('/api/images/abc.webp?w=1280');
    vi.stubGlobal('devicePixelRatio', 2);
    expect(sizedImageUrl('/api/images/abc.webp', 960)).toBe('/api/images/abc.webp?w=1280');
  });

  it('honours the artwork-quality setting, like the client art helpers', () => {
    expect(sizedImageUrl('/api/images/abc.webp', 320, 0.5)).toBe('/api/images/abc.webp?w=160');
  });

  it('passes through remote, non-image, already-queried, and empty URLs', () => {
    expect(sizedImageUrl('https://image.tmdb.org/p/x.jpg', 200)).toBe(
      'https://image.tmdb.org/p/x.jpg',
    );
    expect(sizedImageUrl('/api/other/y', 200)).toBe('/api/other/y');
    expect(sizedImageUrl('/api/images/x?v=2', 200)).toBe('/api/images/x?v=2');
    expect(sizedImageUrl(null, 200)).toBeNull();
    expect(sizedImageUrl(undefined, 200)).toBeNull();
  });
});

describe('hueFromString', () => {
  it('is deterministic and always a hue on the wheel', () => {
    expect(hueFromString('the-matrix')).toBe(hueFromString('the-matrix'));
    for (const s of ['', 'a', 'K-Drama', 'science-fiction', '🎬 émission']) {
      const hue = hueFromString(s);
      expect(hue).toBeGreaterThanOrEqual(0);
      expect(hue).toBeLessThan(360);
    }
  });

  it('is the hash behind posterColors, rounded to the nearest of its hues', () => {
    const hue = (Math.round(hueFromString('tt123') / 15) * 15) % 360;

    expect(posterColors('tt123')[0]).toBe(`hsl(${hue} 38% 26%)`);
  });
});

describe('posterColors', () => {
  it('is deterministic for a given id', () => {
    expect(posterColors('tt123')).toEqual(posterColors('tt123'));
  });

  it('produces two valid, 40-degree-offset hsl stops', () => {
    const [a, b] = posterColors('the-matrix');
    const hueA = Number(/hsl\((\d+)/.exec(a)?.[1]);
    const hueB = Number(/hsl\((\d+)/.exec(b)?.[1]);
    expect(a).toMatch(/^hsl\(\d+ 38% 26%\)$/);
    expect(b).toMatch(/^hsl\(\d+ 50% 12%\)$/);
    expect(hueB).toBe((hueA + 40) % 360);
  });

  it('handles an empty id', () => {
    const [a] = posterColors('');
    expect(a).toBe('hsl(0 38% 26%)');
  });

  it('draws every title from the same 24 fills', () => {
    const ids = Array.from({ length: 2000 }, (_, at) => `title-${at}`);

    const fills = new Set(ids.map((id) => posterColors(id).join()));

    expect(fills.size).toBe(24);
  });
});

describe('codecLabel', () => {
  it('maps known codecs to display names', () => {
    expect(codecLabel('hevc')).toBe('H.265');
    expect(codecLabel('h264')).toBe('H.264');
    expect(codecLabel('av1')).toBe('AV1');
    expect(codecLabel('vp9')).toBe('VP9');
  });

  it('upper-cases an unknown codec', () => {
    expect(codecLabel('mpeg2')).toBe('MPEG2');
  });
});

describe('qualityBadgeForVideo', () => {
  const v = (p: Partial<VideoTrack>): VideoTrack => p as VideoTrack;

  it('prefers HDR, then 4K, then H.265', () => {
    expect(qualityBadgeForVideo(v({ hdr: true, width: 3840, codec: 'hevc' }))).toBe('HDR');
    expect(qualityBadgeForVideo(v({ width: 3840, codec: 'hevc' }))).toBe('4K');
    expect(qualityBadgeForVideo(v({ width: 1920, codec: 'hevc' }))).toBe('H.265');
  });

  it('returns null for a plain SD/HD h264 track or no track', () => {
    expect(qualityBadgeForVideo(v({ width: 1920, codec: 'h264' }))).toBeNull();
    expect(qualityBadgeForVideo(null)).toBeNull();
    expect(qualityBadgeForVideo(undefined)).toBeNull();
  });

  it('does not claim 4K for a track whose width was never probed', () => {
    expect(qualityBadgeForVideo(v({ codec: 'hevc' }))).toBe('H.265');
    expect(qualityBadgeForVideo(v({ codec: 'h264' }))).toBeNull();
  });

  it('qualityBadge reads the item video', () => {
    expect(qualityBadge({ video: { codec: 'hevc', width: 3840 } } as unknown as MediaItem)).toBe(
      '4K',
    );
  });
});

describe('langCode', () => {
  it('upper-cases the first two letters', () => {
    expect(langCode('fra')).toBe('FR');
    expect(langCode('en')).toBe('EN');
  });

  it('returns ST for a missing language', () => {
    expect(langCode(null)).toBe('ST');
    expect(langCode(undefined)).toBe('ST');
    expect(langCode('')).toBe('ST');
  });
});

describe('channelLabel', () => {
  it('labels common layouts', () => {
    expect(channelLabel(1)).toBe('Mono');
    expect(channelLabel(2)).toBe('2.0');
    expect(channelLabel(6)).toBe('5.1');
    expect(channelLabel(8)).toBe('7.1');
    expect(channelLabel(4)).toBe('4.0');
  });

  it('returns null / Mono for degenerate counts', () => {
    expect(channelLabel(0)).toBeNull();
    expect(channelLabel(null)).toBeNull();
    expect(channelLabel(undefined)).toBeNull();
  });
});

describe('commitLabel', () => {
  it('flags a commit built from a dirty tree, since the hash no longer describes it', () => {
    expect(commitLabel('a1b2c3d', false)).toBe('a1b2c3d');
    expect(commitLabel('a1b2c3d', true)).toBe('a1b2c3d-dirty');
  });

  it('is null without a commit', () => {
    expect(commitLabel(null, true)).toBeNull();
    expect(commitLabel(undefined, false)).toBeNull();
    expect(commitLabel('', false)).toBeNull();
  });
});

describe('repoLabel', () => {
  it('trims the scheme, leaving something a viewer can type elsewhere', () => {
    expect(repoLabel('https://github.com/owner/repo')).toBe('github.com/owner/repo');
    expect(repoLabel('http://git.local/owner/repo')).toBe('git.local/owner/repo');
    expect(repoLabel('github.com/owner/repo')).toBe('github.com/owner/repo');
  });

  it('is null without a repository', () => {
    expect(repoLabel(null)).toBeNull();
    expect(repoLabel(undefined)).toBeNull();
  });
});

describe('formatBuildDate', () => {
  it('writes the stamp in the reader locale', () => {
    expect(formatBuildDate('2026-03-04T09:05:00Z', 'en-US')).toContain('Mar 4, 2026');
  });

  it('is null without a stamp', () => {
    expect(formatBuildDate(null, 'en-US')).toBeNull();
    expect(formatBuildDate('', 'en-US')).toBeNull();
  });

  it('shows an unparseable stamp verbatim rather than nothing', () => {
    expect(formatBuildDate('built yesterday', 'en-US')).toBe('built yesterday');
  });

  it('falls back to ISO when the runtime rejects the locale', () => {
    expect(formatBuildDate('2026-03-04T09:05:00Z', 'not a language tag')).toBe(
      '2026-03-04T09:05:00.000Z',
    );
  });
});

describe('resolveImageUrl', () => {
  it('passes absolute URLs through and resolves paths against the origin', () => {
    expect(resolveImageUrl('http://kroma.local:4040', 'https://cdn/img.jpg')).toBe(
      'https://cdn/img.jpg',
    );
    expect(resolveImageUrl('http://kroma.local:4040', '/api/images/x')).toBe(
      'http://kroma.local:4040/api/images/x',
    );
    expect(resolveImageUrl('http://kroma.local:4040', null)).toBeNull();
  });
});

describe('posterGradient', () => {
  it('is deterministic for a given seed', () => {
    expect(posterGradient('Dune')).toBe(posterGradient('Dune'));
  });

  it('differs for different seeds and is a CSS gradient', () => {
    const a = posterGradient('Dune');

    expect(a.startsWith('radial-gradient(')).toBe(true);
    expect(a).toContain('linear-gradient(');
    expect(a).not.toBe(posterGradient('Arrival'));
  });
});

describe('formatRuntime', () => {
  it('formats hours and zero-padded minutes', () => {
    expect(formatRuntime(7620000)).toBe('2h07'); // 127 min
    expect(formatRuntime(3600000)).toBe('1h00'); // exactly 1h
    expect(formatRuntime(3660000)).toBe('1h01');
  });

  it('formats sub-hour durations as minutes only', () => {
    expect(formatRuntime(2820000)).toBe('47min');
    expect(formatRuntime(60000)).toBe('1min');
  });

  it('rounds to the nearest minute', () => {
    // 89 s rounds to 1 min.
    expect(formatRuntime(89000)).toBe('1min');
    // 29 s rounds to 0 min.
    expect(formatRuntime(29000)).toBe('0min');
  });

  it('returns an empty string for missing / non-positive durations', () => {
    expect(formatRuntime(0)).toBe('');
    expect(formatRuntime(-5000)).toBe('');
    expect(formatRuntime(null)).toBe('');
    expect(formatRuntime(undefined)).toBe('');
  });
});
