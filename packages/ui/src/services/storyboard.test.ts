// @vitest-environment jsdom
//
// A tile is a window onto one sheet, offset and clipped: React Native has no
// `background-position`, so the CSS spelling renders nothing on Apple TV.

import type { KromaClient, StoryboardManifest } from '@kroma/core';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useStoryboard } from './storyboard';

const prefetch = vi.hoisted(() => vi.fn(async () => true));
vi.mock('react-native', async (real) => {
  const actual = (await real()) as Record<string, unknown>;
  return { ...actual, Image: { ...(actual.Image as object), prefetch } };
});

/** 10 tiles of 160x90, 5 across, one every 10 seconds. */
const manifest = (over: Partial<StoryboardManifest> = {}): StoryboardManifest =>
  ({
    url: '/art/sheet.jpg',
    interval: 10,
    tileW: 160,
    tileH: 90,
    cols: 5,
    rows: 2,
    count: 10,
    ...over,
  }) as StoryboardManifest;

function fakeClient(...pages: (StoryboardManifest | 'pending' | null)[]) {
  let at = 0;
  const storyboard = vi.fn(async () => pages[Math.min(at++, pages.length - 1)] ?? null);
  const resolveArt = vi.fn((u: string) => `https://server${u}`);
  return { client: { storyboard, resolveArt } as unknown as KromaClient, storyboard, resolveArt };
}

const settle = () => act(async () => undefined);

beforeEach(() => {
  // shouldAdvanceTime: waitFor polls on its own timers, which plain fake timers
  // freeze, so every wait would sit there until it timed out.
  vi.useFakeTimers({ shouldAdvanceTime: true });
  prefetch.mockClear();
  prefetch.mockResolvedValue(true);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('loading', () => {
  it('resolves the sheet through the client and preloads it', async () => {
    const { client, resolveArt } = fakeClient(manifest());
    const { result } = renderHook(() => useStoryboard(client, 'item-1'));
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(resolveArt).toHaveBeenCalledWith('/art/sheet.jpg');
    expect(prefetch).toHaveBeenCalledWith('https://server/art/sheet.jpg');
  });

  it('is not ready until the sheet itself has loaded', async () => {
    // A preload that never settles: the manifest is known, the picture is not.
    prefetch.mockReturnValue(new Promise<boolean>(() => {}));
    const { client } = fakeClient(manifest());
    const { result } = renderHook(() => useStoryboard(client, 'item-1'));
    await settle();
    expect(result.current.ready).toBe(false);
    expect(result.current.tile(0, 160)).toBeNull();
  });

  it('stays unready when the sheet cannot be fetched', async () => {
    prefetch.mockRejectedValue(new Error('404'));
    const { client } = fakeClient(manifest());
    const { result } = renderHook(() => useStoryboard(client, 'item-1'));
    await settle();
    expect(result.current.ready).toBe(false);
  });

  it('stays unready when the item has no usable sheet at all', async () => {
    const { client } = fakeClient(null);
    const { result } = renderHook(() => useStoryboard(client, 'item-1'));
    await settle();
    expect(result.current.ready).toBe(false);
    expect(prefetch).not.toHaveBeenCalled();
  });

  it('rides out a failed request', async () => {
    const client = {
      storyboard: vi.fn(async () => {
        throw new Error('offline');
      }),
      resolveArt: vi.fn(),
    } as unknown as KromaClient;
    const { result } = renderHook(() => useStoryboard(client, 'item-1'));
    await settle();
    expect(result.current.ready).toBe(false);
  });
});

describe('polling while the server builds the sheet', () => {
  it('polls until the sheet arrives', async () => {
    const { client, storyboard } = fakeClient('pending', 'pending', manifest());
    const { result } = renderHook(() => useStoryboard(client, 'item-1'));
    await settle();
    expect(storyboard).toHaveBeenCalledTimes(1);
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });
    await waitFor(() => expect(result.current.ready).toBe(true));
  });

  it('stops polling once resolved', async () => {
    const { client, storyboard } = fakeClient(manifest());
    renderHook(() => useStoryboard(client, 'item-1'));
    await settle();
    const after = storyboard.mock.calls.length;
    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    expect(storyboard).toHaveBeenCalledTimes(after);
  });

  // Dashboard thumbnails must not compete with live-playback IO.
  it('never polls when generation is off', async () => {
    const { client, storyboard } = fakeClient('pending');
    renderHook(() => useStoryboard(client, 'item-1', { generate: false }));
    await settle();
    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    expect(storyboard).toHaveBeenCalledTimes(1);
  });

  // Never a dead stop: a slow NAS can finish late.
  it('backs off after the fast window instead of stopping', async () => {
    const { client, storyboard } = fakeClient('pending');
    renderHook(() => useStoryboard(client, 'item-1'));
    await settle();
    for (let i = 0; i < 40; i++) {
      await act(async () => {
        vi.advanceTimersByTime(1500);
      });
    }
    const fast = storyboard.mock.calls.length;
    expect(fast).toBeGreaterThan(20);
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });
    expect(storyboard).toHaveBeenCalledTimes(fast);
    await act(async () => {
      vi.advanceTimersByTime(15_000);
    });
    expect(storyboard.mock.calls.length).toBeGreaterThan(fast);
  });

  it('stops polling on unmount', async () => {
    const { client, storyboard } = fakeClient('pending');
    const { unmount } = renderHook(() => useStoryboard(client, 'item-1'));
    await settle();
    unmount();
    const after = storyboard.mock.calls.length;
    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    expect(storyboard).toHaveBeenCalledTimes(after);
  });

  it('re-checks when the tab comes back', async () => {
    const { client, storyboard } = fakeClient('pending');
    renderHook(() => useStoryboard(client, 'item-1'));
    await settle();
    const before = storyboard.mock.calls.length;
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(storyboard.mock.calls.length).toBeGreaterThan(before);
  });
});

describe('tile geometry', () => {
  async function ready(over: Partial<StoryboardManifest> = {}) {
    const { client } = fakeClient(manifest(over));
    const hook = renderHook(() => useStoryboard(client, 'item-1'));
    await waitFor(() => expect(hook.result.current.ready).toBe(true));
    return hook.result;
  }

  it('draws the first tile from the sheet origin', async () => {
    const result = await ready();
    expect(result.current.tile(0, 160)).toMatchObject({
      width: 160,
      height: 90,
      scale: 1,
      offsetX: -0,
      offsetY: -0,
      sheetWidth: 800,
      sheetHeight: 180,
    });
  });

  it('walks along the row as the position advances', async () => {
    const result = await ready();
    // 25s / 10s per tile = index 2, third column.
    expect(result.current.tile(25, 160)).toMatchObject({ offsetX: -320, offsetY: -0 });
  });

  it('wraps onto the next row past the last column', async () => {
    const result = await ready();
    // index 5 = row 1, col 0.
    expect(result.current.tile(50, 160)).toMatchObject({ offsetX: -0, offsetY: -90 });
  });

  it('scales the offsets with the requested width', async () => {
    const result = await ready();
    expect(result.current.tile(25, 80)).toMatchObject({
      width: 80,
      height: 45,
      scale: 0.5,
      offsetX: -160,
    });
  });

  it('clamps a position past the end to the last tile', async () => {
    const result = await ready();
    expect(result.current.tile(99_999, 160)).toMatchObject({ offsetX: -640, offsetY: -90 });
  });

  it('clamps a negative position to the first tile', async () => {
    const result = await ready();
    expect(result.current.tile(-5, 160)).toMatchObject({ offsetX: -0, offsetY: -0 });
  });
});
