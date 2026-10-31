// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { Dimensions } from 'react-native';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EXIT_MS } from '#ui/lib/intro-timing';

const useVideoPlayer = vi.hoisted(() =>
  vi.fn((_source: unknown, setup?: (player: unknown) => void) => {
    const player = {
      loop: false,
      muted: true,
      volume: 1,
      duration: 10,
      play: vi.fn(),
      addListener: () => ({ remove: () => {} }),
    };
    setup?.(player);
    return player;
  }),
);

vi.mock('expo-video', () => ({ useVideoPlayer, VideoView: () => null }));

import { NativeFilm } from './native-film';

const PORTRAIT = 'portrait.mp4';

function windowOf(width: number, height: number) {
  vi.spyOn(Dimensions, 'get').mockReturnValue({ width, height, scale: 1, fontScale: 1 });
}

beforeEach(() => {
  vi.useFakeTimers();
  useVideoPlayer.mockClear();
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

  it('keeps the landscape film on a window wider than tall', () => {
    windowOf(1194, 834);

    render(<NativeFilm portraitSrc={PORTRAIT} onDone={() => {}} />);

    expect(useVideoPlayer.mock.calls[0]?.[0]).not.toBe(PORTRAIT);
  });

  it('hands off once a tap skips the film', () => {
    windowOf(390, 844);
    const onDone = vi.fn();
    const { container } = render(<NativeFilm portraitSrc={PORTRAIT} onDone={onDone} />);
    const stage = container.firstElementChild;
    if (!stage) throw new Error('no stage rendered');

    fireEvent.mouseDown(stage);
    fireEvent.mouseUp(stage);
    act(() => vi.advanceTimersByTime(EXIT_MS));

    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
