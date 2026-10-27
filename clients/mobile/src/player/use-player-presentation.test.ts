// @vitest-environment jsdom

import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  setOptions: vi.fn(),
  restore: vi.fn(),
  rotate: vi.fn(),
  allow: vi.fn(),
  width: 402,
  height: 874,
  tablet: false,
  available: true as boolean | null,
  physical: 'portrait' as 'portrait' | 'landscape' | null,
  back: null as (() => boolean) | null,
  remove: vi.fn(),
}));
vi.mock('expo-router', () => ({ useNavigation: () => navigation }));
vi.mock('react-native', () => ({
  useWindowDimensions: () => ({ width: state.width, height: state.height }),
  BackHandler: {
    addEventListener: (_event: string, listener: () => boolean) => {
      state.back = listener;
      return { remove: state.remove };
    },
  },
}));
vi.mock('#mobile/lib/layout', () => ({
  get isTablet() {
    return state.tablet;
  },
}));
vi.mock('#mobile/lib/orientation', () => ({
  lockUpright: state.restore,
  lockPlayerOrientation: state.rotate,
  allowPlayerRotation: state.allow,
  playerOrientation: (fullscreen: boolean) => {
    if (state.tablet) return 'default';
    return fullscreen ? 'landscape' : 'portrait';
  },
}));
vi.mock('./use-physical-orientation', () => ({
  usePhysicalOrientation: () => ({ available: state.available, orientation: state.physical }),
}));
const navigation = { setOptions: state.setOptions };
const frames = new Map<number, FrameRequestCallback>();

import { usePlayerPresentation } from './use-player-presentation';

function nextFrame() {
  act(() => {
    const callbacks = [...frames.values()];
    frames.clear();
    callbacks.forEach((callback) => callback(0));
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(state, {
    back: null,
    width: 402,
    height: 874,
    tablet: false,
    available: true,
    physical: 'portrait',
  });
  frames.clear();
  let frameId = 0;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++frameId, callback);
    return frameId;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('portrait-first playback', () => {
  it('follows physical landscape and upright posture even while the interface is locked', () => {
    const { result, rerender } = renderHook(() => usePlayerPresentation());
    nextFrame();
    expect(result.current.fullscreen).toBe(false);
    expect(state.rotate).toHaveBeenLastCalledWith(false);
    state.physical = 'landscape';
    rerender();
    nextFrame();
    expect(result.current.fullscreen).toBe(true);
    expect(state.rotate).toHaveBeenLastCalledWith(true);
    expect(state.setOptions).toHaveBeenLastCalledWith({
      orientation: 'landscape',
      autoHideHomeIndicator: true,
    });
    state.physical = 'portrait';
    rerender();
    nextFrame();
    expect(result.current.fullscreen).toBe(false);
    expect(state.rotate).toHaveBeenLastCalledWith(false);
  });

  it('holds explicit fullscreen while physically upright, then lets subsequent posture changes take over', () => {
    const { result, rerender } = renderHook(() => usePlayerPresentation());
    nextFrame();
    act(() => result.current.toggle());
    nextFrame();
    expect(state.rotate).toHaveBeenLastCalledWith(true);
    state.width = 874;
    state.height = 402;
    rerender();
    nextFrame();
    expect(result.current.fullscreen).toBe(true);
    expect(state.allow).not.toHaveBeenCalled();
    state.physical = 'landscape';
    rerender();
    nextFrame();
    expect(result.current.fullscreen).toBe(true);
    state.physical = 'portrait';
    rerender();
    nextFrame();
    expect(result.current.fullscreen).toBe(false);
  });

  it('does not let the first sensor sample cancel an earlier fullscreen press', () => {
    state.physical = null;
    const { result, rerender } = renderHook(() => usePlayerPresentation());
    act(() => result.current.toggle());
    state.physical = 'portrait';
    rerender();
    nextFrame();
    expect(result.current.fullscreen).toBe(true);
  });

  it('keeps minimize in portrait until physical posture changes again', () => {
    state.physical = 'landscape';
    state.width = 874;
    state.height = 402;
    const { result, rerender } = renderHook(() => usePlayerPresentation());
    act(() => result.current.collapse());
    nextFrame();
    expect(result.current.fullscreen).toBe(false);
    expect(state.rotate).toHaveBeenLastCalledWith(false);
    state.physical = 'portrait';
    rerender();
    nextFrame();
    state.physical = 'landscape';
    rerender();
    nextFrame();
    expect(result.current.fullscreen).toBe(true);
  });

  it('collapses fullscreen on hardware Back', () => {
    state.physical = 'landscape';
    const { result } = renderHook(() => usePlayerPresentation());
    act(() => {
      expect(state.back?.()).toBe(true);
    });
    expect(result.current.fullscreen).toBe(false);
    expect(state.remove).toHaveBeenCalledOnce();
  });

  it('cancels pending rotation and restores portrait when playback unmounts', () => {
    const { result, unmount } = renderHook(() => usePlayerPresentation());
    act(() => result.current.toggle());
    unmount();
    nextFrame();
    expect(state.restore).toHaveBeenCalledOnce();
    expect(state.rotate).not.toHaveBeenCalled();
    expect(frames.size).toBe(0);
  });

  it('uses interface rotation in a simulator while keeping button fullscreen locked', () => {
    state.available = false;
    state.physical = null;
    const { result, rerender } = renderHook(() => usePlayerPresentation());
    nextFrame();
    expect(state.allow).toHaveBeenCalledOnce();
    state.width = 874;
    state.height = 402;
    rerender();
    expect(result.current.fullscreen).toBe(true);
    state.width = 402;
    state.height = 874;
    rerender();
    expect(result.current.fullscreen).toBe(false);
    act(() => result.current.toggle());
    nextFrame();
    expect(state.rotate).toHaveBeenLastCalledWith(true);
    expect(state.setOptions).toHaveBeenLastCalledWith({
      orientation: 'landscape',
      autoHideHomeIndicator: true,
    });
  });

  it('keeps tablet fullscreen in its current orientation', () => {
    state.tablet = true;
    const { result } = renderHook(() => usePlayerPresentation());
    act(() => result.current.toggle());
    nextFrame();
    expect(result.current.fullscreen).toBe(true);
    expect(state.rotate).not.toHaveBeenCalled();
    expect(state.setOptions).toHaveBeenLastCalledWith({
      orientation: 'default',
      autoHideHomeIndicator: true,
    });
  });
});
