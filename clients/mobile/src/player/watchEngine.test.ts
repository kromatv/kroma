// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Listener = (payload: never) => void;

const P = vi.hoisted(() => {
  const make = () => {
    const listeners = new Map<string, Set<Listener>>();
    const player = {
      playing: false,
      duration: 600,
      currentTime: 0,
      bufferedPosition: 0,
      muted: false,
      playbackRate: 1,
      timeUpdateEventInterval: 0,
      staysActiveInBackground: false,
      showNowPlayingNotification: false,
      play: vi.fn(() => {
        player.playing = true;
      }),
      pause: vi.fn(() => {
        player.playing = false;
      }),
      replaceAsync: vi.fn(async (_source: unknown) => undefined),
      addListener: (type: string, fn: Listener) => {
        let set = listeners.get(type);
        if (!set) {
          set = new Set();
          listeners.set(type, set);
        }
        set.add(fn);
        return {
          remove: () => {
            set?.delete(fn);
          },
        };
      },
      emit: (type: string, payload: unknown) => {
        for (const fn of listeners.get(type) ?? []) (fn as (p: unknown) => void)(payload);
      },
    };
    return player;
  };
  const box = { current: make() };
  return { box, fresh: () => (box.current = make()) };
});

vi.mock('expo-video', () => ({
  useVideoPlayer: (_source: unknown, setup?: (p: unknown) => void) => {
    setup?.(P.box.current);
    return P.box.current;
  },
}));

import { useWatchEngine } from './watchEngine';

const player = () => P.box.current;

function open(anchorSec = 0, onReanchor = vi.fn()) {
  return renderHook(() =>
    useWatchEngine({
      master: { uri: `hls://film@${anchorSec}`, anchorSec },
      durationSec: 600,
      title: 'A film',
      poster: null,
      onReanchor,
    }),
  );
}

function masterAnswers(...answers: { status: number; start?: string }[]) {
  const fetch = vi.fn();
  for (const { status, start } of answers) {
    fetch.mockResolvedValueOnce({ status, headers: { get: () => start ?? null } });
  }
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

beforeEach(() => {
  P.fresh();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('opening a stream that may still be arriving', () => {
  it('never sets the rate from a status report, which can race a stream being replaced', async () => {
    masterAnswers({ status: 200 });
    const set = vi.fn();
    Object.defineProperty(player(), 'playbackRate', { get: () => 1, set, configurable: true });

    open();
    await waitFor(() => expect(player().play).toHaveBeenCalled());
    await act(async () => {
      player().emit('statusChange', { status: 'readyToPlay' });
    });

    expect(set).not.toHaveBeenCalled();
  });

  it('hands the player its stream only once the master has answered', async () => {
    masterAnswers({ status: 503 }, { status: 200 });

    open();
    const early = player().replaceAsync.mock.calls.length;

    await waitFor(() => expect(player().replaceAsync).toHaveBeenCalledTimes(1));
    expect(early).toBe(0);
    expect(player().replaceAsync.mock.calls[0]?.[0]).toMatchObject({ uri: 'hls://film@0' });
    await waitFor(() => expect(player().play).toHaveBeenCalled());
  });

  it('reads how far the player has loaded in film seconds, and nothing before it has', async () => {
    masterAnswers({ status: 200, start: '112.5' });

    const { result } = open(117);
    await waitFor(() => expect(player().play).toHaveBeenCalled());
    const before = result.current.bufferedEnd();
    player().bufferedPosition = 12;

    expect(before).toBeNaN();
    expect(result.current.bufferedEnd()).toBe(124.5);
  });

  it('reads the film clock from the start the server reports', async () => {
    masterAnswers({ status: 200, start: '112.5' });

    const { result } = open(117);
    await waitFor(() => expect(player().play).toHaveBeenCalled());
    await act(async () => {
      player().emit('timeUpdate', { currentTime: 0.5, bufferedPosition: 10 });
      player().emit('timeUpdate', { currentTime: 3, bufferedPosition: 10 });
    });

    expect(result.current.cur).toBe(115.5);
  });

  it('starts at the beginning of its stream when the player lands near the end of it', async () => {
    masterAnswers({ status: 200 });

    const { result } = open();
    await waitFor(() => expect(player().play).toHaveBeenCalled());
    player().playing = false;
    player().currentTime = 80;
    await act(async () => {
      player().emit('timeUpdate', { currentTime: 0, bufferedPosition: 85 });
      player().emit('timeUpdate', { currentTime: 80, bufferedPosition: 85 });
    });
    const landed = player().currentTime;
    player().playing = true;
    await act(async () => {
      player().emit('timeUpdate', { currentTime: 0.3, bufferedPosition: 85 });
      player().emit('timeUpdate', { currentTime: 12, bufferedPosition: 20 });
    });

    expect(landed).toBe(0);
    expect(result.current.cur).toBe(12);
  });

  it('leaves a seek of the viewer where it was aimed', async () => {
    masterAnswers({ status: 200 });

    const { result } = open();
    await waitFor(() => expect(player().play).toHaveBeenCalled());
    act(() => result.current.seekTo(20));
    await act(async () => {
      player().emit('timeUpdate', { currentTime: 20, bufferedPosition: 30 });
    });

    expect(player().currentTime).toBe(20);
    expect(result.current.cur).toBe(20);
  });
});

describe('reloading', () => {
  it('opens the same stream again, asking the master first', async () => {
    const fetch = masterAnswers({ status: 200 }, { status: 200 });

    const { result } = open();
    await waitFor(() => expect(player().replaceAsync).toHaveBeenCalledTimes(1));
    act(() => result.current.reload());

    await waitFor(() => expect(player().replaceAsync).toHaveBeenCalledTimes(2));
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(player().replaceAsync.mock.calls[1]?.[0]).toMatchObject({ uri: 'hls://film@0' });
  });

  it('lands the reopened stream where it stalled rather than at its start', async () => {
    masterAnswers({ status: 200 }, { status: 200 });

    const { result } = open();
    await waitFor(() => expect(player().replaceAsync).toHaveBeenCalledTimes(1));
    act(() => result.current.reload(55));
    await waitFor(() => expect(player().replaceAsync).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(player().play).toHaveBeenCalledTimes(2));
    await act(async () => {
      player().emit('timeUpdate', { currentTime: 0.2, bufferedPosition: 60 });
    });

    expect(player().currentTime).toBe(55);
  });

  it('counts a stream as started only once it has played', async () => {
    masterAnswers({ status: 200 }, { status: 200 });

    const { result } = open();
    await waitFor(() => expect(player().replaceAsync).toHaveBeenCalledTimes(1));
    const before = result.current.started;
    await act(async () => {
      player().emit('playingChange', { isPlaying: true });
    });
    const played = result.current.started;
    act(() => result.current.reload());

    expect(before).toBe(false);
    expect(played).toBe(true);
    expect(result.current.started).toBe(false);
  });
});
