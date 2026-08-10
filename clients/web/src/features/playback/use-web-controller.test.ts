// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MovieView } from '#web/shared/lib/api';

const H = vi.hoisted(() => ({
  pb: null as Record<string, unknown> | null,
  subs: null as Record<string, unknown> | null,
  filter: { mode: 'off', setMode: vi.fn(), supported: true },
  endedHandler: null as (() => void) | null,
  handlers: {} as Record<string, () => void>,
  badge: 'HDR' as string | null,
  statsInput: null as Record<string, unknown> | null,
  rememberAudio: vi.fn(),
}));

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

function makePb(over: Record<string, unknown> = {}) {
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

const item = { id: 'm1', stream: '/stream.m3u8', video: {}, subs: [] } as unknown as MovieView;

function render() {
  return renderHook(() => useWebController(item));
}

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

describe('useWebController controller mapping', () => {
  it('projects the engine state and transport onto the shared contract', () => {
    const { result } = render();
    const c = result.current.controller;
    expect(c.cur).toBe(12);
    expect(c.dur).toBe(100);
    expect(c.bufEnd).toBe(40);
    expect(c.playing).toBe(true);
    expect(c.surface).toBe('video');
    expect(c.togglePlay).toBe(H.pb?.togglePlay);
    expect(c.seekTo).toBe(H.pb?.seekTo);
    expect(c.audioFilter).toBe('off');
    expect(c.audioFilterSupported).toBe(true);
  });

  it('passes the subtitle bundle through and derives the audio label', () => {
    const { result } = render();
    const c = result.current.controller;
    expect(c.subtitles).toBe(H.subs?.subtitles);
    expect(c.subtitleIndex).toBeNull();
    expect(c.setSubtitle).toBe(H.subs?.setActive);
    expect(result.current.audioLabel).toBe('English 5.1');
    expect(result.current.subtitleLabel).toBe('Off');
  });

  it('offers a single source-honest quality with the codec badge', () => {
    const { result } = render();
    expect(result.current.controller.qualities).toEqual([
      { id: 'auto', label: 'player.qualityAuto · HDR' },
    ]);
    expect(result.current.controller.qualityId).toBe('auto');
  });
});

describe('useWebController audio preference', () => {
  it("remembers the picked track's language, refined by the dub variant", () => {
    H.pb = makePb({
      audioTracks: [
        { index: 0, language: 'eng' },
        { index: 1, language: 'fre', title: 'VFQ AC3 5.1' },
        { index: 2, language: 'fre', title: 'VFF AC3 5.1' },
      ],
    });
    const { result } = render();

    result.current.controller.setAudio(1);
    expect(H.pb?.setAudio).toHaveBeenCalledWith(1);
    // Not plain 'fr': VFQ and VFF are two different dubs.
    expect(H.rememberAudio).toHaveBeenCalledWith('fr-CA');

    result.current.controller.setAudio(2);
    expect(H.rememberAudio).toHaveBeenLastCalledWith('fr-FR');
  });

  it('leaves the preference alone for a track that declares no language', () => {
    H.pb = makePb({ audioTracks: [{ index: 0, language: null, title: 'Commentary' }] });
    const { result } = render();
    result.current.controller.setAudio(0);
    expect(H.pb?.setAudio).toHaveBeenCalledWith(0);
    expect(H.rememberAudio).not.toHaveBeenCalled();
  });
});

describe('useWebController playbackMode', () => {
  it('is "direct" for a bare <video src>', () => {
    H.pb = makePb({ useHls: false });
    expect(render().result.current.playbackMode).toBe('direct');
  });
  it('is "transcode" for an AAC-master HLS stream', () => {
    H.pb = makePb({ useHls: true, aac: true });
    expect(render().result.current.playbackMode).toBe('transcode');
  });
  it('is "remux" for a stream-copy HLS master', () => {
    H.pb = makePb({ useHls: true, aac: false });
    expect(render().result.current.playbackMode).toBe('remux');
  });
});

describe('useWebController scrub', () => {
  it('previews a scrub position and commits it as a single seek', () => {
    const { result } = render();
    act(() => result.current.controller.scrubPreview(55));
    expect(result.current.controller.seekPreview).toBe(55);
    act(() => result.current.controller.scrubCommit());
    expect(H.pb?.seekTo).toHaveBeenCalledWith(55);
    expect(result.current.controller.seekPreview).toBeNull();
  });
});

describe('useWebController ended nonce', () => {
  it('bumps endedNonce when the element fires "ended"', () => {
    const { result } = render();
    expect(result.current.controller.endedNonce).toBe(0);
    expect(H.endedHandler).toBeTypeOf('function');
    act(() => H.endedHandler?.());
    expect(result.current.controller.endedNonce).toBe(1);
  });

  it('binds nothing before the element mounts', () => {
    H.pb = makePb({ videoRef: { current: null } });
    const { result } = render();
    expect(result.current.controller.endedNonce).toBe(0);
    expect(result.current.controller.pipActive).toBe(false);
    expect(H.handlers.ended).toBeUndefined();
  });

  it('drops a scrub commit that was never previewed', () => {
    const { result } = render();
    act(() => result.current.controller.scrubCommit());
    expect(H.pb?.seekTo).not.toHaveBeenCalled();
  });

  it('offers a bare quality label for a file with no codec badge', () => {
    H.badge = null;
    const { result } = render();
    expect(result.current.controller.qualities).toEqual([
      { id: 'auto', label: 'player.qualityAuto' },
    ]);
  });

  it('honours the shared contract for quality and engine picks', () => {
    const { result } = render();
    expect(() => result.current.controller.setQuality?.('auto')).not.toThrow();
    result.current.controller.setEngine?.('shaka');
    expect(H.pb?.setEnginePref).toHaveBeenCalledWith('shaka');
    expect(result.current.controller.engineId).toBe('auto');
    expect(result.current.controller.engines?.map((e) => e.id)).toEqual([
      'auto',
      'direct',
      'remux',
      'shaka',
    ]);
  });
});

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
