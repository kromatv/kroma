import type { AudioTrack, MediaItem } from '@kroma/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  avplayAvailable,
  getAvplay,
  getTauri,
  mpvAvailable,
  renditionFor,
  resolveMasterStart,
} from './engine';

afterEach(() => vi.unstubAllGlobals());

describe('getAvplay / avplayAvailable', () => {
  it('is null / false in a plain browser (no webapis)', () => {
    expect(getAvplay()).toBeNull();
    expect(avplayAvailable()).toBe(false);
  });

  it('returns the native API when webapis.avplay is present', () => {
    const api = { play: () => {} };
    vi.stubGlobal('webapis', { avplay: api });
    expect(getAvplay()).toBe(api);
    expect(avplayAvailable()).toBe(true);
  });
});

describe('getTauri', () => {
  it('is null without the Tauri global', () => {
    expect(getTauri()).toBeNull();
  });

  it('is null when the injected object is incomplete', () => {
    vi.stubGlobal('__TAURI__', { core: { invoke: () => {} } }); // missing event.listen
    expect(getTauri()).toBeNull();
  });

  it('returns the bridge when both core.invoke and event.listen exist', () => {
    const bridge = { core: { invoke: () => {} }, event: { listen: () => {} } };
    vi.stubGlobal('__TAURI__', bridge);
    expect(getTauri()).toBe(bridge);
  });
});

describe('mpvAvailable', () => {
  const tauri = { core: { invoke: () => {} }, event: { listen: () => {} } };

  it('is false when there is no Tauri shell, whatever the platform', () => {
    vi.stubGlobal('navigator', { userAgent: 'X11; Linux x86_64' });
    expect(mpvAvailable()).toBe(false);
  });

  it('is true inside the Linux desktop shell (Deck mpv binary)', () => {
    vi.stubGlobal('__TAURI__', tauri);
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (X11; Linux x86_64)' });
    expect(mpvAvailable()).toBe(true);
  });

  it('excludes Android (Linux UA but Android)', () => {
    vi.stubGlobal('__TAURI__', tauri);
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Linux; Android 14)' });
    expect(mpvAvailable()).toBe(false);
  });

  it('needs the in-process libmpv flag on macOS', () => {
    vi.stubGlobal('__TAURI__', tauri);
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X)' });
    expect(mpvAvailable()).toBe(false);
    vi.stubGlobal('__KROMA_MPV__', true);
    expect(mpvAvailable()).toBe(true);
  });
});

describe('resolveMasterStart', () => {
  it('short-circuits to 0 for a start at/near zero (no fetch)', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    expect(await resolveMasterStart('http://x/master.m3u8', 0)).toBe(0);
    expect(await resolveMasterStart('http://x/master.m3u8', 0.4)).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns the server-reported keyframe start from the X-Hls-Start header', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({ headers: { get: (k: string) => (k === 'X-Hls-Start' ? '12.5' : null) } }),
      ),
    );
    expect(await resolveMasterStart('http://x/master.m3u8', 30)).toBe(12.5);
  });

  it('keeps the requested start when the header is present but non-numeric', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ headers: { get: () => 'not-a-number' } })),
    );
    expect(await resolveMasterStart('http://x/master.m3u8', 30)).toBe(30);
  });

  it('reports 0 when the header is absent (Number(null) is a finite 0)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ headers: { get: () => null } })),
    );
    expect(await resolveMasterStart('http://x/master.m3u8', 30)).toBe(0);
  });

  it('falls back to the requested start when the fetch rejects', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('offline'))),
    );
    expect(await resolveMasterStart('http://x/master.m3u8', 42)).toBe(42);
  });
});

describe('renditionFor', () => {
  const track = (index: number, language: string, isDefault = false): AudioTrack =>
    ({
      index,
      codec: 'eac3',
      channels: 6,
      language,
      title: null,
      default: isDefault,
    }) as AudioTrack;

  const withTracks = (tracks: AudioTrack[]): MediaItem =>
    ({ audio: tracks[0] ?? null, audioTracks: tracks }) as unknown as MediaItem;

  it('resolves the asked-for track from its identity, not its position', () => {
    const item = withTracks([track(1, 'en'), track(3, 'fr'), track(7, 'de')]);
    expect(renditionFor(item, 3)).toBe(3);
    expect(renditionFor(item, 7)).toBe(7);
  });

  it('falls back to the default track when the stored index is gone', () => {
    const item = withTracks([track(1, 'en'), track(3, 'fr', true), track(7, 'de')]);
    expect(renditionFor(item, 99)).toBe(3);
  });

  it('falls back to the first track when nothing is marked default', () => {
    const item = withTracks([track(4, 'en'), track(9, 'fr')]);
    expect(renditionFor(item, 99)).toBe(4);
  });

  it('is the first rendition for an item with no audio at all', () => {
    expect(renditionFor(withTracks([]), 0)).toBe(0);
  });
});
