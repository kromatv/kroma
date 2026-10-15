import { act, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';
import type { MovieView } from '#web/shared/lib/api';

const itemProgress = vi.fn();

/** The engine/session surface the `useVideoPlayback` suites stub out. A test
 * assigns to a field before rendering; `installHarness` resets them all. */
export const H = {
  decision: { kind: 'direct' } as { kind: string; aacMaster?: boolean },
  tracks: [] as { index: number; default?: boolean; language?: string | null }[],
  user: null as { audioLanguage?: string | null } | null,
  itemProgress,
  masterNeedsAac: vi.fn(),
  refreshSession: vi.fn((): Promise<string | undefined> => Promise.resolve('fresh')),
  mseCaps: { caps: 'mse' },
  safariCaps: { caps: 'safari' },
  frame: { current: null as HTMLDivElement | null },
  // A STABLE client reference: the resume effect keys on client identity, so a
  // fresh object each render would loop and clobber `anchor`.
  client: { playback: { itemProgress } },
};

export function kromaClientStub() {
  return {
    media: { hlsMasterUrl: (_id: string, _aac: boolean, anchor: number) => `hls://${anchor}` },
    refreshSession: H.refreshSession,
  };
}

export function fakeVideo(over: Partial<Record<string, unknown>> = {}) {
  return {
    paused: true,
    currentTime: 0,
    volume: 1,
    muted: false,
    playbackRate: 1,
    duration: Number.NaN,
    buffered: { length: 0, start: () => 0, end: () => 0 },
    play: vi.fn(() => Promise.resolve()),
    pause: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    ...over,
  };
}

export const movie = (over: Partial<MovieView> = {}): MovieView =>
  ({ id: 'm1', durationMs: 100_000, subs: [], ...over }) as MovieView;

const ticks = async (left: number): Promise<void> => {
  if (left === 0) return;
  await new Promise<void>((r) => setTimeout(r, 0));
  return ticks(left - 1);
};

export async function settle() {
  await act(() => ticks(8));
}

// The engine override is persisted per device, so without a fresh store each
// test inherits whatever the last `setEnginePref` left behind - which decides
// `decision.kind`, and with it half of what this suite asserts.
function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    key: (i: number) => [...map.keys()][i] ?? null,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, String(v));
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
    clear: () => map.clear(),
  };
}

/** Registers the per-test reset every `useVideoPlayback` suite shares. */
export function installHarness(): void {
  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryStorage());
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ headers: { get: () => '0' } })),
    );
    H.decision = { kind: 'direct' };
    H.tracks = [
      { index: 0, default: true, language: 'eng' },
      { index: 1, language: 'fra' },
    ];
    H.user = null;
    H.frame.current = null;
    H.itemProgress.mockResolvedValue(null);
    H.masterNeedsAac.mockReturnValue(false);
    H.refreshSession.mockClear();
    H.refreshSession.mockResolvedValue('fresh');
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
}
