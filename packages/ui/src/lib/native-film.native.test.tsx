// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { Dimensions } from 'react-native';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EXIT_MS, SAFETY_SLACK_MS } from '#ui/lib/intro-timing';

type Listener = (payload: unknown) => void;

const listeners = new Map<string, Listener>();

const player = vi.hoisted(() => ({
  loop: false,
  muted: true,
  volume: 1,
  duration: 10,
  play: vi.fn(),
  replaceAsync: vi.fn((_source: unknown) => Promise.resolve()),
  addListener: (name: string, listener: Listener) => {
    listeners.set(name, listener);
    return { remove: () => listeners.delete(name) };
  },
}));

const useVideoPlayer = vi.hoisted(() =>
  vi.fn((_source: unknown, setup?: (p: unknown) => void) => {
    setup?.(player);
    return player;
  }),
);

vi.mock('expo-video', () => ({ useVideoPlayer, VideoView: () => null }));

const remote = vi.hoisted(() => ({ press: (_event: { eventType: string }) => {} }));

vi.mock('react-native', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-native')>()),
  useTVEventHandler: (handler: (event: { eventType: string }) => void) => {
    remote.press = handler;
  },
}));

import { NativeFilm } from './native-film.component';

const PORTRAIT = 'portrait.mp4';

function windowOf(width: number, height: number) {
  vi.spyOn(Dimensions, 'get').mockReturnValue({ width, height, scale: 1, fontScale: 1 });
}

function emit(name: string, payload: unknown) {
  act(() => {
    listeners.get(name)?.(payload);
  });
}

function loaded(...supported: boolean[]) {
  emit('sourceLoad', { availableVideoTracks: supported.map((isSupported) => ({ isSupported })) });
}

function elapse(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

function failed() {
  emit('statusChange', { status: 'error', error: { message: 'decoder init failed' } });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  useVideoPlayer.mockClear();
  player.replaceAsync.mockClear();
  player.volume = 1;
  listeners.clear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('NativeFilm', () => {
  it('plays the portrait cut on a window taller than wide', () => {
    windowOf(390, 844);

    render(<NativeFilm portraitSrc={PORTRAIT} onDone={() => {}} />);

    expect(useVideoPlayer.mock.calls[0]?.[0]).toBe(PORTRAIT);
  });

  it('plays the HEVC film on a window wider than tall', () => {
    windowOf(1194, 834);

    render(<NativeFilm portraitSrc={PORTRAIT} onDone={() => {}} />);

    expect(String(useVideoPlayer.mock.calls[0]?.[0])).toMatch(/kroma-intro-hevc-1080/);
  });

  it('hands off once a tap skips the film', () => {
    windowOf(390, 844);
    const onDone = vi.fn();
    const { container } = render(<NativeFilm portraitSrc={PORTRAIT} onDone={onDone} />);
    const stage = container.firstElementChild;
    if (!stage) {
      throw new Error('no stage rendered');
    }

    fireEvent.mouseDown(stage);
    fireEvent.mouseUp(stage);
    fireEvent.mouseDown(stage);
    fireEvent.mouseUp(stage);
    elapse(EXIT_MS);

    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('fades the sound out as a remote Back skips the film', () => {
    windowOf(1920, 1080);
    const onDone = vi.fn();
    render(<NativeFilm onDone={onDone} />);

    act(() => remote.press({ eventType: 'back' }));
    elapse(EXIT_MS);

    expect(player.volume).toBe(0);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('ends a stalled film its own length and the slack after the player is ready', () => {
    windowOf(1920, 1080);
    const onDone = vi.fn();
    render(<NativeFilm onDone={onDone} />);

    emit('statusChange', { status: 'readyToPlay' });
    elapse(10_000 + SAFETY_SLACK_MS + EXIT_MS);

    expect(onDone).toHaveBeenCalledTimes(1);
  });
});

describe('NativeFilm on a device that cannot decode HEVC', () => {
  beforeEach(() => windowOf(1920, 1080));

  it('keeps a film whose video the device decodes', () => {
    render(<NativeFilm onDone={() => {}} />);

    loaded(false, true);

    expect(player.replaceAsync).not.toHaveBeenCalled();
  });

  it('plays the H.264 film when the device reports no decoder for the HEVC video', () => {
    render(<NativeFilm onDone={() => {}} />);

    loaded(false);

    expect(String(player.replaceAsync.mock.calls[0]?.[0])).toMatch(/kroma-intro-h264/);
  });

  it('plays the H.264 film when the player fails on the HEVC one', () => {
    render(<NativeFilm onDone={() => {}} />);

    failed();

    expect(String(player.replaceAsync.mock.calls[0]?.[0])).toMatch(/kroma-intro-h264/);
  });

  it('pays no heed to a failure of the film it is leaving', () => {
    const onDone = vi.fn();
    render(<NativeFilm onDone={onDone} />);

    loaded(false);
    failed();

    expect(onDone).not.toHaveBeenCalled();
  });

  it('hands off at once when the H.264 film cannot play either', () => {
    const onDone = vi.fn();
    render(<NativeFilm onDone={onDone} />);

    failed();
    loaded(false);

    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('hands off at once when the portrait cut cannot play', () => {
    windowOf(390, 844);
    const onDone = vi.fn();
    render(<NativeFilm portraitSrc={PORTRAIT} onDone={onDone} />);

    loaded(false);

    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
