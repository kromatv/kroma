// @vitest-environment jsdom

import type { MediaItem, SubtitleTrack } from '@kromatv/client/media';
import { fakeClient } from '@kromatv/client/test';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useSubtitleSelection } from './useSubtitleSelection';

const client = fakeClient({
  subtitles: { downloaded: async () => [] },
  media: {
    subtitleUrl: (id, index) => `/sub/${id}/${index}.vtt`,
    item: () => Promise.reject(new Error('unreachable')),
  },
});

/** Index 1 is a PICTURE sub (PGS): French, but not renderable as text - the
 * preference must skip it and land on the text track at index 2. */
const item = {
  id: 'ep1',
  subtitles: [
    { language: 'eng', codec: 'subrip' },
    { language: 'fra', codec: 'hdmv_pgs_subtitle' },
    { language: 'fre', codec: 'subrip' },
  ],
} as unknown as MediaItem;

// The hook fetches generated subtitles in an effect, and the re-render that
// promise triggers is queued as a macrotask: after vitest tears jsdom down,
// react-dom reaches for `window`, finds nothing, and throws into an already-
// passed test (an uncaught exception, not a failure, but it still fails CI).
// Unmounting cancels the work; the tick lets anything already queued run
// while `window` still exists.
afterEach(() => new Promise((resolve) => setTimeout(resolve, 0)));

const serving = (tracks: SubtitleTrack[]) =>
  fakeClient({
    subtitles: { downloaded: async () => [] },
    media: {
      subtitleUrl: (id, index) => `/sub/${id}/${index}.vtt`,
      item: async (id) => ({ id, subtitles: tracks }) as MediaItem,
    },
  });

const active = (pref?: string | null) => {
  const { result, unmount } = renderHook(() => useSubtitleSelection(client, item, pref));
  const selected = result.current.active;
  unmount();
  return selected;
};

describe('useSubtitleSelection preferred language', () => {
  it('auto-enables the renderable track matching the preference', () => {
    // "fre" on the track, "fr" on the account: both normalize to fr.
    expect(active('fr')).toBe(2);
    expect(active('en')).toBe(0);
  });

  it('leaves subtitles off without a preference, for "off", or with no match', () => {
    expect(active(null)).toBeNull();
    expect(active(undefined)).toBeNull();
    expect(active('off')).toBeNull();
    expect(active('de')).toBeNull();
  });

  it('auto-enables the full track rather than the forced one', () => {
    const forcedFirst = {
      id: 'ep3',
      subtitles: [
        { language: 'fre', codec: 'subrip', forced: true },
        { language: 'fre', codec: 'subrip', title: 'Complets' },
      ],
    } as unknown as MediaItem;

    const { result, unmount } = renderHook(() => useSubtitleSelection(client, forcedFirst, 'fr'));

    expect(result.current.active).toBe(1);
    unmount();
  });
});

describe('useSubtitleSelection subtitle files beside the film', () => {
  it('offers the files the list response it was handed left out', async () => {
    const { result, unmount } = renderHook(() =>
      useSubtitleSelection(
        serving([...item.subtitles, { language: 'nld', codec: 'subrip' }]),
        item,
      ),
    );

    await waitFor(() => expect(result.current.rendered).toHaveLength(3));

    expect(result.current.rendered.map((s) => s.index)).toEqual([0, 2, 3]);
    unmount();
  });

  it('auto-enables a language only a file beside the film carries', async () => {
    const dutch = { id: 'ep4', subtitles: [{ language: 'eng', codec: 'subrip' }] } as MediaItem;

    const { result, unmount } = renderHook(() =>
      useSubtitleSelection(
        serving([...dutch.subtitles, { language: 'nld', codec: 'subrip' }]),
        dutch,
        'nl',
      ),
    );

    await waitFor(() => expect(result.current.active).toBe(1));
    unmount();
  });
});

describe('useSubtitleSelection failed tracks', () => {
  it('drops a failed track from the list and turns subtitles off when it was active', () => {
    const { result, unmount } = renderHook(() => useSubtitleSelection(client, item, 'fr'));

    act(() => result.current.drop(2));

    expect(result.current.active).toBeNull();
    expect(result.current.rendered.map((s) => s.index)).toEqual([0]);
    unmount();
  });

  it('forgets the failures once another item plays in place', () => {
    const next = { ...item, id: 'ep2' } as MediaItem;
    const { result, rerender, unmount } = renderHook(
      ({ current }) => useSubtitleSelection(client, current, null),
      { initialProps: { current: item } },
    );

    act(() => result.current.drop(0));
    rerender({ current: next });

    expect(result.current.rendered.map((s) => s.index)).toEqual([0, 2]);
    unmount();
  });
});
