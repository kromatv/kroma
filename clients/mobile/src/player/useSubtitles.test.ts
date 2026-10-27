// @vitest-environment jsdom

import type { MediaItem } from '@kromatv/client/media';
import { fakeClient } from '@kromatv/client/test';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DownloadEntry } from '#mobile/lib/downloads';

const vtt = 'WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nHello\n';
const local = vi.hoisted(() => ({ readAsStringAsync: vi.fn() }));
vi.mock('expo-file-system/legacy', () => local);

import { useSubtitles } from './useSubtitles';

const client = fakeClient({
  media: {
    subtitleUrl: (_id, index) => `https://media.test/${index}.vtt`,
    artwork: { resolve: (url) => url ?? null },
  },
  subtitles: { downloaded: async () => [] },
});

const item = {
  id: 'film',
  subtitles: [
    { language: 'fr', codec: 'hdmv_pgs_subtitle' },
    { language: 'fr', codec: 'subrip', forced: true },
    { language: 'fr', codec: 'subrip' },
  ],
} as MediaItem;

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, text: async () => vtt })),
  );
  local.readAsStringAsync.mockResolvedValue(vtt);
});

afterEach(() => vi.unstubAllGlobals());

describe('subtitle selection on mobile', () => {
  it('prefers full dialogue and preserves source indices after removing image tracks', async () => {
    const { result } = renderHook(() => useSubtitles(client, item, undefined, 'fr'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.active).toBe(2);
    expect(result.current.tracks.map((track) => track.index)).toEqual([1, 2]);
    expect(result.current.tracks[0].forced).toBe(true);
    expect(result.current.tracks[1].nativeSource).toBe('2');
    expect(result.current.cueAt(2)).toBe('Hello');
  });

  it('marks a track unavailable instead of silently showing no subtitles', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, text: async () => 'WEBVTT\n\n' })),
    );
    const { result } = renderHook(() => useSubtitles(client, item));
    act(() => result.current.pick(1));
    await waitFor(() => expect(result.current.failed.has(1)).toBe(true));
    expect(result.current.active).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('retains offline track titles and forced flags without fetching the server', async () => {
    const offline = {
      subs: [
        { index: 1, language: 'fr', title: 'Forced', forced: true, path: 'file:///forced.vtt' },
        { index: 2, language: 'fr', title: 'SDH', path: 'file:///full.vtt' },
      ],
    } as DownloadEntry;
    const { result } = renderHook(() => useSubtitles(client, item, offline, 'fr'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.active).toBe(2);
    expect(result.current.tracks[1].title).toBe('SDH');
    expect(fetch).not.toHaveBeenCalled();
    expect(local.readAsStringAsync).toHaveBeenCalledWith('file:///full.vtt');
  });
});
