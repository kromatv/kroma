// @vitest-environment jsdom
//
// Theme playback on the native half (Apple TV / Android TV / phones).
//
// Same feature as themeAudio.web.ts, on the only machinery the native targets
// have - the browser half is built on `new Audio()`, and reaching for that in
// React Native threw a ReferenceError the runtime turned into SIGABRT, so
// opening a series page killed the app outright.
//
// What makes this half worth pinning is that the replacement has its own way of
// killing the app. expo-video releases the native object when the screen goes,
// and a READ after that is not a soft failure: it throws NotFoundException out
// of the Swift bridge, which React Native also turns into SIGABRT. So the hook
// keeps its own notion of the level and never reads the player's - a rule that
// nothing in the types enforces and that one innocent `player.volume` restores.
// The mock below makes reading throw, exactly like the real thing.
//
// The rest is shared with the web half by design: the same quiet level, the same
// fades, the same stored preference, so a television and a browser cannot
// disagree about how loud a series page is.

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FADE_IN_MS, FADE_OUT_MS, TARGET_VOLUME } from '#ui/lib/theme-audio';

/** The slice of an expo-video player this hook drives. */
interface FakePlayer {
  loop: boolean;
  volume: number;
  play: ReturnType<typeof vi.fn>;
  pause: ReturnType<typeof vi.fn>;
  /** Set once the screen is gone: every access throws, like the released native
   *  object does. */
  released: boolean;
  /** Proof the hook never reads the level back off the player. */
  reads: number;
  /** The level as last WRITTEN, readable by the test without tripping the guard
   *  above - which is the only reason it is separate from `volume`. */
  written: number;
}

let players: FakePlayer[] = [];
let sources: (string | null)[] = [];

const useVideoPlayer = vi.hoisted(() => {
  /** One player per source, created once - which is what the real hook does,
   *  and what the effects below key on. A fresh object per render would restart
   *  the theme on every render instead. */
  const cache = new Map<string | null, unknown>();

  const build = (setup?: (player: unknown) => void) => {
    const player = {
      loop: false,
      play: vi.fn(),
      pause: vi.fn(),
      released: false,
      reads: 0,
      written: 0,
      get volume() {
        player.reads += 1;
        // THE BUG THIS GUARDS: a read after release throws out of the Swift
        // bridge, and React Native turns that into SIGABRT.
        if (player.released) throw new Error('NotFoundException: native shared object');
        return player.written;
      },
      set volume(next: number) {
        if (player.released) throw new Error('NotFoundException: native shared object');
        player.written = next;
      },
    };
    setup?.(player);
    return player;
  };

  const hook = vi.fn((source: string | null, setup?: (player: unknown) => void) => {
    const existing = cache.get(source);
    if (existing) return existing;
    const player = build(setup);
    cache.set(source, player);
    players.push(player as unknown as FakePlayer);
    sources.push(source);
    return player;
  });

  return Object.assign(hook, { reset: () => cache.clear() });
});

vi.mock('expo-video', () => ({ useVideoPlayer }));

const store = new Map<string, string>();
vi.mock('@kroma/core', () => ({
  deviceStorage: () => ({
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
  }),
}));

import { useThemeAudio } from './themeAudio';

/** The player the hook most recently built. */
function player(): FakePlayer {
  const last = players.at(-1);
  if (!last) throw new Error('the hook never built a player');
  return last;
}

/** Its level as last written. Deliberately NOT `player().volume`: reading that
 *  would count against the assertion that the hook never reads it. */
function level(): number {
  return player().written;
}

const MUTE_KEY = 'kroma.theme.muted';
const THEME = 'https://kroma.test/theme.mp3';

beforeEach(() => {
  players = [];
  sources = [];
  store.clear();
  useVideoPlayer.reset();
  vi.clearAllMocks();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('what the hook reports', () => {
  it('is active only when there is a theme to play', () => {
    const { result } = renderHook(({ url }) => useThemeAudio(url), {
      initialProps: { url: null as string | null },
    });
    // The mute toggle only renders when a theme exists.
    expect(result.current.active).toBe(false);

    const withTheme = renderHook(() => useThemeAudio(THEME));
    expect(withTheme.result.current.active).toBe(true);
  });

  it('starts from the stored preference, not from its own state', () => {
    store.set(MUTE_KEY, '1');
    const { result } = renderHook(() => useThemeAudio(THEME));
    // Muted on another page means muted here, on first render.
    expect(result.current.muted).toBe(true);
  });
});

describe('the player it builds', () => {
  it('loops silently, so nothing is heard before the fade starts', () => {
    renderHook(() => useThemeAudio(THEME));
    expect(sources.at(-1)).toBe(THEME);
    expect(player().loop).toBe(true);
  });

  it('builds a player with no source when there is no theme', () => {
    renderHook(() => useThemeAudio(null));
    expect(sources.at(-1)).toBeNull();
    expect(player().play).not.toHaveBeenCalled();
  });
});

describe('fading in', () => {
  it('plays and ramps to the quiet level over the design’s fade', () => {
    renderHook(() => useThemeAudio(THEME));
    expect(player().play).toHaveBeenCalledOnce();

    act(() => void vi.advanceTimersByTime(FADE_IN_MS / 2));
    // Halfway is halfway: audible, but not yet at the target.
    expect(level()).toBeGreaterThan(0);
    expect(level()).toBeLessThan(TARGET_VOLUME);

    act(() => void vi.advanceTimersByTime(FADE_IN_MS));
    expect(level()).toBeCloseTo(TARGET_VOLUME, 5);
  });

  it('never overshoots the quiet level', () => {
    renderHook(() => useThemeAudio(THEME));
    act(() => void vi.advanceTimersByTime(FADE_IN_MS * 4));
    // A theme is background: louder than TARGET_VOLUME is competing with the user.
    expect(level()).toBeLessThanOrEqual(TARGET_VOLUME);
  });

  it('stays silent when the device is muted', () => {
    store.set(MUTE_KEY, '1');
    renderHook(() => useThemeAudio(THEME));
    act(() => void vi.advanceTimersByTime(FADE_IN_MS * 2));
    expect(player().play).not.toHaveBeenCalled();
    expect(level()).toBe(0);
  });

  it('plays nothing when there is no theme', () => {
    renderHook(() => useThemeAudio(null));
    act(() => void vi.advanceTimersByTime(FADE_IN_MS * 2));
    expect(player().play).not.toHaveBeenCalled();
  });
});

describe('leaving the page', () => {
  it('fades out and then PAUSES', () => {
    const { unmount } = renderHook(() => useThemeAudio(THEME));
    act(() => void vi.advanceTimersByTime(FADE_IN_MS * 2));

    unmount();
    act(() => void vi.advanceTimersByTime(FADE_OUT_MS + 100));
    // The player loops. A fade-out that never reaches pause() leaves a series
    // theme playing under the next page forever.
    expect(level()).toBe(0);
    expect(player().pause).toHaveBeenCalled();
  });

  it('finishes the fade even though the screen is already gone', () => {
    const { unmount } = renderHook(() => useThemeAudio(THEME));
    act(() => void vi.advanceTimersByTime(FADE_IN_MS * 2));
    const loud = level();

    unmount();
    act(() => void vi.advanceTimersByTime(FADE_OUT_MS / 2));
    // The cleanup owns its own interval precisely so it can outlive the effect
    // that started it.
    expect(level()).toBeLessThan(loud);
    expect(level()).toBeGreaterThan(0);
  });

  it('stops quietly when the platform released the player mid-fade', () => {
    const { unmount } = renderHook(() => useThemeAudio(THEME));
    act(() => void vi.advanceTimersByTime(FADE_IN_MS * 2));

    unmount();
    player().released = true;
    // A throw here reaches no catch in React and takes the app with it.
    expect(() => act(() => void vi.advanceTimersByTime(FADE_OUT_MS * 2))).not.toThrow();
  });
});

describe('the mute toggle', () => {
  it('fades to silence, pauses, and persists the choice', () => {
    const { result } = renderHook(() => useThemeAudio(THEME));
    act(() => void vi.advanceTimersByTime(FADE_IN_MS * 2));

    act(() => result.current.toggle());
    expect(result.current.muted).toBe(true);
    // Persisted, not just held in state: the next page reads the store.
    expect(store.get(MUTE_KEY)).toBe('1');

    act(() => void vi.advanceTimersByTime(500));
    expect(level()).toBe(0);
    expect(player().pause).toHaveBeenCalled();
  });

  it('plays again and fades back up when unmuted', () => {
    store.set(MUTE_KEY, '1');
    const { result } = renderHook(() => useThemeAudio(THEME));
    expect(player().play).not.toHaveBeenCalled();

    act(() => result.current.toggle());
    expect(result.current.muted).toBe(false);
    expect(store.get(MUTE_KEY)).toBe('0');
    expect(player().play).toHaveBeenCalledOnce();

    act(() => void vi.advanceTimersByTime(600));
    expect(level()).toBeCloseTo(TARGET_VOLUME, 5);
  });

  it('reads the STORE rather than its own state, so two pages agree', () => {
    const { result } = renderHook(() => useThemeAudio(THEME));
    // Another detail page muted it while this one was mounted.
    store.set(MUTE_KEY, '1');
    act(() => result.current.toggle());
    // Toggling from what is stored, not from what this hook last rendered.
    expect(result.current.muted).toBe(false);
  });

  it('survives a player the platform already released', () => {
    const { result } = renderHook(() => useThemeAudio(THEME));
    player().released = true;
    expect(() => act(() => result.current.toggle())).not.toThrow();
  });
});

describe('the rule that keeps the app alive', () => {
  it('NEVER reads the level back off the player', () => {
    const { result, unmount } = renderHook(() => useThemeAudio(THEME));
    act(() => void vi.advanceTimersByTime(FADE_IN_MS * 2));
    act(() => result.current.toggle());
    act(() => void vi.advanceTimersByTime(600));
    unmount();
    act(() => void vi.advanceTimersByTime(FADE_OUT_MS * 2));
    // Writes are guarded one by one; reads are simply never made, because a read
    // after release throws out of the Swift bridge and becomes SIGABRT.
    expect(player().reads).toBe(0);
  });

  it('tolerates a released player on every write path', () => {
    const { result } = renderHook(() => useThemeAudio(THEME));
    player().released = true;
    expect(() => act(() => void vi.advanceTimersByTime(FADE_IN_MS * 2))).not.toThrow();
    expect(() => act(() => result.current.toggle())).not.toThrow();
  });
});
