// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type SeekDeps, useSeekGesture } from './useSeekGesture';

function gesture(over: Partial<SeekDeps> = {}) {
  const seekTo = over.seekTo ?? vi.fn();
  const deps: SeekDeps = {
    duration: () => 1000,
    seekTo,
    ...over,
  };
  const view = renderHook(() => useSeekGesture(deps));
  return { ...view, seekTo: seekTo as ReturnType<typeof vi.fn> };
}

afterEach(() => cleanup());

describe('useSeekGesture scrub (pointer drag)', () => {
  it('scrub previews an absolute clamped position and commit issues the seek', () => {
    const { result, seekTo } = gesture({ duration: () => 1000 });
    act(() => result.current.scrub(500));
    expect(result.current.preview).toBe(500);
    act(() => result.current.scrub(5000)); // clamps to duration-1
    expect(result.current.preview).toBe(999);
    act(() => result.current.commit());
    expect(seekTo).toHaveBeenCalledWith(999);
    expect(result.current.preview).toBeNull();
  });

  it('with an unknown duration (0) scrub only floors at 0', () => {
    const { result } = gesture({ duration: () => 0 });
    act(() => result.current.scrub(-50));
    expect(result.current.preview).toBe(0);
    act(() => result.current.scrub(42));
    expect(result.current.preview).toBe(42);
  });
});

describe('useSeekGesture unmount flush', () => {
  it('flushes a pending preview as a seek when unmounted mid-gesture', () => {
    const seekTo = vi.fn();
    const { result, unmount } = gesture({ seekTo });
    act(() => result.current.scrub(300));
    unmount();
    expect(seekTo).toHaveBeenCalledWith(300);
  });
});
