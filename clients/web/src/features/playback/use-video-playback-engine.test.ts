// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
const { attachMediaSource } = await import('#web/features/playback/video-engine');

const lastAttach = () => {
  const calls = vi.mocked(attachMediaSource).mock.calls;
  const last = calls.at(-1)?.[0];
  if (!last) throw new Error('expected attachMediaSource to have been called');
  return last;
};

installHarness();

function render(item = movie()) {
  const view = renderHook(() => useVideoPlayback(item));
  const v = fakeVideo();
  view.result.current.videoRef.current = v as unknown as HTMLVideoElement;
  return { ...view, v };
}

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

  it('keeps Safari on native HLS unless Shaka is picked', async () => {
    vi.stubGlobal('navigator', {
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15',
    });
    H.decision = { kind: 'web-mse', aacMaster: false };
    const { result } = render();
    await settle();
    expect(lastAttach().useNativeHls).toBe(true);
    expect(lastAttach().useShaka).toBe(false);

    act(() => result.current.setEnginePref('shaka'));
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

describe('useVideoPlayback without an element', () => {
  it('re-anchors from zero when audio or engine changes before it exists', async () => {
    H.decision = { kind: 'web-mse', aacMaster: false };
    const item = movie();
    const { result } = renderHook(() => useVideoPlayback(item));
    await settle();

    act(() => result.current.setAudio(1));
    await settle();
    expect(result.current.audioIndex).toBe(1);
    expect(result.current.anchor).toBe(0);

    act(() => result.current.setEnginePref('shaka'));
    await settle();
    expect(result.current.enginePref).toBe('shaka');
    expect(result.current.anchor).toBe(0);
  });

  it('re-anchors from the stream base offset alone when the element is gone', async () => {
    H.decision = { kind: 'web-mse', aacMaster: false };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        headers: { get: (k: string) => (k === 'X-Hls-Start' ? '12' : null) },
      })),
    );
    const { result } = render();
    await settle();
    expect(result.current.baseSec).toBe(12);

    result.current.videoRef.current = null;
    act(() => result.current.setAudio(1));
    await settle();
    expect(result.current.anchor).toBe(12);

    act(() => result.current.setEnginePref('remux'));
    await settle();
    expect(result.current.anchor).toBe(12);
  });
});

describe('useVideoPlayback on Safari', () => {
  const SAFARI_UA =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15';

  beforeEach(() => {
    vi.stubGlobal('navigator', { userAgent: SAFARI_UA });
  });

  it('builds the master against the Safari codec set and keeps it on native HLS', async () => {
    const item = movie();
    const { result } = render(item);
    await settle();
    act(() => result.current.setEnginePref('remux'));
    await settle();

    expect(H.masterNeedsAac).toHaveBeenCalledWith(item, H.safariCaps);
    expect(lastAttach().useNativeHls).toBe(true);
    expect(lastAttach().useShaka).toBe(false);
  });

  it('hands the master to Shaka when the user asks for it outright', async () => {
    const { result } = render();
    await settle();
    act(() => result.current.setEnginePref('shaka'));
    await settle();
    expect(lastAttach().useNativeHls).toBe(false);
    expect(lastAttach().useShaka).toBe(true);
  });
});
