// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  fakeVideo,
  H,
  installHarness,
  kromaClientStub,
  movie,
  settle,
} from '#web/features/playback/use-video-playback.fixture';

vi.mock('@kromatv/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@kromatv/core')>()),
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

vi.mock('#web/shared/lib/api', () => ({ kromaClient: kromaClientStub }));

vi.mock('#web/shared/lib/auth', () => ({
  useAuth: () => ({ client: H.client, user: H.user }),
}));

const { useVideoPlayback } = await import('#web/features/playback/use-video-playback');
const { attachMediaSource } = await import('#web/features/playback/video-engine');

installHarness();

type Element = ReturnType<typeof fakeVideo> & { readyState: number };

function render() {
  const view = renderHook(() => useVideoPlayback(movie()));
  const v = fakeVideo({ readyState: 0, networkState: 2, seeking: false, ended: false }) as Element;
  view.result.current.videoRef.current = v as unknown as HTMLVideoElement;
  return { ...view, v };
}

function fire(v: Element, type: string) {
  const calls = v.addEventListener.mock.calls as [string, () => void][];
  const handler = [...calls].reverse().find(([name]) => name === type)?.[1];
  if (!handler) throw new Error(`nothing listens for ${type}`);
  act(() => handler());
}

const refusing = (status: number) => vi.fn(async () => ({ status, headers: { get: () => null } }));

describe('useVideoPlayback while it waits', () => {
  it('is loading from the first render, before any source is attached', () => {
    H.decision = { kind: 'web-mse', aacMaster: false };

    const { result } = renderHook(() => useVideoPlayback(movie()));

    expect(result.current.waiting).toBe(true);
    expect(result.current.waitReason).toBe('loading');
  });

  it('stops waiting once the element has data ahead of the playhead', async () => {
    H.decision = { kind: 'web-mse', aacMaster: false };
    const { result, v } = render();
    await settle();
    expect(result.current.waitReason).toBe('loading');

    v.readyState = 4;
    fire(v, 'canplay');

    expect(result.current.waiting).toBe(false);
  });

  it('is buffering when a playing film runs out of data', async () => {
    H.decision = { kind: 'web-mse', aacMaster: false };
    const { result, v } = render();
    await settle();

    v.readyState = 2;
    fire(v, 'waiting');

    expect(result.current.waitReason).toBe('buffering');
  });

  it('is buffering when the playhead stops though the element claims enough data', async () => {
    H.decision = { kind: 'web-mse', aacMaster: false };
    const { result, v } = render();
    await settle();
    v.readyState = 4;
    v.paused = false;
    v.currentTime = 5.5;
    fire(v, 'playing');
    expect(result.current.waiting).toBe(false);

    await act(async () => {
      await new Promise<void>((r) => setTimeout(r, 1100));
    });

    expect(result.current.waitReason).toBe('buffering');
  });

  it('knows the playback mode before a source is attached', () => {
    H.decision = { kind: 'web-mse', aacMaster: true };

    const { result } = renderHook(() => useVideoPlayback(movie()));

    expect(result.current.mode).toBe('transcode');
  });
});

describe('useVideoPlayback when the server refuses the stream', () => {
  it('renews the session once and plays on the fresh ticket', async () => {
    H.decision = { kind: 'web-mse', aacMaster: false };
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({ status: 401, headers: { get: () => null } })
      .mockResolvedValue({ status: 200, headers: { get: () => '0' } });
    vi.stubGlobal('fetch', fetch);

    const { result } = render();
    await settle();

    expect(H.refreshSession).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(result.current.failure).toBeNull();
    expect(vi.mocked(attachMediaSource)).toHaveBeenCalled();
  });

  it('stops spinning and says so when the renewal did not help', async () => {
    H.decision = { kind: 'web-mse', aacMaster: false };
    vi.stubGlobal('fetch', refusing(401));

    const { result } = render();
    await settle();

    expect(H.refreshSession).toHaveBeenCalledOnce();
    expect(result.current.failure).toBe('denied');
    expect(result.current.waiting).toBe(false);
    expect(result.current.playing).toBe(false);
  });

  it('picks up where the picture was when an engine is refused mid-film', async () => {
    H.decision = { kind: 'web-mse', aacMaster: false };
    const { result, v } = render();
    await settle();
    v.currentTime = 42;

    act(() => vi.mocked(attachMediaSource).mock.calls.at(-1)?.[0].onRefused(401));
    await settle();

    expect(H.refreshSession).toHaveBeenCalledOnce();
    expect(result.current.anchor).toBe(42);
    expect(result.current.failure).toBeNull();
  });

  it('calls a title the server no longer has missing, and renews nothing', async () => {
    H.decision = { kind: 'web-mse', aacMaster: false };
    vi.stubGlobal('fetch', refusing(404));

    const { result } = render();
    await settle();

    expect(H.refreshSession).not.toHaveBeenCalled();
    expect(result.current.failure).toBe('missing');
  });

  it('gives up for good once the engine has failed past every restart', async () => {
    H.decision = { kind: 'web-mse', aacMaster: false };
    const { result } = render();
    await settle();

    for (let attempt = 0; attempt < 3; attempt += 1) {
      act(() => vi.mocked(attachMediaSource).mock.calls.at(-1)?.[0].onGiveUp());
      await settle();
    }

    expect(result.current.failure).toBe('broken');
    expect(result.current.waiting).toBe(false);
  });
});
