// @vitest-environment jsdom

import type { StoryboardManifest } from '@kromatv/client/media';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type StoryboardSheet, useStoryboardSheet } from './storyboard';

const prefetch = vi.hoisted(() => vi.fn(async () => true));
vi.mock('react-native', async (real) => {
  const actual = (await real()) as Record<string, unknown>;
  return { ...actual, Image: { ...(actual.Image as object), prefetch } };
});

const manifest = (over: Partial<StoryboardManifest> = {}): StoryboardManifest => ({
  url: '/art/sheet.jpg',
  interval: 10,
  tileW: 160,
  tileH: 90,
  cols: 5,
  rows: 2,
  count: 10,
  duration: 100,
  ...over,
});

const settle = () => act(async () => undefined);

beforeEach(() => {
  prefetch.mockClear();
  prefetch.mockResolvedValue(true);
});

afterEach(() => vi.restoreAllMocks());

describe('a sheet still being drawn', () => {
  const drawing = (over: Partial<StoryboardSheet> = {}): StoryboardSheet => ({
    ...manifest(),
    url: 'https://server/sheet.jpg?v=1',
    ready: '1100000000',
    ...over,
  });

  async function shown(sheet: StoryboardSheet) {
    const hook = renderHook((next: StoryboardSheet) => useStoryboardSheet(next), {
      initialProps: sheet,
    });
    await waitFor(() => expect(hook.result.current.ready).toBe(true));
    return hook;
  }

  it('draws a tile once the web loader, which answers nothing, has the sheet', async () => {
    prefetch.mockResolvedValue(undefined as unknown as boolean);

    const { result } = await shown(drawing());

    expect(result.current.tile(15, 160)).not.toBeNull();
  });

  it('draws a tile the sheet has drawn', async () => {
    const { result } = await shown(drawing());

    const tile = result.current.tile(15, 160);

    expect(tile).toMatchObject({ sheet: 'https://server/sheet.jpg?v=1', offsetX: -160 });
  });

  it('draws no thumbnail for a tile the sheet has not reached', async () => {
    const { result } = await shown(drawing());

    const tile = result.current.tile(25, 160);

    expect(tile).toBeNull();
  });

  it('keeps drawing from the last sheet while a newer one loads', async () => {
    const { result, rerender } = await shown(drawing());
    prefetch.mockReturnValue(new Promise<boolean>(() => {}));

    rerender(drawing({ url: 'https://server/sheet.jpg?v=2', ready: '1110000000' }));
    await settle();

    expect(result.current.tile(15, 160)?.sheet).toBe('https://server/sheet.jpg?v=1');
    expect(result.current.tile(25, 160)).toBeNull();
  });

  it('takes a newer sheet over once its picture has loaded', async () => {
    const { result, rerender } = await shown(drawing());

    rerender(drawing({ url: 'https://server/sheet.jpg?v=2', ready: '1110000000' }));
    await waitFor(() => expect(result.current.tile(25, 160)).not.toBeNull());

    expect(result.current.tile(25, 160)?.sheet).toBe('https://server/sheet.jpg?v=2');
  });

  it('does not fetch a sheet it already shows a second time', async () => {
    const { rerender } = await shown(drawing());

    rerender(drawing());
    await settle();

    expect(prefetch).toHaveBeenCalledTimes(1);
  });
});
