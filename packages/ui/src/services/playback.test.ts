// @vitest-environment jsdom
//
// The playback heartbeat: what puts a stream in the admin "En cours de lecture"
// panel and what takes it back out.
//
// Two things have to hold. The session must STOP on unmount, or the panel keeps
// showing a film nobody is watching until the reaper notices. And a termination
// must fire exactly once - it shows the viewer a message and halts playback, so
// a second firing on the next ping would talk over itself.

import { KromaApiError, type KromaClient } from '@kroma/client';
import { ItemId } from '@kroma/client/media';
import { fakeClient } from '@kroma/client/test';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePlaybackHeartbeat } from './playback';

const events = vi.hoisted(() => ({
  connect: vi.fn(),
  close: vi.fn(),
  onEvent: undefined as unknown,
}));

vi.mock('@kroma/client/events', async (real) => {
  const actual = (await real()) as Record<string, unknown>;
  return {
    ...actual,
    KromaEvents: class {
      constructor(_url: string, opts: { onEvent: unknown }) {
        events.onEvent = opts.onEvent;
      }
      connect = events.connect;
      close = events.close;
    },
  };
});

type Playback = KromaClient['playback'];

function heartbeatClient(pingImpl: Playback['ping'] = async () => undefined) {
  const ping = vi.fn<Playback['ping']>(pingImpl);
  const stop = vi.fn<Playback['stop']>(async () => undefined);
  return { client: fakeClient({ playback: { ping, stop } }), ping, stop };
}

const params = (over: Record<string, unknown> = {}) =>
  ({
    client: heartbeatClient().client,
    enabled: true,
    itemId: ItemId.parse('item-1'),
    durationMs: 600_000,
    getPosition: () => 12.5,
    getState: () => 'playing' as const,
    mode: 'direct' as const,
    player: 'test-player',
    device: 'test-device',
    eventsBaseUrl: 'http://server/api',
    idPrefix: 'web',
    onTerminated: vi.fn(),
    ...over,
  }) as Parameters<typeof usePlaybackHeartbeat>[0];

beforeEach(() => {
  vi.useFakeTimers();
  events.connect.mockClear();
  events.close.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const settle = () => act(async () => undefined);

describe('pinging', () => {
  it('pings immediately with the current position and state', async () => {
    const { client, ping } = heartbeatClient();
    renderHook(() => usePlaybackHeartbeat(params({ client })));
    await settle();
    expect(ping).toHaveBeenCalledTimes(1);
    expect(ping).toHaveBeenCalledWith(
      expect.objectContaining({ itemId: 'item-1', positionMs: 12_500, state: 'playing' }),
    );
  });

  it('keeps pinging on the interval', async () => {
    const { client, ping } = heartbeatClient();
    renderHook(() => usePlaybackHeartbeat(params({ client })));
    await settle();
    await act(async () => {
      vi.advanceTimersByTime(20_000);
    });
    expect(ping).toHaveBeenCalledTimes(3);
  });

  it('does nothing at all while disabled', async () => {
    const { client, ping } = heartbeatClient();
    renderHook(() => usePlaybackHeartbeat(params({ client, enabled: false })));
    await settle();
    expect(ping).not.toHaveBeenCalled();
    expect(events.connect).not.toHaveBeenCalled();
  });

  it('carries the selected tracks when the caller supplies them', async () => {
    const { client, ping } = heartbeatClient();
    renderHook(() =>
      usePlaybackHeartbeat(
        params({ client, getAudio: () => 'Français · 5.1', getSubtitle: () => 'off' }),
      ),
    );
    await settle();
    expect(ping).toHaveBeenCalledWith(
      expect.objectContaining({ audio: 'Français · 5.1', subtitle: 'off' }),
    );
  });

  it('gives every session its own id', async () => {
    const a = heartbeatClient();
    const b = heartbeatClient();
    renderHook(() => usePlaybackHeartbeat(params({ client: a.client })));
    renderHook(() => usePlaybackHeartbeat(params({ client: b.client })));
    await settle();
    const idOf = (c: typeof a) => c.ping.mock.calls[0]?.[0].sessionId ?? '';
    expect(idOf(a)).not.toBe(idOf(b));
    expect(idOf(a).startsWith('web-')).toBe(true);
  });

  it('carries the buffered position in milliseconds when the surface can read it', async () => {
    const { client, ping } = heartbeatClient();
    renderHook(() => usePlaybackHeartbeat(params({ client, getBuffered: () => 48.25 })));
    await settle();
    expect(ping).toHaveBeenCalledWith(expect.objectContaining({ bufferedMs: 48_250 }));
  });

  it('leaves the buffered position off the ping when the surface cannot say', async () => {
    const { client, ping } = heartbeatClient();
    renderHook(() => usePlaybackHeartbeat(params({ client, getBuffered: () => undefined })));
    await settle();
    expect(ping.mock.calls[0]?.[0].bufferedMs).toBeUndefined();
  });
});

describe('opening a session', () => {
  it('opens none for a surface that never starts playing', async () => {
    const { client, ping } = heartbeatClient();
    renderHook(() => usePlaybackHeartbeat(params({ client, getState: () => 'buffering' })));
    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });
    expect(ping).not.toHaveBeenCalled();
  });

  it('sends no stop for a session it never opened', async () => {
    const { client, stop } = heartbeatClient();
    const { unmount } = renderHook(() =>
      usePlaybackHeartbeat(params({ client, getState: () => 'buffering' })),
    );
    await settle();
    unmount();
    await settle();
    expect(stop).not.toHaveBeenCalled();
  });

  // A hidden tab's timer is clamped to one wake-up a minute, so the beat lands
  // after the server's 30s TTL has already closed and logged the session. Pinging
  // the same id then opens another, and the reaper writes another row a minute
  // later, forever.
  it('opens no new session when a late beat finds the playhead where it left it', async () => {
    const { client, ping } = heartbeatClient();
    let state: 'playing' | 'paused' = 'playing';
    renderHook(() => usePlaybackHeartbeat(params({ client, getState: () => state })));
    await settle();
    state = 'paused';

    await act(async () => {
      vi.setSystemTime(Date.now() + 60_000);
      vi.advanceTimersByTime(10_000);
    });

    expect(ping).toHaveBeenCalledTimes(1);
  });

  it('opens a fresh session when a late beat finds the playhead moved on', async () => {
    const { client, ping } = heartbeatClient();
    let position = 30;
    renderHook(() => usePlaybackHeartbeat(params({ client, getPosition: () => position })));
    await settle();
    position = 95;

    await act(async () => {
      vi.setSystemTime(Date.now() + 60_000);
      vi.advanceTimersByTime(10_000);
    });

    expect(ping).toHaveBeenCalledTimes(2);
  });

  it('keeps one session id when the client is swapped underneath a running player', async () => {
    const a = heartbeatClient();
    const b = heartbeatClient();
    const { rerender } = renderHook(({ client }) => usePlaybackHeartbeat(params({ client })), {
      initialProps: { client: a.client },
    });
    await settle();

    rerender({ client: b.client });
    await settle();

    expect(b.ping.mock.calls[0]?.[0].sessionId).toBe(a.ping.mock.calls[0]?.[0].sessionId);
    expect(a.stop).not.toHaveBeenCalled();
  });
});

describe('stopping', () => {
  // Without this the admin panel shows a film nobody is watching until the
  // reaper eventually times it out.
  it('signals stop on unmount', async () => {
    const { client, ping, stop } = heartbeatClient();
    const { unmount } = renderHook(() => usePlaybackHeartbeat(params({ client })));
    await settle();
    const sid = ping.mock.calls[0]?.[0].sessionId;
    unmount();
    await settle();
    expect(stop).toHaveBeenCalledWith(sid);
  });

  // A stop that overtakes its own ping ends nothing, and the ping behind it
  // registers a session no one will ever close.
  it('holds the stop back until its last ping has landed', async () => {
    const { client, stop } = heartbeatClient(() => new Promise<void>(() => undefined));
    const { unmount } = renderHook(() => usePlaybackHeartbeat(params({ client })));
    await settle();

    unmount();
    await settle();

    expect(stop).not.toHaveBeenCalled();
  });

  it('stops pinging after unmount', async () => {
    const { client, ping } = heartbeatClient();
    const { unmount } = renderHook(() => usePlaybackHeartbeat(params({ client })));
    await settle();
    unmount();
    const after = ping.mock.calls.length;
    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });
    expect(ping).toHaveBeenCalledTimes(after);
  });

  it('closes the event stream on unmount', async () => {
    const { unmount } = renderHook(() => usePlaybackHeartbeat(params()));
    await settle();
    unmount();
    expect(events.close).toHaveBeenCalled();
  });
});

describe('termination', () => {
  it('halts on a 410, which is how a ping learns it was stopped', async () => {
    const onTerminated = vi.fn();
    const { client } = heartbeatClient(async () => {
      throw new KromaApiError(410, 'gone', undefined as never);
    });
    renderHook(() => usePlaybackHeartbeat(params({ client, onTerminated })));
    await settle();
    expect(onTerminated).toHaveBeenCalledWith('');
  });

  it('ignores any other failed ping', async () => {
    const onTerminated = vi.fn();
    const { client } = heartbeatClient(async () => {
      throw new KromaApiError(500, 'boom', undefined as never);
    });
    renderHook(() => usePlaybackHeartbeat(params({ client, onTerminated })));
    await settle();
    expect(onTerminated).not.toHaveBeenCalled();
  });

  it('halts on the admin terminate event, carrying its message', async () => {
    const onTerminated = vi.fn();
    const { client, ping } = heartbeatClient();
    renderHook(() => usePlaybackHeartbeat(params({ client, onTerminated })));
    await settle();
    const sid = ping.mock.calls[0]?.[0].sessionId;
    const emit = events.onEvent as (e: unknown) => void;
    act(() => emit({ type: 'playback.terminate', sessionId: sid, message: 'Stopped by an admin' }));
    expect(onTerminated).toHaveBeenCalledWith('Stopped by an admin');
  });

  it('ignores a terminate meant for a different session', async () => {
    const onTerminated = vi.fn();
    renderHook(() => usePlaybackHeartbeat(params({ onTerminated })));
    await settle();
    const emit = events.onEvent as (e: unknown) => void;
    act(() => emit({ type: 'playback.terminate', sessionId: 'someone-else', message: 'x' }));
    expect(onTerminated).not.toHaveBeenCalled();
  });

  // It shows the viewer a message and halts playback, so a repeat would talk
  // over itself.
  it('fires only once, and stops pinging afterwards', async () => {
    const onTerminated = vi.fn();
    const { client, ping } = heartbeatClient();
    renderHook(() => usePlaybackHeartbeat(params({ client, onTerminated })));
    await settle();
    const sid = ping.mock.calls[0]?.[0].sessionId;
    const emit = events.onEvent as (e: unknown) => void;
    act(() => emit({ type: 'playback.terminate', sessionId: sid, message: 'a' }));
    act(() => emit({ type: 'playback.terminate', sessionId: sid, message: 'b' }));
    expect(onTerminated).toHaveBeenCalledTimes(1);

    const after = ping.mock.calls.length;
    await act(async () => {
      vi.advanceTimersByTime(20_000);
    });
    expect(ping).toHaveBeenCalledTimes(after);
  });

  it('does not send a redundant stop once terminated', async () => {
    const { client, ping, stop } = heartbeatClient();
    const { unmount } = renderHook(() => usePlaybackHeartbeat(params({ client })));
    await settle();
    const sid = ping.mock.calls[0]?.[0].sessionId;
    const emit = events.onEvent as (e: unknown) => void;
    act(() => emit({ type: 'playback.terminate', sessionId: sid, message: '' }));
    unmount();
    expect(stop).not.toHaveBeenCalled();
  });
});

describe('prompt pings', () => {
  it('pings when the caller’s play state changes', async () => {
    const { client, ping } = heartbeatClient();
    const { rerender } = renderHook(
      ({ playing }) => usePlaybackHeartbeat(params({ client, pingSignal: playing })),
      { initialProps: { playing: true } },
    );
    await settle();
    const before = ping.mock.calls.length;
    rerender({ playing: false });
    await settle();
    expect(ping.mock.calls.length).toBeGreaterThan(before);
  });

  it('pings on the element’s own play and pause', async () => {
    const { client, ping } = heartbeatClient();
    const video = document.createElement('video');
    renderHook(() => usePlaybackHeartbeat(params({ client, videoRef: { current: video } })));
    await settle();
    const before = ping.mock.calls.length;
    act(() => void video.dispatchEvent(new Event('play')));
    act(() => void video.dispatchEvent(new Event('pause')));
    expect(ping.mock.calls).toHaveLength(before + 2);
  });
});
