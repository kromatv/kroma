// @vitest-environment jsdom
//
// The playback heartbeat: what puts a stream in the admin "En cours de lecture"
// panel and what takes it back out.
//
// Two things have to hold. The session must STOP on unmount, or the panel keeps
// showing a film nobody is watching until the reaper notices. And a termination
// must fire exactly once - it shows the viewer a message and halts playback, so
// a second firing on the next ping would talk over itself.

import { KromaApiError, type KromaClient } from '@kroma/core';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePlaybackHeartbeat } from './playback';

const events = vi.hoisted(() => ({
  connect: vi.fn(),
  close: vi.fn(),
  onEvent: undefined as unknown,
}));

vi.mock('@kroma/core', async (real) => {
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

/** Typed with the real signatures, so the assertions can read back the session
 * id each ping was sent with. */
function fakeClient(over: Record<string, unknown> = {}) {
  const client = {
    pingPlayback: vi.fn(async (_ping: { sessionId: string }) => undefined),
    stopPlayback: vi.fn(async (_sessionId: string) => undefined),
    ...over,
  };
  return client as unknown as KromaClient & typeof client;
}

const params = (over: Record<string, unknown> = {}) =>
  ({
    client: fakeClient(),
    enabled: true,
    itemId: 'item-1',
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
    const client = fakeClient();
    renderHook(() => usePlaybackHeartbeat(params({ client })));
    await settle();
    expect(client.pingPlayback).toHaveBeenCalledTimes(1);
    expect(client.pingPlayback).toHaveBeenCalledWith(
      expect.objectContaining({ itemId: 'item-1', positionMs: 12_500, state: 'playing' }),
    );
  });

  it('keeps pinging on the interval', async () => {
    const client = fakeClient();
    renderHook(() => usePlaybackHeartbeat(params({ client })));
    await settle();
    await act(async () => {
      vi.advanceTimersByTime(20_000);
    });
    expect(client.pingPlayback).toHaveBeenCalledTimes(3);
  });

  it('does nothing at all while disabled', async () => {
    const client = fakeClient();
    renderHook(() => usePlaybackHeartbeat(params({ client, enabled: false })));
    await settle();
    expect(client.pingPlayback).not.toHaveBeenCalled();
    expect(events.connect).not.toHaveBeenCalled();
  });

  it('carries the selected tracks when the caller supplies them', async () => {
    const client = fakeClient();
    renderHook(() =>
      usePlaybackHeartbeat(
        params({ client, getAudio: () => 'Français · 5.1', getSubtitle: () => 'off' }),
      ),
    );
    await settle();
    expect(client.pingPlayback).toHaveBeenCalledWith(
      expect.objectContaining({ audio: 'Français · 5.1', subtitle: 'off' }),
    );
  });

  it('gives every session its own id', async () => {
    const a = fakeClient();
    const b = fakeClient();
    renderHook(() => usePlaybackHeartbeat(params({ client: a })));
    renderHook(() => usePlaybackHeartbeat(params({ client: b })));
    await settle();
    const idOf = (c: typeof a) => c.pingPlayback.mock.calls[0]?.[0].sessionId ?? '';
    expect(idOf(a)).not.toBe(idOf(b));
    expect(idOf(a).startsWith('web-')).toBe(true);
  });
});

describe('stopping', () => {
  // Without this the admin panel shows a film nobody is watching until the
  // reaper eventually times it out.
  it('signals stop on unmount', async () => {
    const client = fakeClient();
    const { unmount } = renderHook(() => usePlaybackHeartbeat(params({ client })));
    await settle();
    const sid = client.pingPlayback.mock.calls[0]?.[0].sessionId;
    unmount();
    expect(client.stopPlayback).toHaveBeenCalledWith(sid);
  });

  it('stops pinging after unmount', async () => {
    const client = fakeClient();
    const { unmount } = renderHook(() => usePlaybackHeartbeat(params({ client })));
    await settle();
    unmount();
    const after = client.pingPlayback.mock.calls.length;
    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });
    expect(client.pingPlayback).toHaveBeenCalledTimes(after);
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
    const client = fakeClient({
      pingPlayback: vi.fn(async () => {
        throw new KromaApiError(410, 'gone', undefined as never);
      }),
    });
    renderHook(() => usePlaybackHeartbeat(params({ client, onTerminated })));
    await settle();
    expect(onTerminated).toHaveBeenCalledWith('');
  });

  it('ignores any other failed ping', async () => {
    const onTerminated = vi.fn();
    const client = fakeClient({
      pingPlayback: vi.fn(async () => {
        throw new KromaApiError(500, 'boom', undefined as never);
      }),
    });
    renderHook(() => usePlaybackHeartbeat(params({ client, onTerminated })));
    await settle();
    expect(onTerminated).not.toHaveBeenCalled();
  });

  it('halts on the admin terminate event, carrying its message', async () => {
    const onTerminated = vi.fn();
    const client = fakeClient();
    renderHook(() => usePlaybackHeartbeat(params({ client, onTerminated })));
    await settle();
    const sid = client.pingPlayback.mock.calls[0]?.[0].sessionId;
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
    const client = fakeClient();
    renderHook(() => usePlaybackHeartbeat(params({ client, onTerminated })));
    await settle();
    const sid = client.pingPlayback.mock.calls[0]?.[0].sessionId;
    const emit = events.onEvent as (e: unknown) => void;
    act(() => emit({ type: 'playback.terminate', sessionId: sid, message: 'a' }));
    act(() => emit({ type: 'playback.terminate', sessionId: sid, message: 'b' }));
    expect(onTerminated).toHaveBeenCalledTimes(1);

    const after = client.pingPlayback.mock.calls.length;
    await act(async () => {
      vi.advanceTimersByTime(20_000);
    });
    expect(client.pingPlayback).toHaveBeenCalledTimes(after);
  });

  it('does not send a redundant stop once terminated', async () => {
    const client = fakeClient();
    const { unmount } = renderHook(() => usePlaybackHeartbeat(params({ client })));
    await settle();
    const sid = client.pingPlayback.mock.calls[0]?.[0].sessionId;
    const emit = events.onEvent as (e: unknown) => void;
    act(() => emit({ type: 'playback.terminate', sessionId: sid, message: '' }));
    unmount();
    expect(client.stopPlayback).not.toHaveBeenCalled();
  });
});

describe('prompt pings', () => {
  it('pings when the caller’s play state changes', async () => {
    const client = fakeClient();
    const { rerender } = renderHook(
      ({ playing }) => usePlaybackHeartbeat(params({ client, pingSignal: playing })),
      { initialProps: { playing: true } },
    );
    await settle();
    const before = client.pingPlayback.mock.calls.length;
    rerender({ playing: false });
    await settle();
    expect(client.pingPlayback.mock.calls.length).toBeGreaterThan(before);
  });

  it('pings on the element’s own play and pause', async () => {
    const client = fakeClient();
    const video = document.createElement('video');
    renderHook(() => usePlaybackHeartbeat(params({ client, videoRef: { current: video } })));
    await settle();
    const before = client.pingPlayback.mock.calls.length;
    act(() => void video.dispatchEvent(new Event('play')));
    act(() => void video.dispatchEvent(new Event('pause')));
    expect(client.pingPlayback.mock.calls).toHaveLength(before + 2);
  });
});
