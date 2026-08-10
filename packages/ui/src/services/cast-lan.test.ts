// @vitest-environment jsdom
//
// What the cast picker gets from its own link. Two jobs, and only one of them
// changes what the picker can do: surface the televisions with no account, and
// nudge a refetch when a signed-in one turns up the roster has not mentioned.

import { beaconTxt, type LanService } from '@kroma/core';
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useLanCast } from '#ui/services/cast-lan';

function stubLan(initial: LanService[] = []) {
  let publish: ((found: LanService[]) => void) | undefined;
  const stop = vi.fn();
  const browse = vi.fn((onFound: (found: LanService[]) => void) => {
    publish = onFound;
    onFound(initial);
    return stop;
  });
  return { lan: { browse }, stop, report: (rows: LanService[]) => publish?.(rows) };
}

function waiting(handle: string, name: string): LanService {
  return {
    name,
    txt: beaconTxt({
      state: 'waiting',
      server: 'srv-1',
      handle,
      name,
      platform: 'tvOS',
      check: 'K7QM',
      proof: `proof-${handle}`,
    }),
  };
}

function ready(receiver: string, name: string): LanService {
  return { name, txt: beaconTxt({ state: 'ready', receiver, name, platform: 'tvOS' }) };
}

function run(opts: {
  lan?: ReturnType<typeof stubLan>['lan'];
  enabled?: boolean;
  knows?: (id: string) => boolean;
}) {
  const onUnknownReceiver = vi.fn();
  const view = renderHook(() =>
    useLanCast({
      lan: opts.lan,
      enabled: opts.enabled ?? true,
      onUnknownReceiver,
      knowsReceiver: opts.knows ?? (() => false),
    }),
  );
  return { ...view, onUnknownReceiver };
}

describe('televisions with no account', () => {
  it('are surfaced, with what it takes to sign one in', async () => {
    const { lan } = stubLan([waiting('h1', 'Salon')]);
    const { result } = run({ lan });

    await waitFor(() => expect(result.current).toHaveLength(1));
    expect(result.current[0]?.name).toBe('Salon');
    expect(result.current[0]?.proof).toBe('proof-h1');
    expect(result.current[0]?.via).toBe('lan');
  });

  it('are not confused with the signed-in ones', async () => {
    const { lan } = stubLan([waiting('h1', 'Salon'), ready('r1', 'Chambre')]);
    const { result } = run({ lan });

    await waitFor(() => expect(result.current).toHaveLength(1));
    expect(result.current[0]?.name).toBe('Salon');
  });

  it('keep the same array when a report changes nothing', async () => {
    const { lan, report } = stubLan([waiting('h1', 'Salon')]);
    const { result } = run({ lan });
    await waitFor(() => expect(result.current).toHaveLength(1));
    const held = result.current;

    act(() => report([waiting('h1', 'Salon')]));
    expect(result.current).toBe(held);

    act(() => report([waiting('h1', 'Salon'), waiting('h2', 'Chambre')]));
    expect(result.current).not.toBe(held);
  });

  it('go when the link says they have gone', async () => {
    const { lan, report } = stubLan([waiting('h1', 'Salon')]);
    const { result } = run({ lan });
    await waitFor(() => expect(result.current).toHaveLength(1));

    act(() => report([]));
    await waitFor(() => expect(result.current).toHaveLength(0));
  });
});

describe('a signed-in television heard on the link', () => {
  it('nudges a refetch when the roster has never mentioned it', async () => {
    const { lan } = stubLan([ready('r1', 'Salon')]);
    const { onUnknownReceiver } = run({ lan, knows: () => false });
    await waitFor(() => expect(onUnknownReceiver).toHaveBeenCalled());
  });

  it('nudges nothing when the roster already has it', async () => {
    // Waiting on something real, not on a tautology: a nudge that arrived one
    // effect-flush later would slip past `await waitFor(() => expect(true))`.
    const { lan, report } = stubLan([ready('r1', 'Salon')]);
    const { onUnknownReceiver, result } = run({ lan, knows: (id) => id === 'r1' });

    act(() => report([ready('r1', 'Salon'), waiting('h1', 'Chambre')]));
    await waitFor(() => expect(result.current).toHaveLength(1));
    expect(onUnknownReceiver).not.toHaveBeenCalled();
  });

  it('nudges once per report however many strangers it held', async () => {
    const { lan } = stubLan([ready('r1', 'Salon'), ready('r2', 'Chambre')]);
    const { onUnknownReceiver } = run({ lan, knows: () => false });
    await waitFor(() => expect(onUnknownReceiver).toHaveBeenCalledTimes(1));
  });

  it('reads the roster as it is now, not as it was when the browse started', async () => {
    const { lan, report } = stubLan([]);
    let known = new Set<string>();
    const { onUnknownReceiver } = run({ lan, knows: (id) => known.has(id) });

    known = new Set(['r1']);
    act(() => report([ready('r1', 'Salon')]));
    expect(onUnknownReceiver).not.toHaveBeenCalled();

    act(() => report([ready('r2', 'Chambre')]));
    await waitFor(() => expect(onUnknownReceiver).toHaveBeenCalledTimes(1));
  });
});

function appVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

describe('a phone with the app behind it', () => {
  it('stops the browse until the app is in front again', async () => {
    const { lan, stop } = stubLan([waiting('h1', 'Salon')]);
    const { result } = run({ lan });
    await waitFor(() => expect(result.current).toHaveLength(1));

    appVisibility('hidden');
    await waitFor(() => expect(stop).toHaveBeenCalled());
    expect(result.current).toEqual([]);

    appVisibility('visible');
    await waitFor(() => expect(result.current).toHaveLength(1));
    expect(lan.browse).toHaveBeenCalledTimes(2);
  });
});

describe('a device that cannot listen', () => {
  it('reports nothing and asks for nothing', async () => {
    const { onUnknownReceiver, result } = run({ lan: undefined });
    await waitFor(() => expect(result.current).toEqual([]));
    expect(onUnknownReceiver).not.toHaveBeenCalled();
  });

  it('stands down while signed out, and stops the browse', async () => {
    const { lan, stop } = stubLan([waiting('h1', 'Salon')]);
    const { result, rerender } = renderHook(
      ({ enabled }) =>
        useLanCast({
          lan,
          enabled,
          onUnknownReceiver: () => undefined,
          knowsReceiver: () => false,
        }),
      { initialProps: { enabled: true } },
    );
    await waitFor(() => expect(result.current).toHaveLength(1));

    rerender({ enabled: false });
    await waitFor(() => expect(result.current).toEqual([]));
    expect(stop).toHaveBeenCalled();
  });
});
