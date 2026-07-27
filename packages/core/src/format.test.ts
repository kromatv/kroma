import type { AudioTrack, MediaItem, VideoTrack } from '@kroma/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  audioTrackLabel,
  channelLabel,
  codecLabel,
  episodeTag,
  formatTimecode,
  hueFromString,
  langCode,
  langName,
  metaLine,
  playerSubtitle,
  posterColors,
  qualityBadge,
  qualityBadgeForVideo,
  safeImageUrl,
  sizedImageUrl,
} from './format';
import type { Translate } from './i18n';

// Echoes the message key so localized output is asserted by key.
const t: Translate = (key) => key;

// ----- fixtures --------------------------------------------------------------

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

// ----- episodeTag ------------------------------------------------------------

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

// ----- playerSubtitle --------------------------------------------------------

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
});

// ----- sizedImageUrl ---------------------------------------------------------

// The pixel ratio is read from the global at call time, so a stub must not leak
// into the next test.
afterEach(() => vi.unstubAllGlobals());

describe('sizedImageUrl', () => {
  /** jsdom reports a ratio of 1, which is also what a 1920x1080 television
   * reports - and asking a television for 2x was four times the pixels it can
   * show, on every backdrop swap. */
  it('asks for the display width on a 1x screen (a television)', () => {
    expect(sizedImageUrl('/api/images/abc.webp', 200)).toBe('/api/images/abc.webp?w=200');
  });

  it('asks for 2x on a retina screen', () => {
    vi.stubGlobal('devicePixelRatio', 2);
    expect(sizedImageUrl('/api/images/abc.webp', 200)).toBe('/api/images/abc.webp?w=400');
  });

  it('caps the ratio at 2, so a 3x phone does not decode 3x the pixels', () => {
    vi.stubGlobal('devicePixelRatio', 3);
    expect(sizedImageUrl('/api/images/abc.webp', 200)).toBe('/api/images/abc.webp?w=400');
  });

  it('rounds and floors the requested width to at least 1', () => {
    expect(sizedImageUrl('/api/images/x', 100.4)).toBe('/api/images/x?w=100');
    expect(sizedImageUrl('/api/images/x', 0)).toBe('/api/images/x?w=1');
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

// ----- hueFromString ---------------------------------------------------------

describe('hueFromString', () => {
  it('is deterministic and always a hue on the wheel', () => {
    expect(hueFromString('the-matrix')).toBe(hueFromString('the-matrix'));
    for (const s of ['', 'a', 'K-Drama', 'science-fiction', '🎬 émission']) {
      const hue = hueFromString(s);
      expect(hue).toBeGreaterThanOrEqual(0);
      expect(hue).toBeLessThan(360);
    }
  });

  it('is the hash behind posterColors', () => {
    expect(posterColors('tt123')[0]).toBe(`hsl(${hueFromString('tt123')} 38% 26%)`);
  });
});

// ----- posterColors ----------------------------------------------------------

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
});

// ----- codecLabel ------------------------------------------------------------

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

// ----- qualityBadge / qualityBadgeForVideo -----------------------------------

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

  it('qualityBadge reads the item video', () => {
    expect(qualityBadge({ video: { codec: 'hevc', width: 3840 } } as unknown as MediaItem)).toBe(
      '4K',
    );
  });
});

// ----- formatTimecode --------------------------------------------------------

describe('formatTimecode', () => {
  it('omits the hour when under an hour', () => {
    expect(formatTimecode(0)).toBe('0:00');
    expect(formatTimecode(9)).toBe('0:09');
    expect(formatTimecode(247)).toBe('4:07');
  });

  it('shows hours with zero-padded minutes above an hour', () => {
    expect(formatTimecode(3847)).toBe('1:04:07');
    expect(formatTimecode(3600)).toBe('1:00:00');
  });

  it('clamps NaN and negatives to zero', () => {
    expect(formatTimecode(-5)).toBe('0:00');
    expect(formatTimecode(Number.NaN)).toBe('0:00');
  });
});

// ----- langCode --------------------------------------------------------------

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

// ----- channelLabel ----------------------------------------------------------

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

// ----- langName --------------------------------------------------------------

describe('langName', () => {
  it('maps 2- and 3-letter ISO codes to a catalog key', () => {
    expect(langName(t, 'fr')).toBe('lang.fr');
    expect(langName(t, 'fra')).toBe('lang.fr');
    expect(langName(t, 'FRE')).toBe('lang.fr');
    expect(langName(t, 'eng')).toBe('lang.en');
  });

  it('upper-cases an unknown code, and returns null when absent', () => {
    expect(langName(t, 'xx')).toBe('XX');
    expect(langName(t, null)).toBeNull();
    expect(langName(t, '')).toBeNull();
  });
});

// ----- audioTrackLabel -------------------------------------------------------

describe('audioTrackLabel', () => {
  const track = (p: Partial<AudioTrack>): AudioTrack => p as AudioTrack;

  it('joins name, channel layout and upper-cased codec', () => {
    expect(audioTrackLabel(t, track({ language: 'fr', channels: 6, codec: 'eac3' }))).toBe(
      'lang.fr · 5.1 · EAC3',
    );
  });

  it('prefers a stream title over the language name', () => {
    expect(
      audioTrackLabel(
        t,
        track({ title: '  Commentary ', language: 'en', channels: 2, codec: 'aac' }),
      ),
    ).toBe('Commentary · 2.0 · AAC');
  });

  it('drops missing parts', () => {
    expect(audioTrackLabel(t, track({ language: 'en', codec: 'aac' }))).toBe('lang.en · AAC');
    expect(audioTrackLabel(t, track({ channels: 2 }))).toBe('2.0');
  });

  it('returns undefined for no track', () => {
    expect(audioTrackLabel(t, null)).toBeUndefined();
    expect(audioTrackLabel(t, undefined)).toBeUndefined();
  });
});

// ----- safeImageUrl ----------------------------------------------------------

describe('safeImageUrl', () => {
  it('passes our own artwork paths through untouched', () => {
    expect(safeImageUrl('/api/images/abc?w=200')).toBe('/api/images/abc?w=200');
    expect(safeImageUrl('poster.jpg')).toBe('poster.jpg');
    expect(safeImageUrl('//cdn.example.com/a.jpg')).toBe('//cdn.example.com/a.jpg');
  });

  it('allows the schemes that only ever paint', () => {
    expect(safeImageUrl('https://image.tmdb.org/t/p/w780/x.jpg')).toBe(
      'https://image.tmdb.org/t/p/w780/x.jpg',
    );
    expect(safeImageUrl('http://nas.local/a.png')).toBe('http://nas.local/a.png');
    expect(safeImageUrl('blob:https://app/9f')).toBe('blob:https://app/9f');
    expect(safeImageUrl('data:image/png;base64,iVBOR')).toBe('data:image/png;base64,iVBOR');
  });

  it('rejects a scheme that navigates or executes', () => {
    expect(safeImageUrl('javascript:alert(1)')).toBeNull();
    // Case and leading whitespace must not sneak one past the check.
    expect(safeImageUrl('  JaVaScRiPt:alert(1)')).toBeNull();
    // data: is narrowed to images - data:text/html is a payload, not artwork.
    expect(safeImageUrl('data:text/html,<script>alert(1)</script>')).toBeNull();
    expect(safeImageUrl('vbscript:msgbox')).toBeNull();
  });

  it('treats absent artwork as absent', () => {
    expect(safeImageUrl(null)).toBeNull();
    expect(safeImageUrl(undefined)).toBeNull();
    expect(safeImageUrl('')).toBeNull();
  });
});
