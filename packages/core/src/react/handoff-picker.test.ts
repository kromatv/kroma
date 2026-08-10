// @vitest-environment jsdom
//
// Everything a picker of nearby televisions does between a tap and a row that
// says how it went. It lives here rather than in either shell because it is the
// same sequence on both, and it is all edges: a beacon the server could not
// place must be asked for its code BEFORE anything is sent, a refusal the next
// code could fix must leave the row standing, and a row that has just been
// tapped must not vanish out from under the thumb that tapped it.

import type { Translate } from '@kroma/core';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DiscoveredTv, GrantResult } from '../handoff';
import {
  HANDOFF_OUTCOME_MS,
  handoffRowHint,
  useCheckPrompt,
  useHandoffPicker,
} from './handoff-picker';

const SALON: DiscoveredTv = {
  handle: 'h-salon',
  name: 'Salon',
  platform: 'tvOS',
  check: 'K7QMR',
  confirmRequired: false,
  via: 'server',
};

// A packaged Samsung or LG shell: the server could not place its origin, so the
// code on its screen is the only thing that stands for being in the room.
const UNPLACEABLE: DiscoveredTv = { ...SALON, handle: 'h-tizen', confirmRequired: true };

function picker(result: GrantResult, devices: DiscoveredTv[] = [SALON]) {
  const connect = vi.fn(async () => result);
  const onSettled = vi.fn();
  const hook = renderHook(() => useHandoffPicker({ devices, connect, onSettled }));
  return { ...hook, connect, onSettled };
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('tapping a row', () => {
  it('grants outright when the server placed the beacon', async () => {
    const { result, connect, onSettled } = picker('granted');
    await act(async () => result.current.start(SALON));
    expect(connect).toHaveBeenCalledWith(SALON, undefined);
    expect(result.current.outcomeFor(SALON)).toBe('done');
    expect(onSettled).toHaveBeenCalledWith('granted');
  });

  // The whole approval is a tap, so a beacon nobody could place must not be
  // granted by one.
  it('asks for the check string first when it could not be placed, sending nothing', () => {
    const { result, connect } = picker('granted', [UNPLACEABLE]);
    act(() => result.current.start(UNPLACEABLE));
    expect(result.current.asking).toBe(UNPLACEABLE);
    expect(connect).not.toHaveBeenCalled();
  });

  it('stops asking when the prompt is dismissed', () => {
    const { result } = picker('granted', [UNPLACEABLE]);
    act(() => result.current.start(UNPLACEABLE));
    act(() => result.current.stopAsking());
    expect(result.current.asking).toBeNull();
  });
});

describe('how a grant ends', () => {
  it('says nothing at all when the request was never sent', async () => {
    const { result, onSettled } = picker('dropped');
    await act(async () => result.current.start(SALON));
    expect(result.current.outcomeFor(SALON)).toBeNull();
    expect(onSettled).not.toHaveBeenCalled();
  });

  it.each(['checkTooMany', 'gone'] as const)('shows %s on the row it was tapped on', async (r) => {
    const { result, onSettled } = picker(r);
    await act(async () => result.current.start(SALON));
    expect(result.current.outcomeFor(SALON)).toBe(r);
    expect(result.current.asking).toBeNull();
    expect(onSettled).toHaveBeenCalledWith('refused');
  });

  // The beacon is still standing, so the row is still a row and the next code
  // may be the right one.
  it('leaves the row alone when the code was simply wrong', async () => {
    const { result } = picker('checkWrong', [UNPLACEABLE]);
    await act(async () => result.current.grant(UNPLACEABLE, 'WRONG'));
    expect(result.current.outcomeFor(UNPLACEABLE)).toBeNull();
  });

  // This shell believed no code was needed and the server says otherwise: ask
  // rather than leave a tap that did nothing.
  it('opens the prompt when the server asks for a code the row did not advertise', async () => {
    const { result } = picker('checkRequired');
    await act(async () => result.current.start(SALON));
    expect(result.current.asking).toBe(SALON);
    expect(result.current.outcomeFor(SALON)).toBeNull();
  });

  it('stops saying how it went after a while: a confirmation that never leaves is worse', async () => {
    const { result } = picker('granted');
    await act(async () => result.current.start(SALON));
    expect(result.current.outcomeFor(SALON)).toBe('done');
    act(() => void vi.advanceTimersByTime(HANDOFF_OUTCOME_MS));
    await waitFor(() => expect(result.current.outcomeFor(SALON)).toBeNull());
  });
});

describe('the order of the rows', () => {
  it('leaves the list alone while nothing has been tapped', () => {
    const { result } = picker('granted', [SALON, UNPLACEABLE]);
    expect(result.current.rows.map((d) => d.handle)).toEqual(['h-salon', 'h-tizen']);
  });

  // Both endings remove the row (a granted beacon is spent, a lapsed one leaves
  // on the next poll), and a row that vanishes has told nobody anything.
  it('holds the tapped row, first, once the list has dropped it', async () => {
    const connect = vi.fn(async (): Promise<GrantResult> => 'granted');
    const { result, rerender } = renderHook(
      ({ devices }) => useHandoffPicker({ devices, connect }),
      { initialProps: { devices: [SALON, UNPLACEABLE] } },
    );
    await act(async () => result.current.start(SALON));
    rerender({ devices: [UNPLACEABLE] });
    expect(result.current.rows.map((d) => d.handle)).toEqual(['h-salon', 'h-tizen']);
    expect(result.current.outcomeFor(SALON)).toBe('done');
  });
});

describe('the code, typed', () => {
  function prompt(result: GrantResult) {
    const onGrant = vi.fn(async () => result);
    return { ...renderHook(() => useCheckPrompt({ device: UNPLACEABLE, onGrant })), onGrant };
  }

  // A desktop browser capitalizes nothing by itself and what a phone keyboard
  // does is a habit rather than a guarantee, so the case is the picker's to fix.
  it('uppercases what is typed and what is sent', async () => {
    const { result, onGrant } = prompt('granted');
    act(() => result.current.setCode('k7qmr'));
    expect(result.current.code).toBe('K7QMR');
    await act(async () => result.current.submit('k7qmr'));
    expect(onGrant).toHaveBeenCalledWith(UNPLACEABLE, 'K7QMR');
  });

  it('clears the field and marks it refused so another code can be tried', async () => {
    const { result } = prompt('checkWrong');
    act(() => result.current.setCode('AAAAA'));
    await act(async () => result.current.submit('AAAAA'));
    expect(result.current.code).toBe('');
    expect(result.current.refused).toBe('checkWrong');
    expect(result.current.busy).toBe(false);
  });

  it.each(['granted', 'dropped'] as const)('reports no refusal on %s', async (r) => {
    const { result } = prompt(r);
    await act(async () => result.current.submit('K7QMR'));
    expect(result.current.refused).toBeNull();
  });
});

describe('handoffRowHint', () => {
  const t = ((key: string) => key) as Translate;

  it('says what the row is doing while it is doing it', () => {
    expect(handoffRowHint(SALON, true, null, t)).toBe('handoff.connecting');
  });

  it('says how it ended, once it has', () => {
    expect(handoffRowHint(SALON, false, 'done', t)).toBe('handoff.rowDone');
    expect(handoffRowHint(SALON, false, 'gone', t)).toBe('handoff.gone');
  });

  it('otherwise names the platform', () => {
    expect(handoffRowHint(SALON, false, null, t)).toBe('tvOS');
  });

  // A television with no name of its own publishes its platform as one, so this
  // would print the same word twice.
  it('says nothing when the platform IS the name', () => {
    expect(handoffRowHint({ ...SALON, name: 'tvOS' }, false, null, t)).toBe('');
  });
});
