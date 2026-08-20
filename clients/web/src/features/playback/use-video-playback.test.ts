// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fakeVideo,
  H,
  installHarness,
  movie,
} from '#web/features/playback/use-video-playback.fixture';

// Engine selection + the media-element wiring live behind mocks; this suite drives
// the transport/seek logic the hook owns against a hand-rolled fake <video>.
// The language matcher is the real one (it IS what this test exercises); the
// engine/capability surface stays stubbed.
vi.mock('@kroma/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@kroma/core')>()),
  audioTracksOf: () => H.tracks,
  capabilities: () => ({}),
  MSE_CAPS: H.mseCaps,
  SAFARI_CAPS: H.safariCaps,
  masterNeedsAac: H.masterNeedsAac,
  selectEngine: () => H.decision,
}));

vi.mock('#web/features/playback/media-events', () => ({
  bindMediaEvents: vi.fn(() => () => {}),
}));

vi.mock('#web/features/playback/video-engine', () => ({
  attachMediaSource: vi.fn(() => () => {}),
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

installHarness();

function render(item = movie()) {
  const view = renderHook(() => useVideoPlayback(item));
  const v = fakeVideo();
  view.result.current.videoRef.current = v as unknown as HTMLVideoElement;
  return { ...view, v };
}

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
