// @vitest-environment jsdom
//
// Scrub previews: the sprite-sheet manifest, and the tile for a given moment.
//
// The tile maths is the part worth pinning, because every way of getting it
// wrong shows the user a real frame from the wrong place in the film - which
// reads as the scrubber being inaccurate rather than as an arithmetic bug. It
// has to clamp at both ends (dragging past the end of a film is one flick), wrap
// rows by the sheet's column count, and refuse to divide by an interval of zero,
// which is what a manifest for a file with no duration carries.
//
// The other half is WHERE the sheet comes from. An offline title has its sprite
// on disk, and asking the server for one then is both pointless and impossible -
// the phone is on a train. So a local sprite short-circuits the fetch entirely,
// rather than being a fallback after it fails.
//
// The server answers 202 while it is still generating, which the client reports
// as 'pending'. That is a poll, not an error: a title opened seconds after being
// added has no storyboard yet, and giving up means no previews until the player
// is closed and reopened.

import type { KromaClient, MediaItem } from '@kroma/core';
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DownloadEntry } from '#mobile/lib/downloads';
import { useStoryboard } from './useStoryboard';

const POLL_MS = 5000;

const MANIFEST = {
  url: '/sb/itm_1.jpg',
  count: 10,
  interval: 10,
  cols: 5,
  rows: 2,
  tileW: 160,
  tileH: 90,
};

const storyboard = vi.fn(async (_id: string) => MANIFEST as unknown);
const client = {
  storyboard,
  resolveArt: (url: string) => `https://kroma.test${url}`,
} as unknown as KromaClient;

const item = { id: 'itm_1' } as MediaItem;

const offlineWith = (spritePath: string) =>
  ({ storyboard: { manifest: MANIFEST, spritePath } }) as unknown as DownloadEntry;

beforeEach(() => {
  vi.clearAllMocks();
  storyboard.mockResolvedValue(MANIFEST);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('fetching the manifest', () => {
  it('asks for the title being played', async () => {
    renderHook(() => useStoryboard(client, item, true));
    await waitFor(() => expect(storyboard).toHaveBeenCalledWith('itm_1'));
  });

  it('asks for nothing while previews are disabled', () => {
    renderHook(() => useStoryboard(client, item, false));
    expect(storyboard).not.toHaveBeenCalled();
  });

  it('POLLS while the server is still generating', async () => {
    vi.useFakeTimers();
    storyboard.mockResolvedValue('pending');
    renderHook(() => useStoryboard(client, item, true));
    await vi.waitFor(() => expect(storyboard).toHaveBeenCalledOnce());

    // A title opened seconds after being added has no storyboard yet; giving up
    // means no previews until the player is closed and reopened.
    await vi.advanceTimersByTimeAsync(POLL_MS + 100);
    expect(storyboard.mock.calls.length).toBeGreaterThan(1);
  });

  it('stops polling once the sheet exists', async () => {
    vi.useFakeTimers();
    storyboard.mockResolvedValueOnce('pending').mockResolvedValue(MANIFEST);
    renderHook(() => useStoryboard(client, item, true));
    await vi.advanceTimersByTimeAsync(POLL_MS + 100);
    const settled = storyboard.mock.calls.length;

    await vi.advanceTimersByTimeAsync(POLL_MS * 3);
    expect(storyboard.mock.calls).toHaveLength(settled);
  });

  it('stops polling when the player closes', async () => {
    vi.useFakeTimers();
    storyboard.mockResolvedValue('pending');
    const { unmount } = renderHook(() => useStoryboard(client, item, true));
    await vi.waitFor(() => expect(storyboard).toHaveBeenCalledOnce());

    unmount();
    await vi.advanceTimersByTimeAsync(POLL_MS * 3);
    // A poll left running asks the server every five seconds for a film nobody
    // is watching.
    expect(storyboard).toHaveBeenCalledOnce();
  });

  it('gives up quietly when the request fails', async () => {
    storyboard.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useStoryboard(client, item, true));
    await waitFor(() => expect(storyboard).toHaveBeenCalled());
    // No previews is a scrubber without thumbnails, not a broken player.
    expect(result.current(30)).toBeNull();
  });

  it('re-fetches for a different title', async () => {
    const { rerender } = renderHook(({ media }) => useStoryboard(client, media, true), {
      initialProps: { media: item },
    });
    await waitFor(() => expect(storyboard).toHaveBeenCalledOnce());

    rerender({ media: { id: 'itm_2' } as MediaItem });
    await waitFor(() => expect(storyboard).toHaveBeenCalledWith('itm_2'));
  });
});

describe('offline', () => {
  it('uses the sprite on disk WITHOUT asking the server', async () => {
    const { result } = renderHook(() =>
      useStoryboard(client, item, true, offlineWith('file:///sb.img')),
    );
    await Promise.resolve();
    // The phone is on a train; a fetch here is not a fallback, it is a request
    // that cannot succeed.
    expect(storyboard).not.toHaveBeenCalled();
    expect(result.current(0)?.sheet).toBe('file:///sb.img');
  });

  it('starts from the manifest it downloaded', () => {
    const { result } = renderHook(() =>
      useStoryboard(client, item, true, offlineWith('file:///sb.img')),
    );
    // Available on the first frame, with no request to wait for.
    expect(result.current(0)).not.toBeNull();
  });
});

describe('resolving a tile', () => {
  const tileAt = async (seconds: number) => {
    const { result } = renderHook(() => useStoryboard(client, item, true));
    await waitFor(() => expect(result.current(0)).not.toBeNull());
    return result.current(seconds);
  };

  it('resolves the sheet against the server', async () => {
    expect((await tileAt(0))?.sheet).toBe('https://kroma.test/sb/itm_1.jpg');
  });

  it('takes the first tile at the start', async () => {
    expect(await tileAt(0)).toMatchObject({ x: 0, y: 0, tileW: 160, tileH: 90 });
  });

  it('walks along a row by the interval', async () => {
    // 25s / 10s = index 2, still on row 0.
    expect(await tileAt(25)).toMatchObject({ x: 2 * 160, y: 0 });
  });

  it('wraps to the next row at the column count', async () => {
    // index 5 with 5 columns is the start of row 1.
    expect(await tileAt(50)).toMatchObject({ x: 0, y: 90 });
  });

  it('CLAMPS past the end of the film', async () => {
    // Dragging past the end is one flick. Unclamped, this reads past the last
    // tile and shows a slice of empty sheet.
    expect(await tileAt(99_999)).toMatchObject({ x: 4 * 160, y: 90 });
  });

  it('clamps before the start', async () => {
    expect(await tileAt(-30)).toMatchObject({ x: 0, y: 0 });
  });

  it('reports the whole sheet’s size', async () => {
    expect(await tileAt(0)).toMatchObject({ sheetW: 5 * 160, sheetH: 2 * 90 });
  });

  it('has no tile before the manifest arrives', () => {
    storyboard.mockReturnValue(new Promise(() => undefined));
    const { result } = renderHook(() => useStoryboard(client, item, true));
    expect(result.current(30)).toBeNull();
  });

  it('has no tile for an EMPTY storyboard', async () => {
    storyboard.mockResolvedValue({ ...MANIFEST, count: 0 });
    const { result } = renderHook(() => useStoryboard(client, item, true));
    await waitFor(() => expect(storyboard).toHaveBeenCalled());
    expect(result.current(0)).toBeNull();
  });

  it('refuses to divide by a zero interval', async () => {
    // What a manifest for a file with no duration carries; dividing gives
    // Infinity and reads off the end of the sheet.
    storyboard.mockResolvedValue({ ...MANIFEST, interval: 0 });
    const { result } = renderHook(() => useStoryboard(client, item, true));
    await waitFor(() => expect(storyboard).toHaveBeenCalled());
    expect(result.current(30)).toBeNull();
  });

  it('falls back to the raw url when nothing resolves it', async () => {
    const bare = { ...client, resolveArt: () => null } as unknown as KromaClient;
    const { result } = renderHook(() => useStoryboard(bare, item, true));
    await waitFor(() => expect(result.current(0)).not.toBeNull());
    expect(result.current(0)?.sheet).toBe('/sb/itm_1.jpg');
  });
});
