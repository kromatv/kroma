// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EngineListeners, TvEngine, WatchMedia } from '#tv/features/playback/player/engine';

const built = vi.hoisted(() => ({
  listeners: null as EngineListeners | null,
  engine: null as Partial<TvEngine> | null,
}));

vi.mock('#tv/features/playback/player/backend', () => ({
  watchSurface: () => 'video',
  createWatchEngine: ({ listeners }: { listeners: EngineListeners }) => {
    built.listeners = listeners;
    return built.engine;
  },
}));

import { useWatchPlayback } from '#tv/features/playback/watch/useWatchPlayback';

const MEDIA: WatchMedia = {
  playlist: (_decoder, anchorSec) => `master/${anchorSec}`,
  plan: { forwardSec: 120, backSec: 30, maxBytes: 48_000_000 },
  durationSec: 658,
};

function engine(over: Partial<TvEngine> = {}): Partial<TvEngine> {
  return {
    play: vi.fn(),
    pause: vi.fn(),
    isPaused: vi.fn(() => false),
    position: vi.fn(() => 0),
    anchor: vi.fn(() => 0),
    duration: vi.fn(() => 658),
    bufferedEnd: vi.fn(() => 0),
    seekTo: vi.fn(),
    nudge: vi.fn(),
    restart: vi.fn(),
    setAudioRendition: vi.fn(),
    destroy: vi.fn(),
    ...over,
  };
}

const playback = (startSec = 0) =>
  renderHook(() => useWatchPlayback({} as never, MEDIA, startSec)).result;

beforeEach(() => {
  built.listeners = null;
  built.engine = engine();
});

describe('a watch player on a film that is still arriving', () => {
  it('stands at the second it opened at until the picture reports one of its own', () => {
    const result = playback(2400);

    expect(result.current.cur).toBe(2400);
  });

  it('stops wanting the film once the viewer pauses it', () => {
    const result = playback();

    act(() => result.current.togglePlay());

    expect(result.current.wanted).toBe(false);
  });

  it('counts the film as started once a frame has played', () => {
    const result = playback();

    act(() => built.listeners?.onPlaying());

    expect(result.current.started).toBe(true);
  });

  it('reads NaN where the engine has no loaded film to report', () => {
    const result = playback();

    const end = result.current.bufferedEnd();

    expect(end).toBeNaN();
  });

  it('reopens a stalled stream on the playlist it was already reading', () => {
    const reload = vi.fn();
    built.engine = engine({ reload });
    const result = playback();

    act(() => result.current.reopen('reload', 42));

    expect(reload).toHaveBeenCalledWith(42);
    expect(built.engine.restart).not.toHaveBeenCalled();
  });

  it('asks for a new anchor where the engine cannot reopen its playlist', () => {
    const result = playback();

    act(() => result.current.reopen('reload', 42));

    expect(built.engine?.restart).toHaveBeenCalledWith(42);
  });

  it('asks for a new anchor when the rule says to reanchor', () => {
    const reload = vi.fn();
    built.engine = engine({ reload });
    const result = playback();

    act(() => result.current.reopen('reanchor', 42));

    expect(built.engine.restart).toHaveBeenCalledWith(42);
    expect(reload).not.toHaveBeenCalled();
  });

  it('takes the failure back when it opens the stream again', () => {
    const result = playback();
    act(() => built.listeners?.onError());

    act(() => result.current.reopen('reload', 42));

    expect(result.current.failed).toBe(false);
  });
});
