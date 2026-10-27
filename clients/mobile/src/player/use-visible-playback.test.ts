// @vitest-environment jsdom

import { act, cleanup, renderHook } from '@testing-library/react';
import type { VideoPlayer } from 'expo-video';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  current: 'active',
  changed: null as ((state: string) => void) | null,
  remove: vi.fn(),
}));
vi.mock('react-native', () => ({
  AppState: {
    get currentState() {
      return state.current;
    },
    addEventListener: (_event: string, changed: (state: string) => void) => {
      state.changed = changed;
      return { remove: state.remove };
    },
  },
}));

import { useVisiblePlayback } from './use-visible-playback';

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  state.current = 'active';
  state.changed = null;
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function background() {
  act(() => {
    state.current = 'background';
    state.changed?.('background');
  });
}

describe('visible playback', () => {
  it('pauses invisible background playback when automatic PiP does not start', () => {
    const pause = vi.fn();
    renderHook(() => useVisiblePlayback({ pause } as unknown as VideoPlayer, false));
    background();
    expect(pause).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(700));
    expect(pause).toHaveBeenCalledOnce();
  });

  it('lets PiP continue and cancels the background pause as PiP starts', () => {
    const pause = vi.fn();
    const player = { pause } as unknown as VideoPlayer;
    const { rerender } = renderHook(({ inPip }) => useVisiblePlayback(player, inPip), {
      initialProps: { inPip: false },
    });
    background();
    rerender({ inPip: true });
    act(() => vi.advanceTimersByTime(1000));
    expect(pause).not.toHaveBeenCalled();
    rerender({ inPip: false });
    act(() => vi.advanceTimersByTime(700));
    expect(pause).toHaveBeenCalledOnce();
  });

  it('cancels a pending pause when the app becomes visible again', () => {
    const pause = vi.fn();
    renderHook(() => useVisiblePlayback({ pause } as unknown as VideoPlayer, false));
    background();
    act(() => state.changed?.('active'));
    act(() => vi.advanceTimersByTime(1000));
    expect(pause).not.toHaveBeenCalled();
  });

  it('pauses on unmount and tolerates a released native player', () => {
    const pause = vi.fn(() => {
      throw new Error('released');
    });
    const { unmount } = renderHook(() =>
      useVisiblePlayback({ pause } as unknown as VideoPlayer, true),
    );
    expect(() => unmount()).not.toThrow();
    expect(pause).toHaveBeenCalledOnce();
    expect(state.remove).toHaveBeenCalledOnce();
  });
});
