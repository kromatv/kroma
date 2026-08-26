// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { H, installHarness, item, makePb } from '#web/features/playback/use-web-controller.fixture';

vi.mock('#web/features/playback/use-video-playback', () => ({
  useVideoPlayback: () => H.pb,
}));
vi.mock('#web/features/playback/use-web-subtitles', () => ({
  useWebSubtitles: () => H.subs,
}));
vi.mock('#web/features/playback/web-stats', () => ({
  buildWebStats: (s: Record<string, unknown>) => {
    H.statsInput = s;
    return { mode: 'stub' };
  },
}));
vi.mock('@kroma/ui', () => ({
  useAudioFilter: () => H.filter,
  useLocale: () => 'en',
  useT: () => (k: string) => k,
}));
// `refineTrackLang` stays REAL: a stubbed matcher would only assert the stub.
vi.mock('@kroma/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@kroma/core')>()),
  audioTrackLabel: () => 'English 5.1',
  qualityBadgeForVideo: () => H.badge,
}));
vi.mock('#web/shared/lib/lang-pref', () => ({
  useLangPrefs: () => ({ setAudio: H.rememberAudio }),
}));

const { useWebController } = await import('#web/features/playback/use-web-controller');

installHarness();

function render() {
  return renderHook(() => useWebController(item));
}

describe('useWebController picture-in-picture', () => {
  const setDoc = (key: string, value: unknown) =>
    Object.defineProperty(document, key, { value, configurable: true });

  afterEach(() => {
    setDoc('pictureInPictureEnabled', false);
    setDoc('pictureInPictureElement', null);
  });

  it('follows the browser floating window in and out', () => {
    const { result } = render();
    expect(result.current.controller.pipActive).toBe(false);
    act(() => H.handlers.enterpictureinpicture?.());
    expect(result.current.controller.pipActive).toBe(true);
    act(() => H.handlers.leavepictureinpicture?.());
    expect(result.current.controller.pipActive).toBe(false);
  });

  it('does nothing where the browser has no picture-in-picture', () => {
    const { result } = render();
    const v = H.pb?.videoRef as { current: { requestPictureInPicture: ReturnType<typeof vi.fn> } };
    act(() => result.current.controller.togglePip());
    expect(v.current.requestPictureInPicture).not.toHaveBeenCalled();
  });

  it('opens the floating window, and closes it when it is already open', () => {
    setDoc('pictureInPictureEnabled', true);
    const { result } = render();
    const v = H.pb?.videoRef as { current: { requestPictureInPicture: ReturnType<typeof vi.fn> } };
    act(() => result.current.controller.togglePip());
    expect(v.current.requestPictureInPicture).toHaveBeenCalledTimes(1);

    const exitPictureInPicture = vi.fn(() => Promise.resolve());
    setDoc('pictureInPictureElement', {});
    setDoc('exitPictureInPicture', exitPictureInPicture);
    act(() => result.current.controller.togglePip());
    expect(exitPictureInPicture).toHaveBeenCalledTimes(1);
    expect(v.current.requestPictureInPicture).toHaveBeenCalledTimes(1);
  });

  it('swallows a request or an exit the browser refuses', async () => {
    setDoc('pictureInPictureEnabled', true);
    const refuse = () => Promise.reject(new Error('user gesture required'));
    H.pb = makePb();
    const v = H.pb.videoRef as { current: { requestPictureInPicture: () => Promise<void> } };
    v.current.requestPictureInPicture = vi.fn(refuse);
    const { result } = render();

    await act(async () => {
      result.current.controller.togglePip();
      await new Promise<void>((r) => setTimeout(r, 0));
    });

    setDoc('pictureInPictureElement', {});
    setDoc('exitPictureInPicture', vi.fn(refuse));
    await act(async () => {
      result.current.controller.togglePip();
      await new Promise<void>((r) => setTimeout(r, 0));
    });
    expect(result.current.controller.pipActive).toBe(false);
  });
});

describe('useWebController stream size probe', () => {
  const headers = (map: Record<string, string>) => ({
    headers: { get: (k: string) => map[k] ?? null },
  });

  async function settle() {
    await act(async () => {
      await new Promise<void>((r) => setTimeout(r, 0));
    });
  }

  it('takes the total from a Content-Range and feeds it to the stats snapshot', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => headers({ 'Content-Range': 'bytes 0-1/1234567' })),
    );
    const { result } = render();
    await settle();
    result.current.controller.getStats();
    expect(H.statsInput).toMatchObject({ bytes: 1234567, item, audioIndex: 0, useHls: false });
  });

  it('falls back to a Content-Length', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => headers({ 'Content-Length': '999' })),
    );
    const { result } = render();
    await settle();
    result.current.controller.getStats();
    expect(H.statsInput).toMatchObject({ bytes: 999 });
  });

  it('reports no size when the probe fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline');
      }),
    );
    const { result } = render();
    await settle();
    result.current.controller.getStats();
    expect(H.statsInput).toMatchObject({ bytes: 0 });
  });
});
