import type { KromaClient, MediaItem } from '@kroma/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const downloadAsync = vi.hoisted(() => vi.fn(async (_url: string, _path: string) => ({})));
// `documentDirectory` is needed too: ./store reads it at module scope.
vi.mock('expo-file-system/legacy', () => ({
  downloadAsync,
  documentDirectory: 'file:///data/',
  makeDirectoryAsync: vi.fn(async () => undefined),
  getInfoAsync: vi.fn(async () => ({ exists: false })),
  readAsStringAsync: vi.fn(async () => '[]'),
  writeAsStringAsync: vi.fn(async () => undefined),
  deleteAsync: vi.fn(async () => undefined),
}));

import { fetchSidecars } from './sidecars';

const item = (codecs: string[]): MediaItem =>
  ({
    id: 'itm_1',
    subtitles: codecs.map((codec, i) => ({ codec, language: `l${i}` })),
  }) as MediaItem;

function client(over: Partial<Record<string, unknown>> = {}): KromaClient {
  return {
    subtitleUrl: (id: string, index: number) => `https://kroma.test/sub/${id}/${index}`,
    downloadedSubtitles: async () => [],
    storyboard: async () => null,
    resolveArt: (url: string) => url,
    ...over,
  } as unknown as KromaClient;
}

beforeEach(() => {
  vi.clearAllMocks();
  downloadAsync.mockResolvedValue({});
});

describe('embedded subtitle tracks', () => {
  it('takes the text ones offline, keeping their track index', async () => {
    const { subs } = await fetchSidecars(client(), item(['subrip', 'ass']));
    expect(subs.map((s) => s.index)).toEqual([0, 1]);
    expect(subs[0]?.path).toContain('itm_1');
    expect(subs[0]?.path).toMatch(/\.e0\.vtt$/);
  });

  it('skips image subtitles, which cannot be converted at all', async () => {
    const { subs } = await fetchSidecars(client(), item(['hdmv_pgs_subtitle', 'dvd_subtitle']));
    expect(subs).toEqual([]);
    expect(downloadAsync).not.toHaveBeenCalled();
  });

  it('keeps the ORIGINAL index when an earlier track is skipped', async () => {
    const { subs } = await fetchSidecars(client(), item(['hdmv_pgs_subtitle', 'subrip']));
    expect(subs).toHaveLength(1);
    expect(subs[0]?.index).toBe(1);
  });

  it('carries the language through', async () => {
    const { subs } = await fetchSidecars(client(), item(['subrip']));
    expect(subs[0]?.language).toBe('l0');
  });

  it('keeps the tracks it CAN fetch when one fails', async () => {
    downloadAsync.mockImplementation(async (_url: string, path: string) => {
      if (path.endsWith('e0.vtt')) throw new Error('404');
      return {};
    });
    const { subs } = await fetchSidecars(client(), item(['subrip', 'subrip']));
    expect(subs.map((s) => s.index)).toEqual([1]);
  });

  it('survives every track failing', async () => {
    downloadAsync.mockRejectedValue(new Error('offline'));
    const { subs } = await fetchSidecars(client(), item(['subrip', 'ass']));
    expect(subs).toEqual([]);
  });
});

describe('server-generated subtitles', () => {
  it('takes them offline, marked as AI and labelled', async () => {
    const { subs } = await fetchSidecars(
      client({
        downloadedSubtitles: async () => [
          { url: '/gen/0.vtt', language: 'en', label: 'English (AI)' },
        ],
      }),
      item([]),
    );
    expect(subs[0]).toMatchObject({ language: 'en', label: 'English (AI)', ai: true });
  });

  it('offsets their index past any embedded track', async () => {
    const { subs } = await fetchSidecars(
      client({
        downloadedSubtitles: async () => [
          { url: '/gen/0.vtt', language: 'en' },
          { url: '/gen/1.vtt', language: 'fr' },
        ],
      }),
      item(['subrip', 'ass']),
    );
    // Two index namespaces land in one picker; without the offset, picking the
    // generated English plays embedded track 0.
    expect(subs.map((s) => s.index)).toEqual([0, 1, 1000, 1001]);
    expect(new Set(subs.map((s) => s.index)).size).toBe(subs.length);
  });

  it('resolves a relative url against the server', async () => {
    const resolveArt = vi.fn((url: string) => `https://kroma.test${url}`);
    await fetchSidecars(
      client({
        resolveArt,
        downloadedSubtitles: async () => [{ url: '/gen/0.vtt', language: 'en' }],
      }),
      item([]),
    );
    expect(downloadAsync).toHaveBeenCalledWith(
      'https://kroma.test/gen/0.vtt',
      expect.stringContaining('itm_1'),
    );
  });

  it('falls back to the raw url when nothing resolves it', async () => {
    await fetchSidecars(
      client({
        resolveArt: () => null,
        downloadedSubtitles: async () => [{ url: 'https://cdn.test/g.vtt', language: 'en' }],
      }),
      item([]),
    );
    expect(downloadAsync).toHaveBeenCalledWith('https://cdn.test/g.vtt', expect.any(String));
  });

  it('keeps the embedded tracks when the generated list cannot be fetched', async () => {
    const { subs } = await fetchSidecars(
      client({
        downloadedSubtitles: async () => {
          throw new Error('offline');
        },
      }),
      item(['subrip']),
    );
    expect(subs.map((s) => s.index)).toEqual([0]);
  });
});

describe('the storyboard', () => {
  it('takes the sprite offline with its manifest', async () => {
    const manifest = { url: '/sb/itm_1.jpg', cols: 10, rows: 10 };
    const { storyboard } = await fetchSidecars(
      client({ storyboard: async () => manifest }),
      item([]),
    );
    expect(storyboard?.manifest).toBe(manifest);
    expect(storyboard?.spritePath).toMatch(/itm_1\.sb\.img$/);
  });

  it('takes nothing when the server has none', async () => {
    const { storyboard } = await fetchSidecars(client({ storyboard: async () => null }), item([]));
    expect(storyboard).toBeUndefined();
    expect(downloadAsync).not.toHaveBeenCalled();
  });

  it('takes nothing while the server is still building one', async () => {
    const { storyboard } = await fetchSidecars(
      client({ storyboard: async () => 'pending' }),
      item([]),
    );
    expect(storyboard).toBeUndefined();
    expect(downloadAsync).not.toHaveBeenCalled();
  });

  it('falls back to the raw sprite url when nothing resolves it', async () => {
    await fetchSidecars(
      client({
        resolveArt: () => null,
        storyboard: async () => ({ url: 'https://cdn.test/sb.jpg' }),
      }),
      item([]),
    );
    expect(downloadAsync).toHaveBeenCalledWith('https://cdn.test/sb.jpg', expect.any(String));
  });

  it('gives up quietly when the sprite cannot be fetched', async () => {
    downloadAsync.mockRejectedValue(new Error('offline'));
    const { storyboard } = await fetchSidecars(
      client({ storyboard: async () => ({ url: '/sb.jpg' }) }),
      item([]),
    );
    expect(storyboard).toBeUndefined();
  });
});

describe('the two together', () => {
  it('never throws, whatever the server does', async () => {
    downloadAsync.mockRejectedValue(new Error('offline'));
    await expect(
      fetchSidecars(
        client({
          downloadedSubtitles: async () => {
            throw new Error('500');
          },
          storyboard: async () => {
            throw new Error('500');
          },
        }),
        item(['subrip']),
      ),
    ).resolves.toEqual({ subs: [], storyboard: undefined });
  });

  it('fetches subtitles and the storyboard concurrently', async () => {
    let subsStarted = false;
    let storyboardStartedBeforeSubsFinished = false;
    const { subs, storyboard } = await fetchSidecars(
      client({
        downloadedSubtitles: async () => {
          subsStarted = true;
          await new Promise((r) => setTimeout(r, 5));
          return [];
        },
        storyboard: async () => {
          storyboardStartedBeforeSubsFinished = subsStarted;
          return null;
        },
      }),
      item([]),
    );
    expect(storyboardStartedBeforeSubsFinished).toBe(true);
    expect(subs).toEqual([]);
    expect(storyboard).toBeUndefined();
  });
});
