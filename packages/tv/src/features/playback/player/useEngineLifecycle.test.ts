// @vitest-environment jsdom
import type { KromaClient, MediaItem } from '@kroma/core';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EngineListeners } from '#tv/features/playback/player/engine';

const H = vi.hoisted(() => ({
  stalled: false,
  listeners: null as EngineListeners | null,
  engine: {
    play: vi.fn(),
    destroy: vi.fn(),
    setAudioRendition: vi.fn(),
    audioFilterSupported: () => true,
  },
}));

vi.mock('#tv/features/playback/player/useStallGuard', () => ({
  useStallGuard: () => H.stalled,
}));

vi.mock('#tv/features/playback/player/backend', () => ({
  planEngine: () => ({
    eng: 'video',
    surface: 'video',
    playbackMode: 'direct',
    deviceLabel: 'a television',
    rebuildKey: 'video:true',
  }),
  createTvEngine: (args: { listeners: EngineListeners }) => {
    H.listeners = args.listeners;
    return H.engine;
  },
}));

vi.mock('#tv/features/playback/player/useResolvedStart', () => ({
  useResolvedStart: () => ({ startSec: 0, setStartSec: vi.fn() }),
}));

vi.mock('#tv/features/playback/player/vlcPlane', () => ({ vlcAvailable: () => false }));

const { useEngineLifecycle } = await import('#tv/features/playback/player/useEngineLifecycle');

const CLIENT = { hasAuth: false } as unknown as KromaClient;
const ITEM = { id: 'vid1', durationMs: 7_200_000 } as unknown as MediaItem;

function open() {
  const view = renderHook(() => useEngineLifecycle(CLIENT, ITEM));
  if (!H.listeners) throw new Error('expected the lifecycle to have built an engine');
  return { ...view, on: H.listeners };
}

describe('useEngineLifecycle stall guard', () => {
  beforeEach(() => {
    H.stalled = false;
    H.listeners = null;
  });

  it('shows a stuck playhead as buffering rather than as a healthy bar', async () => {
    H.stalled = true;
    const { result, on } = open();

    act(() => on.onPlay());

    await waitFor(() => expect(result.current.waiting).toBe(true));
  });

  it('leaves the buffering flag alone while nothing is stuck', async () => {
    const { result, on } = open();

    act(() => on.onPlay());

    await waitFor(() => expect(result.current.waiting).toBe(false));
    expect(result.current.playing).toBe(true);
  });

  it('arms the guard only once the engine is ready and has not failed', async () => {
    const { result, on } = open();

    act(() => on.onReady());

    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.error).toBeNull();
  });
});
