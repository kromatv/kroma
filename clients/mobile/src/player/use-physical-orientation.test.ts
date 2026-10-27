// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { AccelerometerMeasurement } from 'expo-sensors';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sensor = vi.hoisted(() => ({
  available: vi.fn(() => Promise.resolve(true)),
  interval: vi.fn(),
  remove: vi.fn(),
  listener: null as ((value: AccelerometerMeasurement) => void) | null,
}));
vi.mock('expo-sensors', () => ({
  Accelerometer: {
    isAvailableAsync: sensor.available,
    setUpdateInterval: sensor.interval,
    addListener: (listener: typeof sensor.listener) => {
      sensor.listener = listener;
      return { remove: sensor.remove };
    },
  },
}));

import { usePhysicalOrientation } from './use-physical-orientation';

function sample(x: number, y: number, z = 0, count = 1) {
  act(() => {
    for (let index = 0; index < count; index += 1) sensor.listener?.({ x, y, z, timestamp: index });
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  sensor.available.mockResolvedValue(true);
  sensor.listener = null;
});
afterEach(cleanup);

describe('physical orientation subscription', () => {
  it('requires three stable samples and holds posture through flat and diagonal transitions', async () => {
    const { result } = renderHook(() => usePhysicalOrientation());
    await waitFor(() => expect(result.current.available).toBe(true));
    expect(sensor.interval).toHaveBeenCalledWith(100);
    sample(0, -1, 0, 2);
    expect(result.current.orientation).toBeNull();
    sample(0, -1);
    expect(result.current.orientation).toBe('portrait');
    sample(1, 0, 0, 2);
    sample(0.7, 0.7);
    sample(1, 0);
    expect(result.current.orientation).toBe('portrait');
    sample(1, 0, 0, 2);
    expect(result.current.orientation).toBe('landscape');
    sample(0, 0, 1, 5);
    expect(result.current.orientation).toBe('landscape');
    sample(0, -1, 0, 3);
    expect(result.current.orientation).toBe('portrait');
  });

  it('cleans up the sensor when playback unmounts', async () => {
    const { result, unmount } = renderHook(() => usePhysicalOrientation());
    await waitFor(() => expect(result.current.available).toBe(true));
    unmount();
    expect(sensor.remove).toHaveBeenCalledOnce();
    sample(1, 0, 0, 3);
    expect(result.current.orientation).toBeNull();
  });

  it('falls back without subscribing when the simulator has no accelerometer', async () => {
    sensor.available.mockResolvedValueOnce(false);
    const { result } = renderHook(() => usePhysicalOrientation());
    await waitFor(() => expect(result.current.available).toBe(false));
    expect(sensor.listener).toBeNull();
  });

  it('falls back if querying sensor availability fails', async () => {
    sensor.available.mockRejectedValueOnce(new Error('unavailable'));
    const { result } = renderHook(() => usePhysicalOrientation());
    await waitFor(() => expect(result.current.available).toBe(false));
  });

  it('does not subscribe after a delayed availability result arrives on unmount', async () => {
    let finish: ((available: boolean) => void) | undefined;
    sensor.available.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const { unmount } = renderHook(() => usePhysicalOrientation());
    unmount();
    await act(async () => finish?.(true));
    expect(sensor.listener).toBeNull();
  });

  it('leaves tablets and disabled consumers unsubscribed', () => {
    const { result } = renderHook(() => usePhysicalOrientation(false));
    expect(result.current.available).toBe(false);
    expect(sensor.available).not.toHaveBeenCalled();
  });
});
