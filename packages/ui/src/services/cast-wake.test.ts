// @vitest-environment jsdom

import { DeviceId, type KromaClient } from '@kromatv/client';
import type { CastReceiver, CastWakeStep } from '@kromatv/client/cast';
import type { WakeReach } from '@kromatv/core';
import { fakeClient } from '@kromatv/client/test';
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { castRowState } from './cast-context';
import { useCastWake } from './cast-wake.hook';

const SALON_ID = DeviceId.parse('tv-salon-01');

const salon = (over: Partial<CastReceiver> = {}): CastReceiver => ({
  id: SALON_ID,
  name: 'Salon',
  platform: 'Tizen',
  username: 'alice',
  network: 'LAN',
  controllers: [],
  asleep: true,
  ...over,
});

function mount(client: KromaClient | null, reach: WakeReach = silentReach()) {
  const onArrived = vi.fn();
  const onGaveUp = vi.fn();
  const hook = renderHook(
    ({ receivers }) =>
      useCastWake({ client, receivers, reach, onArrived, onGaveUp, giveUpMs: 1000, everyMs: 50 }),
    { initialProps: { receivers: [salon()] } },
  );
  return { ...hook, onArrived, onGaveUp };
}

const SET: CastWakeStep = { type: 'samsung', address: '192.168.1.20', appId: 'KromaTV002.KROMA' };

const noSocket = () => Promise.reject(new Error('no answer'));

function silentReach(): WakeReach {
  return { http: vi.fn(async () => null), open: noSocket };
}

function wakingClient(steps: CastWakeStep[] = []) {
  return fakeClient({ cast: { wake: vi.fn(async () => ({ steps })) } });
}

afterEach(() => {
  vi.useRealTimers();
});

describe('bringing a television back', () => {
  it('waits on the television it asked for', async () => {
    const { result } = mount(wakingClient());

    await act(() => result.current.wake(SALON_ID));

    expect(result.current.waking).toBe(SALON_ID);
  });

  it('stops waiting and says so once the television is in the roster awake', async () => {
    const { result, rerender, onArrived } = mount(wakingClient());
    await act(() => result.current.wake(SALON_ID));

    rerender({ receivers: [salon({ asleep: false })] });

    expect(result.current.waking).toBeNull();
    expect(onArrived).toHaveBeenCalledExactlyOnceWith(SALON_ID);
  });

  it('gives up on a television that does not come back in time', async () => {
    vi.useFakeTimers();
    const { result, onGaveUp } = mount(wakingClient());
    await act(() => result.current.wake(SALON_ID));

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(result.current.waking).toBeNull();
    expect(onGaveUp).toHaveBeenCalledExactlyOnceWith(SALON_ID);
  });

  it('refuses to ask when no client is ready', async () => {
    const { result } = mount(null);

    await expect(result.current.wake(SALON_ID)).rejects.toThrow('no client');
  });
});

describe('running the steps from here', () => {
  it('asks the television again until it arrives', async () => {
    vi.useFakeTimers();
    const reach: WakeReach = {
      http: vi.fn(async () => ({ status: 200, text: '{"device":{"PowerState":"on"}}' })),
      open: noSocket,
    };
    const { result } = mount(wakingClient([SET]), reach);
    await act(() => result.current.wake(SALON_ID));

    await act(() => vi.advanceTimersByTimeAsync(120));

    expect(reach.http).toHaveBeenCalledWith(
      'POST',
      'http://192.168.1.20:8001/api/v2/applications/KromaTV002.KROMA',
    );
    expect(vi.mocked(reach.http).mock.calls.length).toBeGreaterThan(2);
    expect(result.current.needsPower).toBe(false);
  });

  it('says a person is needed when the television is off and nothing here can switch it on', async () => {
    vi.useFakeTimers();
    const { result } = mount(wakingClient([SET]));
    await act(() => result.current.wake(SALON_ID));

    await act(() => vi.advanceTimersByTimeAsync(10));

    expect(result.current.needsPower).toBe(true);
  });
});

describe('a television that refuses', () => {
  it('is given up on at once', async () => {
    vi.useFakeTimers();
    const reach: WakeReach = {
      http: vi.fn(async (method: 'GET' | 'POST') =>
        method === 'GET'
          ? { status: 200, text: '{"device":{"PowerState":"on"}}' }
          : { status: 404, text: '' },
      ),
      open: noSocket,
    };
    const { result, onGaveUp } = mount(wakingClient([SET]), reach);
    await act(() => result.current.wake(SALON_ID));

    await act(() => vi.advanceTimersByTimeAsync(10));

    expect(result.current.waking).toBeNull();
    expect(onGaveUp).toHaveBeenCalledExactlyOnceWith(SALON_ID);
  });
});

describe('what a picker shows under a television', () => {
  it.each([
    { row: salon(), cast: { waking: SALON_ID, wakingNeedsPower: false }, state: 'waking' },
    { row: salon(), cast: { waking: SALON_ID, wakingNeedsPower: true }, state: 'needsPower' },
    { row: salon(), cast: { waking: null, wakingNeedsPower: false }, state: 'asleep' },
    {
      row: salon({ asleep: false }),
      cast: { waking: null, wakingNeedsPower: false },
      state: 'idle',
    },
  ])('$state', ({ row, cast, state }) => {
    expect(castRowState(row, cast)).toBe(state);
  });
});
