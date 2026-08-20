// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  fakeVideo,
  H,
  installHarness,
  movie,
  settle,
} from '#web/features/playback/use-video-playback.fixture';

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

  it('maps an absolute target onto the stream base, not the requested anchor', async () => {
    H.decision = { kind: 'web-mse', aacMaster: false };
    H.user = {};
    H.itemProgress.mockResolvedValue({ positionMs: 40_000, durationMs: 100_000 });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ headers: { get: (k: string) => (k === 'X-Hls-Start' ? '12' : null) } })),
    );

    const { result } = render();
    await settle();
    result.current.videoRef.current = fakeVideo({
      buffered: { length: 1, start: () => 0, end: () => 100 },
    }) as unknown as HTMLVideoElement;

    act(() => result.current.seekTo(30));

    expect(result.current.baseSec).toBe(12);
    expect(result.current.videoRef.current?.currentTime).toBe(18);
    expect(result.current.anchor).toBe(40);
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
