// @vitest-environment jsdom
//
// Theme playback on the web half.
//
// What makes this worth pinning is that every failure mode here is SILENT and
// long-lived. The element loops, so a fade-out that never reaches `pause()`
// leaves a series theme playing under the next page forever - the cleanup path
// deliberately uses its own interval for exactly that reason, and nothing but a
// test proves it still does. The mute preference is read from device storage
// rather than from React state, so a hook that trusted its own state would keep
// playing for a user who muted it on another page.

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FADE_IN_MS, FADE_OUT_MS, TARGET_VOLUME } from '#ui/lib/theme-audio';
import { useThemeAudio } from './themeAudio.web';

/** The slice of HTMLAudioElement the hook drives. */
interface FakeAudio {
  src: string;
  loop: boolean;
  preload: string;
  volume: number;
  paused: boolean;
  play: ReturnType<typeof vi.fn>;
  pause: ReturnType<typeof vi.fn>;
}

let created: FakeAudio[] = [];

/** `new Audio(src)` as a plain FUNCTION: `new` on a function that returns an
 *  object yields that object, which is what lets each construction be captured.
 *  A class returning from its constructor does the same thing while reading as
 *  a mistake, and an arrow cannot be `new`ed at all. */
function stubAudio(playImpl: () => unknown = () => Promise.resolve()) {
  vi.stubGlobal('Audio', function AudioStub(src: string) {
    const a: FakeAudio = {
      src,
      loop: false,
      preload: '',
      volume: 1,
      paused: true,
      play: vi.fn(() => {
        a.paused = false;
        return playImpl();
      }),
      pause: vi.fn(() => {
        a.paused = true;
      }),
    };
    created.push(a);
    return a;
  });
}

function memoryStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  });
  return map;
}

/** The element from the nth `new Audio()`. Asserted rather than indexed:
 *  `noUncheckedIndexedAccess` types a bare index as possibly-undefined, and a
 *  test that quietly skipped its assertions would be worse than one that fails. */
function audioAt(i = 0): FakeAudio {
  const a = created[i];
  if (!a) throw new Error(`no Audio element was created at index ${i}`);
  return a;
}

const MUTE_KEY = 'kroma.theme.muted';

beforeEach(() => {
  created = [];
  // shouldAdvanceTime, because the hook's effects settle on real microtasks
  // while its fades run on interval ticks; plain fake timers deadlock waitFor.
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('useThemeAudio', () => {
  it('reports inactive and builds nothing without a theme', () => {
    memoryStorage();
    stubAudio();
    const { result } = renderHook(() => useThemeAudio(null));
    expect(result.current.active).toBe(false);
    expect(created).toHaveLength(0);
  });

  it('loops the theme quietly, fading in rather than starting at full volume', async () => {
    memoryStorage();
    stubAudio();
    const { result } = renderHook(() => useThemeAudio('http://x/theme.mp3'));
    expect(result.current.active).toBe(true);

    const a = audioAt();
    expect(a.src).toBe('http://x/theme.mp3');
    expect(a.loop).toBe(true);
    // Starts SILENT: the fade is the feature, and a theme that begins at full
    // volume is the bug it exists to prevent.
    expect(a.volume).toBe(0);
    expect(a.play).toHaveBeenCalled();

    await act(async () => {
      await Promise.resolve();
      vi.advanceTimersByTime(FADE_IN_MS);
    });
    expect(a.volume).toBeCloseTo(TARGET_VOLUME, 5);
  });

  it('stays silent when the device is already muted', async () => {
    memoryStorage({ [MUTE_KEY]: '1' });
    stubAudio();
    const { result } = renderHook(() => useThemeAudio('http://x/theme.mp3'));

    expect(result.current.muted).toBe(true);
    // The element still exists - the toggle has to be able to start it - but
    // nothing was played.
    expect(audioAt().play).not.toHaveBeenCalled();
  });

  it('survives a browser that refuses to autoplay', async () => {
    memoryStorage();
    stubAudio(() => Promise.reject(new Error('NotAllowedError')));
    renderHook(() => useThemeAudio('http://x/theme.mp3'));

    // A rejected play() must not surface: autoplay-with-sound is blocked by
    // default in every browser and is expected, not exceptional.
    await act(async () => {
      await Promise.resolve();
      vi.advanceTimersByTime(FADE_IN_MS);
    });
    expect(audioAt().play).toHaveBeenCalled();
  });

  it('retries on the first gesture when autoplay was blocked', async () => {
    memoryStorage();
    stubAudio();
    renderHook(() => useThemeAudio('http://x/theme.mp3'));
    const a = audioAt();

    // Simulate the browser having refused: the element is paused again.
    a.paused = true;
    a.play.mockClear();
    await act(async () => {
      document.dispatchEvent(new Event('pointerdown'));
      await Promise.resolve();
    });
    expect(a.play).toHaveBeenCalled();
  });

  it('does not restart a theme that is already playing when a gesture arrives', async () => {
    memoryStorage();
    stubAudio();
    renderHook(() => useThemeAudio('http://x/theme.mp3'));
    const a = audioAt();
    a.play.mockClear();

    await act(async () => {
      document.dispatchEvent(new Event('pointerdown'));
      await Promise.resolve();
    });
    expect(a.play).not.toHaveBeenCalled();
  });

  it('persists the mute choice so it survives the trip to another page', async () => {
    const store = memoryStorage();
    stubAudio();
    const { result } = renderHook(() => useThemeAudio('http://x/theme.mp3'));

    // Let the fade-in finish first, so the mute below starts from a settled
    // volume rather than from wherever the ramp happened to be.
    await act(async () => {
      await Promise.resolve();
      vi.advanceTimersByTime(FADE_IN_MS);
    });

    await act(async () => {
      result.current.toggle();
    });
    expect(result.current.muted).toBe(true);
    expect(store.get(MUTE_KEY)).toBe('1');

    // Muting fades to silence and PAUSES - a loop left running at volume 0 is
    // still a decoded audio stream. Advanced past the fade rather than exactly
    // to it: the assertion is about the resting state, not the tick count.
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(audioAt().volume).toBe(0);
    expect(audioAt().pause).toHaveBeenCalled();
  });

  it('unmuting plays again and fades back to the quiet level', async () => {
    const store = memoryStorage({ [MUTE_KEY]: '1' });
    stubAudio();
    const { result } = renderHook(() => useThemeAudio('http://x/theme.mp3'));
    const a = audioAt();
    a.play.mockClear();

    await act(async () => {
      result.current.toggle();
    });
    expect(result.current.muted).toBe(false);
    expect(store.get(MUTE_KEY)).toBe('0');
    expect(a.play).toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(400);
    });
    expect(a.volume).toBeCloseTo(TARGET_VOLUME, 5);
  });

  it('fades out AND pauses on unmount, so the theme cannot outlive the page', async () => {
    memoryStorage();
    stubAudio();
    const { unmount } = renderHook(() => useThemeAudio('http://x/theme.mp3'));
    const a = audioAt();

    await act(async () => {
      await Promise.resolve();
      vi.advanceTimersByTime(FADE_IN_MS);
    });
    unmount();

    // The element loops. Reaching pause() is the entire point of the cleanup.
    await act(async () => {
      vi.advanceTimersByTime(FADE_OUT_MS);
    });
    expect(a.volume).toBe(0);
    expect(a.pause).toHaveBeenCalled();
  });

  it('a theme change stops the previous element even mid fade-in', async () => {
    memoryStorage();
    stubAudio();
    const { rerender } = renderHook(({ url }) => useThemeAudio(url), {
      initialProps: { url: 'http://x/one.mp3' },
    });
    const first = audioAt(0);

    // Swap themes PART WAY through the first fade-in. The cleanup owns a private
    // interval precisely so the new theme's fade cannot cancel it: sharing one
    // ref left the old <audio loop> playing forever.
    await act(async () => {
      vi.advanceTimersByTime(FADE_IN_MS / 3);
      rerender({ url: 'http://x/two.mp3' });
      await Promise.resolve();
    });
    await act(async () => {
      vi.advanceTimersByTime(FADE_OUT_MS + FADE_IN_MS);
    });

    expect(created).toHaveLength(2);
    expect(first.pause).toHaveBeenCalled();
    expect(first.volume).toBe(0);
    expect(audioAt(1).src).toBe('http://x/two.mp3');
  });
});
