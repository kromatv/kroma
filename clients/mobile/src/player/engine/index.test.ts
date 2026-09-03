// @vitest-environment jsdom

import type { MediaItem } from '@kroma/client/media';
import { fakeClient } from '@kroma/client/test';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Listener = (payload: never) => void;

const P = vi.hoisted(() => {
  const make = () => {
    const listeners = new Map<string, Set<Listener>>();
    const player = {
      playing: false,
      duration: 7200,
      currentTime: 0,
      muted: false,
      playbackRate: 1,
      timeUpdateEventInterval: 0,
      staysActiveInBackground: false,
      showNowPlayingNotification: false,
      availableAudioTracks: [] as unknown[],
      audioTrack: null as unknown,
      play: vi.fn(() => {
        player.playing = true;
      }),
      pause: vi.fn(),
      replaceAsync: vi.fn(async () => undefined),
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

vi.mock('#mobile/player/caps', () => ({
  decideSource: () => ({ direct: true, aacMaster: false }),
}));

import { useKromaEngine } from './index';

const ITEM = {
  id: 'itm_1',
  title: 'A film',
  durationMs: 7_200_000,
  metadata: { title: 'A film' },
} as unknown as MediaItem;

const CLIENT = fakeClient({
  media: {
    streamUrl: (id) => `stream://${id}`,
    hlsMasterUrl: (id, _aac, anchor) => `hls://${id}@${anchor}`,
    artwork: { resolve: () => null },
  },
});

function open(startSec = 0) {
  return renderHook(() => useKromaEngine(CLIENT, ITEM, startSec));
}

const player = () => P.box.current;

async function reachReady() {
  await act(async () => {
    player().emit('statusChange', { status: 'readyToPlay' });
  });
}

async function playFor(sec: number) {
  await act(async () => {
    player().emit('timeUpdate', { currentTime: sec, bufferedPosition: sec + 40 });
  });
}

describe('useKromaEngine', () => {
  beforeEach(() => {
    P.fresh();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ headers: { get: () => '900' } })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('starts the film on its first open', async () => {
    open();
    await waitFor(() => expect(player().replaceAsync).toHaveBeenCalledTimes(1));

    await reachReady();

    expect(player().play).toHaveBeenCalledTimes(1);
  });

  it('resumes a reload the viewer had left running', async () => {
    const { result } = open();
    await waitFor(() => expect(player().replaceAsync).toHaveBeenCalledTimes(1));
    await reachReady();
    await playFor(60);

    act(() => result.current.setAudio(1));
    await waitFor(() => expect(player().replaceAsync).toHaveBeenCalledTimes(2));
    await reachReady();

    expect(player().play).toHaveBeenCalledTimes(2);
  });

  it('leaves a reload alone under a viewer who had paused', async () => {
    const { result } = open();
    await waitFor(() => expect(player().replaceAsync).toHaveBeenCalledTimes(1));
    await reachReady();
    await playFor(60);
    player().playing = false;

    act(() => result.current.setAudio(1));
    await waitFor(() => expect(player().replaceAsync).toHaveBeenCalledTimes(2));
    await reachReady();

    expect(player().play).toHaveBeenCalledTimes(1);
  });

  it('drops the old source depth rather than drawing it against the new anchor', async () => {
    const { result } = open();
    await waitFor(() => expect(player().replaceAsync).toHaveBeenCalledTimes(1));
    await reachReady();
    await playFor(600);
    expect(result.current.buffered).toBe(640);

    act(() => result.current.setAudio(1));
    await waitFor(() => expect(player().replaceAsync).toHaveBeenCalledTimes(2));

    expect(result.current.buffered).toBe(900);
  });
});
