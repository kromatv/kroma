// @vitest-environment jsdom

import type { MediaItem } from '@kromatv/client/media';
import { fakeClient } from '@kromatv/client/test';
import { act, cleanup, renderHook as renderOwnedHook } from '@testing-library/react';
import { vi } from 'vitest';

type Listener = (payload: never) => void;

const native = (() => {
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
      replaceAsync: vi.fn(async (_source: unknown): Promise<void> => undefined),
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
  return { box, queue: [] as ReturnType<typeof make>[], make, fresh: () => (box.current = make()) };
})();
export const P = native;

vi.doMock('expo-video', async () => {
  const { useState } = await import('react');
  return {
    useVideoPlayer: (_source: unknown, setup?: (p: unknown) => void) => {
      const [instance] = useState(() => {
        const instance = native.queue.shift() ?? native.box.current;
        setup?.(instance);
        return instance;
      });
      return instance;
    },
  };
});

vi.doMock('#mobile/player/caps', () => ({
  decideSource: () => ({ direct: true, aacMaster: false }),
  mobileVideoCodecs: () => ['hevc', 'h264'],
  downloadCopyCodecs: () => ['aac', 'ac3', 'eac3'],
}));

const { useKromaEngine } = await import('./index');
import { PlaybackOwnerProvider } from '../playback-owner';

export function renderHook<T>(callback: () => T) {
  return renderOwnedHook(callback, { wrapper: PlaybackOwnerProvider });
}

export const ITEM = {
  id: 'itm_1',
  title: 'A film',
  durationMs: 7_200_000,
  metadata: { title: 'A film' },
} as unknown as MediaItem;

export const CLIENT = fakeClient({
  media: {
    streamUrl: (id) => `stream://${id}`,
    hlsMasterUrl: (id, _aac, anchor) => `hls://${id}@${anchor}`,
    artwork: { resolve: () => null },
  },
});

export function open(startSec = 0) {
  return renderHook(() => useKromaEngine(CLIENT, ITEM, startSec));
}

export const player = () => P.box.current;

export async function reachReady() {
  await act(async () => {
    player().emit('statusChange', { status: 'readyToPlay' });
  });
}

export async function playFor(sec: number) {
  await act(async () => {
    player().emit('timeUpdate', { currentTime: sec, bufferedPosition: sec + 40 });
  });
}

export function useFixtureEngine(...args: Parameters<typeof useKromaEngine>) {
  return useKromaEngine(...args);
}

export function resetEngineFixture() {
  P.fresh();
  P.queue.length = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ headers: { get: () => '900' } })),
  );
}

export function cleanupEngineFixture() {
  cleanup();
  vi.unstubAllGlobals();
}
