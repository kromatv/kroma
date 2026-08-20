import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';
import type { MovieView } from '#web/shared/lib/api';

/** The engine/subtitle surface the `useWebController` suites stub out. */
export const H = {
  pb: null as Record<string, unknown> | null,
  subs: null as Record<string, unknown> | null,
  filter: { mode: 'off', setMode: vi.fn(), supported: true },
  endedHandler: null as (() => void) | null,
  handlers: {} as Record<string, () => void>,
  badge: 'HDR' as string | null,
  statsInput: null as Record<string, unknown> | null,
  rememberAudio: vi.fn(),
};

function fakeVideo() {
  return {
    addEventListener: vi.fn((ev: string, h: () => void) => {
      H.handlers[ev] = h;
      if (ev === 'ended') H.endedHandler = h;
    }),
    removeEventListener: vi.fn(),
    requestPictureInPicture: vi.fn(() => Promise.resolve()),
  };
}

export function makePb(over: Record<string, unknown> = {}) {
  return {
    videoRef: { current: fakeVideo() },
    containerRef: { current: null },
    anchor: 0,
    audioIndex: 0,
    baseSec: 0,
    cur: 12,
    dur: 100,
    bufEnd: 40,
    playing: true,
    waiting: false,
    ready: true,
    useHls: false,
    aac: false,
    volume: 1,
    muted: false,
    rate: 1,
    fs: false,
    audioTracks: [{ index: 0, language: 'eng' }],
    hlsRef: { current: null },
    shakaRef: { current: null },
    enginePref: 'auto',
    setEnginePref: vi.fn(),
    togglePlay: vi.fn(),
    seekTo: vi.fn(),
    skip: vi.fn(),
    setVol: vi.fn(),
    toggleMute: vi.fn(),
    applyRate: vi.fn(),
    setAudio: vi.fn(),
    toggleFullscreen: vi.fn(),
    ...over,
  };
}

function makeSubs(over: Record<string, unknown> = {}) {
  return {
    subtitles: [{ index: 0, language: 'eng', codec: 'subrip', selectable: true }],
    activeIndex: null,
    setActive: vi.fn(),
    subtitleGen: {
      canCreate: false,
      caps: null,
      pending: [],
      onCancel: vi.fn(),
      onDelete: vi.fn(),
      onStart: vi.fn(),
    },
    label: 'Off',
    ...over,
  };
}

export const item = {
  id: 'm1',
  stream: '/stream.m3u8',
  video: {},
  subs: [],
} as unknown as MovieView;

/** Registers the per-test reset every `useWebController` suite shares. */
export function installHarness(): void {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ headers: { get: () => null } })),
    );
    H.endedHandler = null;
    H.handlers = {};
    H.badge = 'HDR';
    H.statsInput = null;
    H.filter = { mode: 'off', setMode: vi.fn(), supported: true };
    H.pb = makePb();
    H.subs = makeSubs();
    H.rememberAudio.mockClear();
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });
}
