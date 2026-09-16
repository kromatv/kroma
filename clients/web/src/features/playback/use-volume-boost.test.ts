// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useVolumeBoost, VOLUME_BOOST_MAX } from './use-volume-boost';

function playback(volume = 1) {
  return { volume, setVol: vi.fn() };
}

describe('useVolumeBoost', () => {
  it('reports the element volume while there is no boost', () => {
    const pb = playback(0.4);

    const { result } = renderHook(() => useVolumeBoost(pb));

    expect(result.current.volume).toBe(0.4);
    expect(result.current.boost).toBe(1);
  });

  it('hands a level under 100% to the element and keeps the gain at unity', () => {
    const pb = playback();
    const { result } = renderHook(() => useVolumeBoost(pb));

    act(() => result.current.setVolume(0.6));

    expect(pb.setVol).toHaveBeenCalledWith(0.6);
    expect(result.current.boost).toBe(1);
  });

  it('pins the element at 100% and puts the rest in the gain past it', () => {
    const pb = playback();
    const { result } = renderHook(() => useVolumeBoost(pb));

    act(() => result.current.setVolume(1.5));

    expect(pb.setVol).toHaveBeenCalledWith(1);
    expect(result.current.boost).toBe(1.5);
    expect(result.current.volume).toBe(1.5);
  });

  it('clamps to the ceiling and to silence', () => {
    const pb = playback();
    const { result } = renderHook(() => useVolumeBoost(pb));

    act(() => result.current.setVolume(9));
    expect(result.current.boost).toBe(VOLUME_BOOST_MAX);

    act(() => result.current.setVolume(-1));
    expect(pb.setVol).toHaveBeenLastCalledWith(0);
    expect(result.current.boost).toBe(1);
  });
});
