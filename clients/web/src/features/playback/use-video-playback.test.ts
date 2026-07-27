// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MovieView } from '#web/shared/lib/api';

// Engine selection + the media-element wiring live behind mocks; this suite drives
// the transport/seek logic the hook owns against a hand-rolled fake <video>.
const H = vi.hoisted(() => {
  const itemProgress = vi.fn();
  return {
    decision: { kind: 'direct' } as { kind: string; aacMaster?: boolean },
    tracks: [] as { index: number; default?: boolean; language?: string | null }[],
    user: null as { audioLanguage?: string | null } | null,
    itemProgress,
    // A STABLE client reference: the resume effect keys on client identity, so a
    // fresh object each render would loop and clobber `anchor`.
    client: { itemProgress },
  };
});

// The language matcher is the real one (it IS what this test exercises); the
// engine/capability surface stays stubbed.
vi.mock('@kroma/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@kroma/core')>()),
  audioTracksOf: () => H.tracks,
  capabilities: () => ({}),
  MSE_CAPS: {},
  SAFARI_CAPS: {},
  masterNeedsAac: () => false,
  selectEngine: () => H.decision,
}));

vi.mock('#web/features/playback/video-engine', () => ({
  attachMediaSource: vi.fn(() => () => {}),
  bindMediaEvents: vi.fn(() => () => {}),
}));

vi.mock('#web/shared/lib/api', () => ({
  kromaClient: () => ({
    hlsMasterUrl: (_id: string, _aac: boolean, anchor: number) => `hls://${anchor}`,
  }),
}));

vi.mock('#web/shared/lib/auth', () => ({
  useAuth: () => ({ client: H.client, user: H.user }),
}));

const { useVideoPlayback } = await import('#web/features/playback/use-video-playback');

function fakeVideo(over: Partial<Record<string, unknown>> = {}) {
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

const movie = (over: Partial<MovieView> = {}): MovieView =>
  ({ id: 'm1', durationMs: 100_000, subs: [], ...over }) as MovieView;

async function settle() {
  await act(async () => {
    await new Promise<void>((r) => setTimeout(r, 0));
  });
}

function render(item = movie()) {
  const view = renderHook(() => useVideoPlayback(item));
  const v = fakeVideo();
  view.result.current.videoRef.current = v as unknown as HTMLVideoElement;
  return { ...view, v };
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ headers: { get: () => '0' } })),
  );
  H.decision = { kind: 'direct' };
  H.tracks = [
    { index: 0, default: true, language: 'eng' },
    { index: 1, language: 'fra' },
  ];
  H.user = null;
  H.itemProgress.mockResolvedValue(null);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('useVideoPlayback initial state', () => {
  it('derives duration from the item and picks the default audio track', () => {
    const { result } = render();
    expect(result.current.playing).toBe(false);
    expect(result.current.cur).toBe(0);
    expect(result.current.dur).toBe(100);
    expect(result.current.audioIndex).toBe(0);
  });
});

describe('useVideoPlayback transport', () => {
  it('togglePlay plays a paused element and pauses a playing one', () => {
    const { result, v } = render();
    act(() => result.current.togglePlay());
    expect(v.play).toHaveBeenCalledTimes(1);
    v.paused = false;
    act(() => result.current.togglePlay());
    expect(v.pause).toHaveBeenCalledTimes(1);
  });

  it('setVol clamps to [0,1] and mutes at zero', () => {
    const { result, v } = render();
    act(() => result.current.setVol(0.4));
    expect(v.volume).toBe(0.4);
    expect(v.muted).toBe(false);
    act(() => result.current.setVol(2));
    expect(v.volume).toBe(1);
    act(() => result.current.setVol(0));
    expect(v.volume).toBe(0);
    expect(v.muted).toBe(true);
  });

  it('toggleMute flips and applyRate sets the playback rate', () => {
    const { result, v } = render();
    act(() => result.current.toggleMute());
    expect(v.muted).toBe(true);
    act(() => result.current.applyRate(1.5));
    expect(v.playbackRate).toBe(1.5);
  });
});

describe('useVideoPlayback seeking (direct play)', () => {
  it('seekTo sets an absolute currentTime clamped to [0, dur-1]', () => {
    const { result, v } = render();
    act(() => result.current.seekTo(50));
    expect(v.currentTime).toBe(50);
    act(() => result.current.seekTo(10_000)); // clamps to dur-1
    expect(v.currentTime).toBe(99);
    act(() => result.current.seekTo(-5)); // floors at 0
    expect(v.currentTime).toBe(0);
  });

  it('skip works off the absolute position', () => {
    const { result, v } = render();
    v.currentTime = 30;
    act(() => result.current.skip(10));
    expect(v.currentTime).toBe(40);
    act(() => result.current.skip(-25));
    expect(v.currentTime).toBe(15);
  });
});

describe('useVideoPlayback seeking (HLS remux)', () => {
  it('native-seeks inside the buffered range, otherwise re-anchors', async () => {
    H.decision = { kind: 'web-mse', aacMaster: false };
    const { result } = render();
    await settle(); // let the base-offset fetch resolve
    // Buffered [0,100]: a target inside it is an in-place native seek.
    result.current.videoRef.current = fakeVideo({
      buffered: { length: 1, start: () => 0, end: () => 100 },
    }) as unknown as HTMLVideoElement;
    act(() => result.current.seekTo(50));
    expect(result.current.videoRef.current?.currentTime).toBe(50);
    expect(result.current.anchor).toBe(0);

    // Unbuffered target → re-anchor (remount at the target).
    result.current.videoRef.current = fakeVideo() as unknown as HTMLVideoElement;
    act(() => result.current.seekTo(80));
    await settle();
    expect(result.current.anchor).toBe(80);
  });

  it('switching audio re-anchors at the current position', async () => {
    H.decision = { kind: 'web-mse', aacMaster: false };
    const { result } = render();
    await settle();
    result.current.videoRef.current = fakeVideo({ currentTime: 42 }) as unknown as HTMLVideoElement;
    act(() => result.current.setAudio(1));
    await settle();
    expect(result.current.audioIndex).toBe(1);
    expect(result.current.anchor).toBe(42); // floor(baseSec 0 + 42)
  });
});

describe('useVideoPlayback scrub bar math', () => {
  it('maps a clientX on the bar to a preview time and commits it', () => {
    const { result, v } = render();
    result.current.barRef.current = {
      getBoundingClientRect: () => ({ left: 0, width: 100 }) as DOMRect,
    } as unknown as HTMLDivElement;
    act(() => result.current.scrubToClientX(50)); // mid-bar → 50% of 100s
    expect(result.current.scrubPreview).toBe(50);
    act(() => result.current.commitScrub());
    expect(v.currentTime).toBe(50);
    expect(result.current.scrubPreview).toBeNull();
  });
});

describe('useVideoPlayback preferred audio', () => {
  it('applies the account audio language once the session hydrates', async () => {
    H.user = { audioLanguage: 'fr' };
    const { result } = render();
    await settle();
    expect(result.current.audioIndex).toBe(1); // the 'fra' track
  });
});
