// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { amplitudeOf, levelOf, useVolumeBoost, VOLUME_BOOST_MAX } from './use-volume-boost';

function playback(volume = 1) {
  return { volume, setVol: vi.fn() };
}

describe('useVolumeBoost', () => {
  it('reads the element amplitude back as the level the viewer set', () => {
    const pb = playback(0.125);

    const { result } = renderHook(() => useVolumeBoost(pb));

    expect(result.current.volume).toBeCloseTo(0.5, 5);
    expect(result.current.boost).toBe(1);
  });

  it('hands a level under 100% to the element through the loudness curve', () => {
    const pb = playback();
    const { result } = renderHook(() => useVolumeBoost(pb));

    act(() => result.current.setVolume(0.5));

    expect(pb.setVol).toHaveBeenCalledWith(0.125);
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

describe('amplitudeOf and levelOf', () => {
  it('is quieter than linear in the middle and meets the ends', () => {
    expect(amplitudeOf(0)).toBe(0);
    expect(amplitudeOf(0.5)).toBeCloseTo(0.125, 5);
    expect(amplitudeOf(1)).toBe(1);
    expect(amplitudeOf(1.5)).toBe(1);
  });

  it('inverts', () => {
    for (const level of [0, 0.2, 0.5, 0.9, 1]) {
      expect(levelOf(amplitudeOf(level))).toBeCloseTo(level, 5);
    }
  });
});
