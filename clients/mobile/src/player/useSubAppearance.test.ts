// @vitest-environment jsdom
//
// Subtitle appearance on the phone: same contract as web/TV, but hydrated
// async (React Native has no synchronous storage): starts from defaults,
// then a stored preference is MERGED over them rather than replacing them,
// and a value that will not parse falls back to defaults quietly.

import { renderHook, waitFor } from '@testing-library/react';
import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const loadPref = vi.hoisted(() => vi.fn(async (_key: string) => null as string | null));
const savePref = vi.hoisted(() => vi.fn(async (_key: string, _value: string) => undefined));
vi.mock('#mobile/lib/storage', () => ({ loadPref, savePref }));

import { DEFAULT_SUB_APPEARANCE } from '@kroma/ui';
import { useSubAppearance } from './useSubAppearance';

const KEY = 'subtitleStyle';

function written() {
  const call = savePref.mock.calls.at(-1);
  if (!call) throw new Error('nothing was persisted');
  return JSON.parse(call[1]) as Record<string, unknown>;
}

beforeEach(() => {
  vi.clearAllMocks();
  loadPref.mockResolvedValue(null);
});

describe('before the stored preference arrives', () => {
  it('is already a usable style', () => {
    loadPref.mockReturnValue(new Promise(() => undefined));
    const { result } = renderHook(() => useSubAppearance());
    // The player draws subtitles on the first frame; an empty object here is an
    // unstyled caption for as long as the read takes.
    expect(result.current[0]).toEqual(DEFAULT_SUB_APPEARANCE);
  });
});

describe('hydrating', () => {
  it('reads the one key it owns', async () => {
    renderHook(() => useSubAppearance());
    await waitFor(() => expect(loadPref).toHaveBeenCalledWith(KEY));
  });

  it('applies what was stored', async () => {
    loadPref.mockResolvedValue(JSON.stringify({ size: 'lg' }));
    const { result } = renderHook(() => useSubAppearance());
    await waitFor(() => expect(result.current[0]).toMatchObject({ size: 'lg' }));
  });

  it('MERGES over the defaults rather than replacing them', async () => {
    loadPref.mockResolvedValue(JSON.stringify({ size: 'lg' }));
    const { result } = renderHook(() => useSubAppearance());
    await waitFor(() => expect(result.current[0]).toMatchObject({ size: 'lg' }));

    // A preference written by an older build knows nothing about a field added
    // since; replacing wholesale leaves it undefined, which on a subtitle style
    // is an invisible caption rather than an error.
    expect(Object.keys(result.current[0]).sort()).toEqual(
      Object.keys(DEFAULT_SUB_APPEARANCE).sort(),
    );
  });

  // A phone used before the renderer took on CEA-708 may have `box` or
  // `outline` on disk; spread raw, those reach the cue's edge table as
  // `undefined` and throw inside render; with no ErrorBoundary here, the
  // player unmounts and repeats the crash on every re-entry.
  it('migrates a preference written before CEA-708 instead of crashing on it', async () => {
    loadPref.mockResolvedValue(JSON.stringify({ edge: 'outline', font: 'serif', size: 'lg' }));
    const { result } = renderHook(() => useSubAppearance());
    await waitFor(() =>
      expect(result.current[0]).toMatchObject({ edge: 'uniform', font: 'propSerif', size: 'lg' }),
    );
  });

  // The old `box` edge WAS the background. Dropping it would silently take away
  // a background the viewer chose; keeping it raw would paint one behind every
  // cue that the phone's sheet offers no control to remove.
  it('carries the retired box edge over to the background layer', async () => {
    loadPref.mockResolvedValue(JSON.stringify({ edge: 'box', bgOpacity: 60 }));
    const { result } = renderHook(() => useSubAppearance());
    await waitFor(() =>
      expect(result.current[0]).toMatchObject({ edge: 'none', bgOpacity: 60, bgColor: '#000000' }),
    );
  });

  it('keeps the defaults when nothing is stored', async () => {
    loadPref.mockResolvedValue(null);
    const { result } = renderHook(() => useSubAppearance());
    await waitFor(() => expect(loadPref).toHaveBeenCalled());
    expect(result.current[0]).toEqual(DEFAULT_SUB_APPEARANCE);
  });

  it('keeps the defaults when the value will not parse', async () => {
    loadPref.mockResolvedValue('{not json');
    const { result } = renderHook(() => useSubAppearance());
    await waitFor(() => expect(loadPref).toHaveBeenCalled());
    // There is no screen on which to report this, and a player that refuses to
    // start over a preference is the worse outcome.
    expect(result.current[0]).toEqual(DEFAULT_SUB_APPEARANCE);
  });

  it('keeps the defaults when the read itself fails', async () => {
    loadPref.mockRejectedValue(new Error('keychain locked'));
    const { result } = renderHook(() => useSubAppearance());
    await waitFor(() => expect(loadPref).toHaveBeenCalled());
    expect(result.current[0]).toEqual(DEFAULT_SUB_APPEARANCE);
  });

  it('does not apply a value that lands after the player is gone', async () => {
    const holder: { fire: ((raw: string | null) => void) | null } = { fire: null };
    loadPref.mockImplementation(
      () =>
        new Promise<string | null>((resolve) => {
          holder.fire = resolve;
        }),
    );
    const { result, unmount } = renderHook(() => useSubAppearance());
    await waitFor(() => expect(loadPref).toHaveBeenCalled());

    unmount();
    holder.fire?.(JSON.stringify({ size: 'lg' }));
    await Promise.resolve();
    expect(result.current[0]).toEqual(DEFAULT_SUB_APPEARANCE);
  });

  it('reads once, not on every render', async () => {
    const { rerender } = renderHook(() => useSubAppearance());
    await waitFor(() => expect(loadPref).toHaveBeenCalledOnce());
    rerender();
    rerender();
    // The player re-renders constantly; a keychain read per render is a read
    // per frame of the progress bar.
    expect(loadPref).toHaveBeenCalledOnce();
  });
});

describe('changing a setting', () => {
  it('applies it immediately', async () => {
    const { result } = renderHook(() => useSubAppearance());
    act(() => result.current[1]({ size: 'lg' }));
    // The settings panel is on top of the running film; the change has to show
    // on the next frame, not after a round trip to the keychain.
    expect(result.current[0]).toMatchObject({ size: 'lg' });
  });

  it('keeps everything it was not asked to change', async () => {
    const { result } = renderHook(() => useSubAppearance());
    act(() => result.current[1]({ size: 'lg' }));
    expect(Object.keys(result.current[0]).sort()).toEqual(
      Object.keys(DEFAULT_SUB_APPEARANCE).sort(),
    );
  });

  it('persists the WHOLE style, not just the change', async () => {
    const { result } = renderHook(() => useSubAppearance());
    act(() => result.current[1]({ size: 'lg' }));
    // Written as one blob and merged on read; a partial write would lose every
    // other setting on the next launch.
    await waitFor(() => expect(savePref).toHaveBeenCalled());
    expect(written()).toEqual(result.current[0]);
  });

  it('accumulates across changes', async () => {
    const { result } = renderHook(() => useSubAppearance());
    act(() => result.current[1]({ size: 'lg' }));
    act(() => result.current[1]({ edge: 'uniform' }));
    expect(result.current[0]).toMatchObject({ size: 'lg', edge: 'uniform' });
    await waitFor(() => expect(written()).toMatchObject({ size: 'lg', edge: 'uniform' }));
  });

  it('keeps a stable setter, so the panel does not re-render on every change', () => {
    const { result, rerender } = renderHook(() => useSubAppearance());
    const setter = result.current[1];
    rerender();
    expect(result.current[1]).toBe(setter);
  });
});
