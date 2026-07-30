// @vitest-environment jsdom
//
// expo-video releases the native object when the screen goes, and a READ after
// that throws NotFoundException out of the Swift bridge, which React Native turns
// into SIGABRT. The hook must therefore never read the player's level back; the
// mock below makes reading throw, exactly like the real thing.

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FADE_IN_MS, FADE_OUT_MS, TARGET_VOLUME } from '#ui/lib/theme-audio';

interface FakePlayer {
  loop: boolean;
  volume: number;
  play: ReturnType<typeof vi.fn>;
  pause: ReturnType<typeof vi.fn>;
  released: boolean;
  reads: number;
  written: number;
}

let players: FakePlayer[] = [];
let sources: (string | null)[] = [];

const useVideoPlayer = vi.hoisted(() => {
  // One player per source, as the real hook does: a fresh object per render would
  // restart the theme on every render.
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

function player(): FakePlayer {
  const last = players.at(-1);
  if (!last) throw new Error('the hook never built a player');
  return last;
}

// Not `player().volume`: reading that would count against the assertion that the
// hook never reads the level back.
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
    expect(result.current.active).toBe(false);

    const withTheme = renderHook(() => useThemeAudio(THEME));
    expect(withTheme.result.current.active).toBe(true);
  });

  it('starts from the stored preference, not from its own state', () => {
    store.set(MUTE_KEY, '1');
    const { result } = renderHook(() => useThemeAudio(THEME));
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
    expect(level()).toBeGreaterThan(0);
    expect(level()).toBeLessThan(TARGET_VOLUME);

    act(() => void vi.advanceTimersByTime(FADE_IN_MS));
    expect(level()).toBeCloseTo(TARGET_VOLUME, 5);
  });

  it('never overshoots the quiet level', () => {
    renderHook(() => useThemeAudio(THEME));
    act(() => void vi.advanceTimersByTime(FADE_IN_MS * 4));
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
    expect(level()).toBe(0);
    expect(player().pause).toHaveBeenCalled();
  });

  it('finishes the fade even though the screen is already gone', () => {
    const { unmount } = renderHook(() => useThemeAudio(THEME));
    act(() => void vi.advanceTimersByTime(FADE_IN_MS * 2));
    const loud = level();

    unmount();
    act(() => void vi.advanceTimersByTime(FADE_OUT_MS / 2));
    expect(level()).toBeLessThan(loud);
    expect(level()).toBeGreaterThan(0);
  });

  it('stops quietly when the platform released the player mid-fade', () => {
    const { unmount } = renderHook(() => useThemeAudio(THEME));
    act(() => void vi.advanceTimersByTime(FADE_IN_MS * 2));

    unmount();
    player().released = true;
    expect(() => act(() => void vi.advanceTimersByTime(FADE_OUT_MS * 2))).not.toThrow();
  });
});

describe('the mute toggle', () => {
  it('fades to silence, pauses, and persists the choice', () => {
    const { result } = renderHook(() => useThemeAudio(THEME));
    act(() => void vi.advanceTimersByTime(FADE_IN_MS * 2));

    act(() => result.current.toggle());
    expect(result.current.muted).toBe(true);
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
    store.set(MUTE_KEY, '1');
    act(() => result.current.toggle());
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
    expect(player().reads).toBe(0);
  });

  it('tolerates a released player on every write path', () => {
    const { result } = renderHook(() => useThemeAudio(THEME));
    player().released = true;
    expect(() => act(() => void vi.advanceTimersByTime(FADE_IN_MS * 2))).not.toThrow();
    expect(() => act(() => result.current.toggle())).not.toThrow();
  });
});
