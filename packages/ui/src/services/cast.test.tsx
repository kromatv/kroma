// @vitest-environment jsdom
//
// The sender session: what a phone shows and what it sends.
//
// Three things have to hold. A TV that disappears must stop being "the TV I am
// driving" - otherwise the remote sits there sending orders into the void. A
// 404 (the set was switched off between listing and pressing) must surface as a
// message rather than a silent no-op. And the position has to advance between
// heartbeats, because a bar that steps once every ten seconds reads as broken.

import { type CastReceiver, KromaApiError, type KromaClient } from '@kroma/core';
import { act, render, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CastProvider, useCast } from './cast';

const events = vi.hoisted(() => ({
  connect: vi.fn(),
  close: vi.fn(),
  onEvent: undefined as ((e: unknown) => void) | undefined,
  onOpen: undefined as (() => void) | undefined,
}));

vi.mock('@kroma/core', async (real) => {
  const actual = (await real()) as Record<string, unknown>;
  return {
    ...actual,
    KromaEvents: class {
      constructor(_url: string, opts: { onEvent?: (e: unknown) => void; onOpen?: () => void }) {
        events.onEvent = opts.onEvent;
        events.onOpen = opts.onOpen;
      }
      connect = events.connect;
      close = events.close;
    },
  };
});

const salon = (over: Partial<CastReceiver> = {}): CastReceiver =>
  ({
    id: 'tv-salon-01',
    name: 'Apple TV',
    platform: 'Apple TV',
    username: 'Salon',
    network: 'LAN',
    ...over,
  }) as CastReceiver;

const playing = (positionMs: number) =>
  salon({
    nowPlaying: {
      item: { id: 'it1', title: 'The Matrix' },
      positionMs,
      durationMs: 8_160_000,
      state: 'playing',
      audioTracks: [],
      subtitles: [],
    },
  } as unknown as Partial<CastReceiver>);

function fakeClient(over: Record<string, unknown> = {}) {
  const client = {
    baseUrl: 'http://nas',
    castReceivers: vi.fn(async () => [salon()]),
    sendCastCommand: vi.fn(async () => 1),
    ...over,
  };
  return client as unknown as KromaClient & typeof client;
}

function mount(client: KromaClient, enabled = true) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <CastProvider client={client} enabled={enabled}>
      {children}
    </CastProvider>
  );
  return renderHook(() => useCast(), { wrapper });
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('the roster', () => {
  it('lists the live receivers once signed in', async () => {
    const { result } = mount(fakeClient());
    await waitFor(() => expect(result.current.receivers).toHaveLength(1));
    expect(result.current.available).toBe(true);
    expect(result.current.active).toBeNull();
  });

  it('stays empty and asks for nothing while signed out', async () => {
    const client = fakeClient();
    mount(client, false);
    await act(async () => undefined);
    expect(client.castReceivers).not.toHaveBeenCalled();
  });

  it('patches a changed row in place instead of refetching', async () => {
    const client = fakeClient();
    const { result } = mount(client);
    await waitFor(() => expect(client.castReceivers).toHaveBeenCalledTimes(1));

    act(() => events.onEvent?.({ type: 'cast.receiver', receiver: playing(1000) }));
    await waitFor(() => expect(result.current.receivers[0]?.nowPlaying?.state).toBe('playing'));
    // The whole point of carrying the row: one pause on one TV costs every
    // sender a patch, not an HTTP round trip.
    expect(client.castReceivers).toHaveBeenCalledTimes(1);

    // A TV nobody had yet simply joins the list, in the server's own order.
    act(() =>
      events.onEvent?.({ type: 'cast.receiver', receiver: salon({ id: 'tv-a', name: 'AAA' }) }),
    );
    await waitFor(() => expect(result.current.receivers).toHaveLength(2));
    expect(result.current.receivers[0]?.name).toBe('AAA');
  });

  it('resyncs on reconnect, where a gap may have swallowed a change', async () => {
    const client = fakeClient();
    mount(client);
    await waitFor(() => expect(client.castReceivers).toHaveBeenCalledTimes(1));
    act(() => events.onOpen?.());
    await waitFor(() => expect(client.castReceivers).toHaveBeenCalledTimes(2));
  });

  it('drops the selection when the chosen TV goes away', async () => {
    const client = fakeClient();
    const { result } = mount(client);
    await waitFor(() => expect(result.current.receivers).toHaveLength(1));
    act(() => result.current.select('tv-salon-01'));
    await waitFor(() => expect(result.current.active?.id).toBe('tv-salon-01'));

    // A TV whose socket closed is announced by id - no refetch, and the remote
    // stops pretending it is driving something.
    act(() => events.onEvent?.({ type: 'cast.receiver.gone', receiverId: 'tv-salon-01' }));
    await waitFor(() => expect(result.current.active).toBeNull());
    expect(result.current.receivers).toHaveLength(0);
  });
});

describe('sending', () => {
  it('starts a title and takes over that TV', async () => {
    const client = fakeClient();
    const { result } = mount(client);
    await waitFor(() => expect(result.current.receivers).toHaveLength(1));

    await act(async () => {
      await result.current.playOn('tv-salon-01', 'it1' as never, 60_000);
    });
    expect(client.sendCastCommand).toHaveBeenCalledWith('tv-salon-01', {
      type: 'play',
      itemId: 'it1',
      positionMs: 60_000,
    });
    expect(result.current.active?.id).toBe('tv-salon-01');
    // Optimistic, so the remote doesn't sit at 0:00 while the TV starts.
    expect(result.current.positionMs).toBeGreaterThanOrEqual(60_000);
  });

  it('reports a TV that went away, and stops driving it', async () => {
    const client = fakeClient({
      sendCastCommand: vi.fn(async () => {
        throw new KromaApiError(404, 'gone');
      }),
    });
    const { result } = mount(client);
    await waitFor(() => expect(result.current.receivers).toHaveLength(1));
    act(() => result.current.select('tv-salon-01'));

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.send({ type: 'pause' });
    });
    expect(ok).toBe(false);
    expect(result.current.error).toBe('cast.gone');
    expect(result.current.active).toBeNull();
  });

  it('distinguishes a failed send from a missing TV', async () => {
    const client = fakeClient({
      sendCastCommand: vi.fn(async () => {
        throw new KromaApiError(500, 'boom');
      }),
    });
    const { result } = mount(client);
    await waitFor(() => expect(result.current.receivers).toHaveLength(1));
    act(() => result.current.select('tv-salon-01'));
    await act(async () => {
      await result.current.send({ type: 'pause' });
    });
    expect(result.current.error).toBe('cast.failed');
    // A 500 is this server having a bad moment, not the TV leaving.
    expect(result.current.active?.id).toBe('tv-salon-01');
  });

  it('sends nothing when no TV is selected', async () => {
    const client = fakeClient();
    const { result } = mount(client);
    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.send({ type: 'pause' });
    });
    expect(ok).toBe(false);
    expect(client.sendCastCommand).not.toHaveBeenCalled();
  });
});

describe('the position', () => {
  it('runs between heartbeats and resets on the next one', async () => {
    const client = fakeClient({ castReceivers: vi.fn(async () => [playing(30_000)]) });
    const { result } = mount(client);
    await waitFor(() => expect(result.current.receivers).toHaveLength(1));
    act(() => result.current.select('tv-salon-01'));

    const start = result.current.positionMs;
    expect(start).toBeGreaterThanOrEqual(30_000);
    await act(async () => {
      vi.advanceTimersByTime(3000);
    });
    // A bar that only moved every 10 s would still read 30 s here.
    expect(result.current.positionMs).toBeGreaterThanOrEqual(start + 2500);

    // The TV's own beat is authoritative again.
    act(() =>
      events.onEvent?.({
        type: 'cast.position',
        receiverId: 'tv-salon-01',
        positionMs: 90_000,
        durationMs: 8_160_000,
        state: 'playing',
      }),
    );
    expect(result.current.positionMs).toBeGreaterThanOrEqual(90_000);
    expect(result.current.positionMs).toBeLessThan(95_000);
  });

  it('holds still while the TV is paused', async () => {
    const paused = salon({
      nowPlaying: {
        item: { id: 'it1', title: 'The Matrix' },
        positionMs: 42_000,
        durationMs: 8_160_000,
        state: 'paused',
        audioTracks: [],
        subtitles: [],
      },
    } as unknown as Partial<CastReceiver>);
    const client = fakeClient({ castReceivers: vi.fn(async () => [paused]) });
    const { result } = mount(client);
    await waitFor(() => expect(result.current.receivers).toHaveLength(1));
    act(() => result.current.select('tv-salon-01'));
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(result.current.positionMs).toBe(42_000);
  });
});

describe('outside a provider', () => {
  it('reads as "no TVs" instead of throwing', () => {
    let seen: ReturnType<typeof useCast> | undefined;
    function Probe() {
      seen = useCast();
      return null;
    }
    render(<Probe />);
    expect(seen?.available).toBe(false);
    expect(seen?.receivers).toEqual([]);
  });
});
