// @vitest-environment jsdom
//
// The sender session: what a phone shows and what it sends.
//
// Three things have to hold. A TV that disappears must stop being "the TV I am
// driving" - otherwise the remote sits there sending orders into the void. A
// 404 (the set was switched off between listing and pressing) must surface as a
// message rather than a silent no-op. And the position has to advance between
// heartbeats, because a bar that steps once every ten seconds reads as broken.

import { fakeClient } from '@kroma/client/test';
import { type CastReceiver, DeviceId, ItemId, KromaApiError, type KromaClient } from '@kroma/core';
import { act, render, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CastProvider, useCast } from './cast';

const events = vi.hoisted(() => ({
  connect: vi.fn(),
  close: vi.fn(),
  send: vi.fn(),
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
      send = events.send;
    },
  };
});

const SALON_ID = DeviceId.parse('tv-salon-01');

const salon = (over: Partial<CastReceiver> = {}): CastReceiver =>
  ({
    id: SALON_ID,
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

function castClient(over: Partial<KromaClient['cast']> = {}) {
  return fakeClient({
    cast: { receivers: vi.fn(async () => [salon()]), command: vi.fn(async () => 1), ...over },
  });
}

function mount(client: KromaClient, enabled = true) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <CastProvider client={client} enabled={enabled} deviceName="iPhone">
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
    const { result } = mount(castClient());
    await waitFor(() => expect(result.current.receivers).toHaveLength(1));
    expect(result.current.available).toBe(true);
    expect(result.current.active).toBeNull();
  });

  it('stays empty and asks for nothing while signed out', async () => {
    const client = castClient();
    mount(client, false);
    await act(async () => undefined);
    expect(client.cast.receivers).not.toHaveBeenCalled();
  });

  it('patches a changed row in place instead of refetching', async () => {
    const client = castClient();
    const { result } = mount(client);
    await waitFor(() => expect(client.cast.receivers).toHaveBeenCalledTimes(1));

    act(() => events.onEvent?.({ type: 'cast.receiver', receiver: playing(1000) }));
    await waitFor(() => expect(result.current.receivers[0]?.nowPlaying?.state).toBe('playing'));
    // The whole point of carrying the row: one pause on one TV costs every
    // sender a patch, not an HTTP round trip.
    expect(client.cast.receivers).toHaveBeenCalledTimes(1);

    // A TV nobody had yet simply joins the list, in the server's own order.
    act(() =>
      events.onEvent?.({
        type: 'cast.receiver',
        receiver: salon({ id: DeviceId.parse('tv-annexe-01'), name: 'AAA' }),
      }),
    );
    await waitFor(() => expect(result.current.receivers).toHaveLength(2));
    expect(result.current.receivers[0]?.name).toBe('AAA');
  });

  it('resyncs on reconnect, where a gap may have swallowed a change', async () => {
    const client = castClient();
    mount(client);
    await waitFor(() => expect(client.cast.receivers).toHaveBeenCalledTimes(1));
    act(() => events.onOpen?.());
    await waitFor(() => expect(client.cast.receivers).toHaveBeenCalledTimes(2));
  });

  it('drops the selection when the chosen TV goes away', async () => {
    const client = castClient();
    const { result } = mount(client);
    await waitFor(() => expect(result.current.receivers).toHaveLength(1));
    act(() => result.current.select(SALON_ID));
    await waitFor(() => expect(result.current.active?.id).toBe(SALON_ID));

    // A TV whose socket closed is announced by id - no refetch, and the remote
    // stops pretending it is driving something.
    act(() => events.onEvent?.({ type: 'cast.receiver.gone', receiverId: SALON_ID }));
    await waitFor(() => expect(result.current.active).toBeNull());
    expect(result.current.receivers).toHaveLength(0);
  });
});

describe('sending', () => {
  it('starts a title and takes over that TV', async () => {
    const client = castClient();
    const { result } = mount(client);
    await waitFor(() => expect(result.current.receivers).toHaveLength(1));

    await act(async () => {
      await result.current.playOn(SALON_ID, ItemId.parse('it1'), 60_000);
    });
    expect(client.cast.command).toHaveBeenCalledWith(SALON_ID, {
      type: 'play',
      itemId: 'it1',
      positionMs: 60_000,
    });
    expect(result.current.active?.id).toBe(SALON_ID);
    // Optimistic, so the remote doesn't sit at 0:00 while the TV starts.
    expect(result.current.positionMs).toBeGreaterThanOrEqual(60_000);
  });

  it('reports a TV that went away, and stops driving it', async () => {
    const client = castClient({
      command: vi.fn(async () => {
        throw new KromaApiError(404, 'gone');
      }),
    });
    const { result } = mount(client);
    await waitFor(() => expect(result.current.receivers).toHaveLength(1));
    act(() => result.current.select(SALON_ID));

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.send({ type: 'pause' });
    });
    expect(ok).toBe(false);
    expect(result.current.error).toBe('cast.gone');
    expect(result.current.active).toBeNull();
  });

  it('distinguishes a failed send from a missing TV', async () => {
    const client = castClient({
      command: vi.fn(async () => {
        throw new KromaApiError(500, 'boom');
      }),
    });
    const { result } = mount(client);
    await waitFor(() => expect(result.current.receivers).toHaveLength(1));
    act(() => result.current.select(SALON_ID));
    await act(async () => {
      await result.current.send({ type: 'pause' });
    });
    expect(result.current.error).toBe('cast.failed');
    // A 500 is this server having a bad moment, not the TV leaving.
    expect(result.current.active?.id).toBe(SALON_ID);
  });

  it('sends nothing when no TV is selected', async () => {
    const client = castClient();
    const { result } = mount(client);
    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.send({ type: 'pause' });
    });
    expect(ok).toBe(false);
    expect(client.cast.command).not.toHaveBeenCalled();
  });
});

describe('the position', () => {
  it('runs between heartbeats and resets on the next one', async () => {
    const client = castClient({ receivers: vi.fn(async () => [playing(30_000)]) });
    const { result } = mount(client);
    await waitFor(() => expect(result.current.receivers).toHaveLength(1));
    act(() => result.current.select(SALON_ID));

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
        receiverId: SALON_ID,
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
    const client = castClient({ receivers: vi.fn(async () => [paused]) });
    const { result } = mount(client);
    await waitFor(() => expect(result.current.receivers).toHaveLength(1));
    act(() => result.current.select(SALON_ID));
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(result.current.positionMs).toBe(42_000);
  });
});

describe('being one of the TV s remotes', () => {
  it('announces itself when it takes a TV, and lets go when it stops', async () => {
    const { result } = mount(castClient());
    await waitFor(() => expect(result.current.receivers).toHaveLength(1));

    act(() => result.current.select(SALON_ID));
    expect(events.send).toHaveBeenCalledWith({
      type: 'cast.control',
      receiverId: SALON_ID,
      name: 'iPhone',
    });

    act(() => result.current.select(null));
    expect(events.send).toHaveBeenCalledWith({ type: 'cast.release' });
  });

  it('stands down when the television disconnects it', async () => {
    const { result } = mount(castClient());
    await waitFor(() => expect(result.current.receivers).toHaveLength(1));
    act(() => result.current.select(SALON_ID));
    await waitFor(() => expect(result.current.active?.id).toBe(SALON_ID));

    act(() => events.onEvent?.({ type: 'cast.kicked', receiverId: SALON_ID }));
    await waitFor(() => expect(result.current.active).toBeNull());
    expect(result.current.error).toBe('cast.kicked');
  });

  it('ignores a disconnect meant for another set', async () => {
    const { result } = mount(castClient());
    await waitFor(() => expect(result.current.receivers).toHaveLength(1));
    act(() => result.current.select(SALON_ID));
    act(() => events.onEvent?.({ type: 'cast.kicked', receiverId: 'tv-chambre-02' }));
    expect(result.current.active?.id).toBe(SALON_ID);
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
