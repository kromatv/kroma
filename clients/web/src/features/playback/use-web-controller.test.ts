// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MovieView } from '#web/shared/lib/api';

// use-web-controller is the adapter that folds the engine + subtitle + filter
// hooks into the shared PlayerController. We mock those sources and assert the
// contract it derives (playbackMode, scrub wiring, pass-through mapping).
const H = vi.hoisted(() => ({
  pb: null as Record<string, unknown> | null,
  subs: null as Record<string, unknown> | null,
  filter: { mode: 'off', setMode: vi.fn(), supported: true },
  endedHandler: null as (() => void) | null,
  rememberAudio: vi.fn(),
}));

vi.mock('#web/features/playback/use-video-playback', () => ({
  useVideoPlayback: () => H.pb,
}));
vi.mock('#web/features/playback/use-web-subtitles', () => ({
  useWebSubtitles: () => H.subs,
}));
vi.mock('#web/features/playback/web-stats', () => ({ buildWebStats: () => ({}) }));
vi.mock('@kroma/ui', () => ({
  useAudioFilter: () => H.filter,
  useT: () => (k: string) => k,
}));
// `refineTrackLang` stays REAL: "picking a track remembers its dub variant" is
// behaviour this file tests, and a stubbed matcher would only assert the stub.
vi.mock('@kroma/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@kroma/core')>()),
  audioTrackLabel: () => 'English 5.1',
  qualityBadgeForVideo: () => 'HDR',
}));
vi.mock('#web/shared/lib/lang-pref', () => ({
  useLangPrefs: () => ({ setAudio: H.rememberAudio }),
}));

const { useWebController } = await import('#web/features/playback/use-web-controller');

function fakeVideo() {
  return {
    addEventListener: vi.fn((ev: string, h: () => void) => {
      if (ev === 'ended') H.endedHandler = h;
    }),
    removeEventListener: vi.fn(),
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
    // Not plain 'fr': VFQ and VFF are two different dubs, and a viewer who
    // picked Quebec must not be handed France on the next title.
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
});
