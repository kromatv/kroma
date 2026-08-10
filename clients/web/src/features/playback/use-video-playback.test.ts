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
const { attachMediaSource } = await import('#web/features/playback/video-engine');

const lastAttach = () => {
  const calls = vi.mocked(attachMediaSource).mock.calls;
  const last = calls.at(-1)?.[0];
  if (!last) throw new Error('expected attachMediaSource to have been called');
  return last;
};

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
    for (let tick = 0; tick < 8; tick += 1) {
      await new Promise<void>((r) => setTimeout(r, 0));
    }
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

    result.current.videoRef.current = fakeVideo({
      buffered: { length: 1, start: () => 0, end: () => 10 },
    }) as unknown as HTMLVideoElement;
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

  it('leaves the default track alone when no track speaks the preferred language', async () => {
    H.user = { audioLanguage: 'de' };
    const { result } = render();
    await settle();
    expect(result.current.audioIndex).toBe(0);
  });

  it('falls back to index 0 for a file that declares no audio track at all', async () => {
    H.tracks = [];
    const { result } = render();
    await settle();
    expect(result.current.audioIndex).toBe(0);
    expect(result.current.audioTracks).toEqual([]);
  });

  it('re-selecting the current track changes nothing', async () => {
    H.decision = { kind: 'web-mse', aacMaster: false };
    const { result } = render();
    await settle();
    result.current.videoRef.current = fakeVideo({ currentTime: 42 }) as unknown as HTMLVideoElement;
    act(() => result.current.setAudio(0));
    await settle();
    expect(result.current.audioIndex).toBe(0);
    expect(result.current.anchor).toBe(0);
  });
});

describe('useVideoPlayback resume', () => {
  it('anchors at the stored position once it is past the 15s floor', async () => {
    H.user = {};
    H.itemProgress.mockResolvedValue({ positionMs: 40_000, durationMs: 100_000 });
    const { result } = render();
    await settle();
    expect(result.current.anchor).toBe(40);
  });

  it('starts over below the floor and past the 95% credits mark', async () => {
    H.user = {};
    H.itemProgress.mockResolvedValue({ positionMs: 10_000, durationMs: 100_000 });
    const early = render();
    await settle();
    expect(early.result.current.anchor).toBe(0);
    early.unmount();

    H.itemProgress.mockResolvedValue({ positionMs: 99_000, durationMs: 100_000 });
    const late = render();
    await settle();
    expect(late.result.current.anchor).toBe(0);
  });

  it('resumes a progress row whose duration nobody knows', async () => {
    H.user = {};
    H.itemProgress.mockResolvedValue({ positionMs: 40_000, durationMs: null });
    const { result } = render(movie({ durationMs: undefined }));
    await settle();
    expect(result.current.dur).toBe(0);
    expect(result.current.anchor).toBe(40);
  });

  it('starts at zero when the progress lookup fails', async () => {
    H.user = {};
    H.itemProgress.mockRejectedValue(new Error('offline'));
    const { result } = render();
    await settle();
    expect(result.current.anchor).toBe(0);
  });

  it('ignores a progress reply that lands after unmount', async () => {
    H.user = {};
    let resolveProgress: (p: unknown) => void = () => undefined;
    H.itemProgress.mockReturnValue(
      new Promise((resolve) => {
        resolveProgress = resolve;
      }),
    );
    const view = render();
    view.unmount();
    await act(async () => {
      resolveProgress({ positionMs: 60_000, durationMs: 100_000 });
      await new Promise<void>((r) => setTimeout(r, 0));
    });
    expect(view.result.current.anchor).toBe(0);
  });

  it('ignores a failed progress lookup that lands after unmount', async () => {
    H.user = {};
    let rejectProgress: (e: unknown) => void = () => undefined;
    H.itemProgress.mockReturnValue(
      new Promise((_resolve, reject) => {
        rejectProgress = reject;
      }),
    );
    const view = render();
    view.unmount();
    await act(async () => {
      rejectProgress(new Error('offline'));
      await new Promise<void>((r) => setTimeout(r, 0));
    });
    expect(view.result.current.anchor).toBe(0);
  });
});

describe('useVideoPlayback HLS master headers', () => {
  it("adopts the server's keyframe start and true duration", async () => {
    H.decision = { kind: 'web-mse', aacMaster: false };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        headers: { get: (k: string) => (k === 'X-Hls-Start' ? '12' : '5400') },
      })),
    );
    const { result } = render(movie({ durationMs: 0 }));
    await settle();
    expect(result.current.baseSec).toBe(12);
    expect(result.current.dur).toBe(5400);
  });

  it('keeps the requested anchor when the headers are unusable', async () => {
    H.decision = { kind: 'web-mse', aacMaster: false };
    H.user = {};
    H.itemProgress.mockResolvedValue({ positionMs: 40_000, durationMs: 100_000 });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ headers: { get: () => 'not-a-number' } })),
    );
    const { result } = render(movie({ durationMs: 0 }));
    await settle();
    expect(result.current.baseSec).toBe(40);
    expect(result.current.dur).toBe(0);
  });

  it('ignores master headers that land after unmount', async () => {
    H.decision = { kind: 'web-mse', aacMaster: false };
    let resolveMaster: (r: unknown) => void = () => undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise((resolve) => {
            resolveMaster = resolve;
          }),
      ),
    );
    const view = render();
    view.unmount();
    await act(async () => {
      resolveMaster({ headers: { get: () => '12' } });
      await new Promise<void>((r) => setTimeout(r, 0));
    });
    expect(view.result.current.baseSec).toBe(0);
  });

  it('ignores a failed master fetch that lands after unmount', async () => {
    H.decision = { kind: 'web-mse', aacMaster: false };
    let rejectMaster: (e: unknown) => void = () => undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise((_resolve, reject) => {
            rejectMaster = reject;
          }),
      ),
    );
    const view = render();
    view.unmount();
    await act(async () => {
      rejectMaster(new Error('master 500'));
      await new Promise<void>((r) => setTimeout(r, 0));
    });
    expect(view.result.current.baseSec).toBe(0);
  });

  it('keeps the requested anchor when the master fetch fails', async () => {
    H.decision = { kind: 'web-mse', aacMaster: false };
    H.user = {};
    H.itemProgress.mockResolvedValue({ positionMs: 40_000, durationMs: 100_000 });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('master 500');
      }),
    );
    const { result } = render();
    await settle();
    expect(result.current.baseSec).toBe(40);
  });
});

describe('useVideoPlayback engine override', () => {
  it('persists the pick and re-anchors at the position it was made from', async () => {
    const { result } = render();
    await settle();
    result.current.videoRef.current = fakeVideo({
      currentTime: 30.9,
    }) as unknown as HTMLVideoElement;
    act(() => result.current.setEnginePref('remux'));
    await settle();
    expect(result.current.enginePref).toBe('remux');
    expect(result.current.anchor).toBe(30);
    expect(lastAttach().decision.kind).toBe('web-mse');
    expect(lastAttach().useShaka).toBe(false);
  });

  it('sends the shaka override through Shaka and the direct override to a bare element', async () => {
    const view = render();
    await settle();
    act(() => view.result.current.setEnginePref('shaka'));
    await settle();
    expect(lastAttach().decision.kind).toBe('web-mse');
    expect(lastAttach().useShaka).toBe(true);

    act(() => view.result.current.setEnginePref('direct'));
    await settle();
    expect(lastAttach().decision).toEqual({ kind: 'direct', aacMaster: false });
  });

  it('assumes a non-Safari environment when there is no navigator', async () => {
    vi.stubGlobal('navigator', undefined);
    H.decision = { kind: 'web-mse', aacMaster: false };
    render();
    await settle();
    expect(lastAttach().useNativeHls).toBe(false);
    expect(lastAttach().useShaka).toBe(true);
  });
});

describe('useVideoPlayback direct-play safety net', () => {
  it('re-anchors on the HLS master at the position a media error killed', async () => {
    const { result } = render();
    await settle();
    let onError: (() => void) | undefined;
    result.current.videoRef.current = fakeVideo({
      currentTime: 31.7,
      addEventListener: vi.fn((type: string, handler: () => void) => {
        if (type === 'error') onError = handler;
      }),
    }) as unknown as HTMLVideoElement;
    act(() => result.current.setAudio(1));
    await settle();

    expect(onError).toBeTypeOf('function');
    act(() => onError?.());
    await settle();
    expect(result.current.anchor).toBe(31);
    expect(lastAttach().decision.kind).toBe('web-mse');
  });
});

describe('useVideoPlayback fullscreen', () => {
  const setDoc = (key: string, value: unknown) =>
    Object.defineProperty(document, key, { value, configurable: true });

  afterEach(() => {
    setDoc('fullscreenElement', null);
    setDoc('fullscreenEnabled', false);
  });

  it('follows the document fullscreen state', () => {
    const { result } = render();
    expect(result.current.fs).toBe(false);
    act(() => {
      setDoc('fullscreenElement', {});
      document.dispatchEvent(new Event('fullscreenchange'));
    });
    expect(result.current.fs).toBe(true);
  });

  it('requests element fullscreen, and exits when already in it', () => {
    const { result } = render();
    act(() => result.current.toggleFullscreen());

    const requestFullscreen = vi.fn();
    result.current.containerRef.current = { requestFullscreen } as unknown as HTMLDivElement;
    setDoc('fullscreenEnabled', true);
    act(() => result.current.toggleFullscreen());
    expect(requestFullscreen).toHaveBeenCalledTimes(1);

    const exitFullscreen = vi.fn();
    setDoc('fullscreenElement', {});
    setDoc('exitFullscreen', exitFullscreen);
    act(() => result.current.toggleFullscreen());
    expect(exitFullscreen).toHaveBeenCalledTimes(1);
    expect(requestFullscreen).toHaveBeenCalledTimes(1);
  });

  it('falls back to the video element API where there is no element fullscreen', () => {
    const { result } = render();
    result.current.containerRef.current = {} as unknown as HTMLDivElement;
    const webkitEnterFullscreen = vi.fn();
    result.current.videoRef.current = fakeVideo({
      webkitEnterFullscreen,
    }) as unknown as HTMLVideoElement;

    setDoc('fullscreenEnabled', true);
    act(() => result.current.toggleFullscreen());
    expect(webkitEnterFullscreen).toHaveBeenCalledTimes(1);

    setDoc('fullscreenEnabled', false);
    act(() => result.current.toggleFullscreen());
    expect(webkitEnterFullscreen).toHaveBeenCalledTimes(2);
  });

  it('does nothing when neither API is available', () => {
    const { result } = render();
    result.current.containerRef.current = {} as unknown as HTMLDivElement;
    expect(() => act(() => result.current.toggleFullscreen())).not.toThrow();
  });
});

describe('useVideoPlayback without an element', () => {
  it('leaves every transport action a no-op', () => {
    const { result } = renderHook(() => useVideoPlayback(movie()));
    act(() => {
      result.current.togglePlay();
      result.current.seekTo(10);
      result.current.skip(5);
      result.current.setVol(0.5);
      result.current.toggleMute();
      result.current.applyRate(2);
      result.current.scrubToClientX(10);
      result.current.seekToClientX(10);
    });
    expect(result.current.scrubPreview).toBeNull();
    expect(result.current.anchor).toBe(0);
    expect(result.current.getPosition()).toBe(0);
  });

  it('swallows a rejected play() and tolerates one that returns nothing', () => {
    const { result, v } = render();
    v.play = vi.fn(() => Promise.reject(new Error('NotAllowedError')));
    act(() => result.current.togglePlay());
    expect(v.play).toHaveBeenCalledTimes(1);

    v.play = vi.fn(() => undefined as unknown as Promise<void>);
    expect(() => act(() => result.current.togglePlay())).not.toThrow();
  });
});

describe('useVideoPlayback bar geometry', () => {
  const bar = (left: number, width: number) =>
    ({ getBoundingClientRect: () => ({ left, width }) as DOMRect }) as unknown as HTMLDivElement;

  it('maps a clientX against the element duration when the catalogue has none', () => {
    const { result } = render(movie({ durationMs: 0 }));
    const v = fakeVideo({ duration: 200 });
    result.current.videoRef.current = v as unknown as HTMLVideoElement;
    result.current.barRef.current = bar(0, 100);
    act(() => result.current.scrubToClientX(25));
    expect(result.current.scrubPreview).toBe(50);
    act(() => result.current.commitScrub());
    expect(v.currentTime).toBe(50);
  });

  it('reports no position while no duration is known at all', () => {
    const { result } = render(movie({ durationMs: 0 }));
    result.current.barRef.current = bar(0, 100);
    act(() => result.current.scrubToClientX(50));
    expect(result.current.scrubPreview).toBeNull();
  });

  it('reports no position before the bar is laid out', () => {
    const { result } = render();
    act(() => result.current.scrubToClientX(50));
    expect(result.current.scrubPreview).toBeNull();
  });

  it('seekToClientX seeks straight to the mapped position', () => {
    const { result, v } = render();
    result.current.barRef.current = bar(0, 200);
    act(() => result.current.seekToClientX(100));
    expect(v.currentTime).toBe(50);
  });

  it('commitScrub without a preview leaves the position alone', () => {
    const { result, v } = render();
    v.currentTime = 20;
    act(() => result.current.commitScrub());
    expect(v.currentTime).toBe(20);
  });

  it('reports the hovered position, and follows the drag once scrubbing', () => {
    const { result } = render();
    result.current.barRef.current = bar(10, 100);
    act(() => result.current.onBarMove({ clientX: 60 } as React.PointerEvent));
    expect(result.current.hover).toEqual({ x: 50, t: 50, w: 100 });
    expect(result.current.scrubPreview).toBeNull();

    act(() => result.current.setScrubbing(true));
    act(() => result.current.onBarMove({ clientX: 500 } as React.PointerEvent));
    expect(result.current.scrubPreview).toBe(100);
  });

  it('ignores a move before the bar or the duration are known', () => {
    const noBar = render();
    act(() => noBar.result.current.onBarMove({ clientX: 10 } as React.PointerEvent));
    expect(noBar.result.current.hover).toBeNull();
    noBar.unmount();

    const noDur = render(movie({ durationMs: 0 }));
    noDur.result.current.barRef.current = bar(0, 100);
    act(() => noDur.result.current.onBarMove({ clientX: 10 } as React.PointerEvent));
    expect(noDur.result.current.hover).toBeNull();
  });
});
