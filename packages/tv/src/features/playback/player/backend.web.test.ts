// @vitest-environment jsdom

import type { AudioTrack, KromaClient, MediaItem, PlayEnv } from '@kroma/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const E = vi.hoisted(() => ({ mpv: vi.fn(), start: vi.fn(), avplay: vi.fn(), html: vi.fn() }));

vi.mock('#tv/features/playback/player/mpvEngine', () => ({
  MpvEngine: class {
    constructor(opts: unknown) {
      E.mpv(opts);
    }
    start() {
      E.start();
    }
  },
}));
vi.mock('#tv/features/playback/player/avplayEngine', () => ({
  AvplayEngine: class {
    constructor(opts: unknown) {
      E.avplay(opts);
    }
  },
}));
vi.mock('#tv/features/playback/player/htmlEngine', () => ({
  HtmlEngine: class {
    constructor(opts: unknown) {
      E.html(opts);
    }
  },
}));

import { createTvEngine, type EnginePlan, planEngine } from './backend.web';

function track(p: Partial<AudioTrack> & { index: number }): AudioTrack {
  return {
    index: p.index,
    codec: p.codec ?? 'aac',
    channels: p.channels ?? null,
    language: p.language ?? null,
    title: p.title ?? null,
    default: p.default ?? false,
  };
}

function makeItem(p: { container?: string; videoCodec?: string; audio?: AudioTrack[] }): MediaItem {
  const audio = p.audio ?? [track({ index: 0, codec: 'aac', channels: 2, default: true })];
  return {
    container: p.container ?? 'mp4',
    video: { codec: p.videoCodec ?? 'h264', bitDepth: 8 },
    audio: audio[0] ?? null,
    audioTracks: audio,
    durationMs: 1000,
  } as unknown as MediaItem;
}

const env = (over: Partial<PlayEnv> = {}): PlayEnv => ({ platform: 'web', safari: false, ...over });

const PLAIN_MP4 = makeItem({ container: 'mp4', videoCodec: 'h264' });
const MKV = makeItem({ container: 'mkv', videoCodec: 'hevc' });
const AV1_MP4 = makeItem({ container: 'mp4', videoCodec: 'av1' });
const AVI = makeItem({ container: 'avi', videoCodec: 'h264' });
const NO_CONTAINER = { ...makeItem({}), container: null } as unknown as MediaItem;

function desktopShell() {
  vi.stubGlobal('__TAURI__', {
    core: { invoke: async () => undefined },
    event: { listen: async () => () => {} },
  });
  vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (X11; Linux x86_64) Tauri' });
}

// jsdom's <video> answers '' to every canPlayType, which would read as "this
// webview demuxes nothing"; real browsers answer 'probably' for MP4.
function webviewPlays(types: Record<string, string>) {
  vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockImplementation(
    (type: string) => (types[type] ?? '') as '' | 'maybe' | 'probably',
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('planEngine', () => {
  it('direct-plays a plain MP4 in a browser', () => {
    webviewPlays({ 'video/mp4': 'probably' });
    const plan = planEngine(PLAIN_MP4, env(), 'auto');
    expect(plan.eng).toBe('video-direct');
    expect(plan.surface).toBe('video');
    expect(plan.playbackMode).toBe('direct');
  });

  it('sends an MKV to the server remux, because no webview demuxes Matroska', () => {
    webviewPlays({ 'video/mp4': 'probably' });
    const plan = planEngine(MKV, env(), 'auto');
    expect(plan.eng).toBe('video-remux');
    expect(plan.playbackMode).not.toBe('direct');
  });

  // A forced direct-play on a container the webview cannot demux does not fail,
  // it hangs at HAVE_NOTHING with no error.
  it('overrides a forced direct-play when the webview cannot demux the container', () => {
    webviewPlays({}); // demuxes nothing
    expect(planEngine(PLAIN_MP4, env(), 'webview').eng).toBe('video-remux');
  });

  it('honours an explicit remux preference over a direct-playable file', () => {
    webviewPlays({ 'video/mp4': 'probably' });
    expect(planEngine(PLAIN_MP4, env(), 'remux').eng).toBe('video-remux');
  });

  it('drives the master through Shaka by default; only the remux pref keeps hls.js', () => {
    webviewPlays({ 'video/mp4': 'probably' });
    expect(planEngine(MKV, env(), 'auto').masterShaka).toBe(true);
    expect(planEngine(MKV, env(), 'remux').masterShaka).toBe(false);
  });

  it('the shaka preference forces the master even for a direct-playable file', () => {
    webviewPlays({ 'video/mp4': 'probably' });
    const plan = planEngine(PLAIN_MP4, env(), 'shaka');
    expect(plan.eng).toBe('video-remux');
    expect(plan.masterShaka).toBe(true);
  });

  describe('on Samsung Tizen', () => {
    function tizen() {
      vi.stubGlobal('webapis', { avplay: { play: () => {} } });
      vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (SMART-TV; Tizen 6.0)' });
    }

    it('takes the AVPlay plane by default, for hardware surround', () => {
      tizen();
      const plan = planEngine(PLAIN_MP4, env({ platform: 'tizen' }), 'auto');
      expect(plan.eng).toBe('avplay');
      expect(plan.surface).toBe('avplay');
      expect(plan.deviceLabel).toBe('Samsung TV');
    });

    it('lets the viewer force the server remux instead', () => {
      tizen();
      webviewPlays({ 'video/mp4': 'probably' });
      expect(planEngine(PLAIN_MP4, env({ platform: 'tizen' }), 'remux').eng).toBe('video-remux');
    });

    // Tizen offers auto / avplay / remux; `webview` is a webOS and desktop engine.
    it('degrades an engine Tizen does not offer to the automatic choice', () => {
      tizen();
      webviewPlays({ 'video/mp4': 'probably' });
      expect(planEngine(PLAIN_MP4, env({ platform: 'tizen' }), 'webview').eng).toBe('avplay');
    });

    it('reports direct only when AVPlay can open the original file', () => {
      tizen();
      const plan = planEngine(MKV, env({ platform: 'tizen' }), 'auto');
      expect(plan.useAvplay).toBe(true);
      expect(plan.playbackMode).toBe(plan.avplayDirect ? 'direct' : 'remux');
    });
  });

  it('names an LG set from its user agent', () => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Web0S; Linux/SmartTV)' });
    webviewPlays({ 'video/mp4': 'probably' });
    expect(planEngine(PLAIN_MP4, env({ platform: 'webos' }), 'auto').deviceLabel).toBe('LG TV');
  });

  it('ignores a stored engine this platform does not offer', () => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (SMART-TV; Tizen 6.0)' });
    vi.stubGlobal('webapis', { avplay: { play: () => {} } });
    expect(planEngine(PLAIN_MP4, env({ platform: 'tizen' }), 'mpv').eng).toBe('avplay');
  });

  it('changes rebuildKey only when a decision changes', () => {
    webviewPlays({ 'video/mp4': 'probably' });
    const a = planEngine(PLAIN_MP4, env(), 'auto');
    const b = planEngine(PLAIN_MP4, env(), 'auto');
    const remuxed = planEngine(PLAIN_MP4, env(), 'remux');
    expect(a.rebuildKey).toBe(b.rebuildKey);
    expect(a.rebuildKey).not.toBe(remuxed.rebuildKey);
  });

  it('takes the avplay preference at its word on a Tizen set', () => {
    vi.stubGlobal('webapis', { avplay: { play: () => {} } });
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (SMART-TV; Tizen 6.0)' });
    expect(planEngine(MKV, env({ platform: 'tizen' }), 'avplay').eng).toBe('avplay');
  });

  it('reports a remux when AVPlay cannot demux the original container', () => {
    vi.stubGlobal('webapis', { avplay: { play: () => {} } });
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (SMART-TV; Tizen 6.0)' });
    const plan = planEngine(AVI, env({ platform: 'tizen' }), 'auto');
    expect(plan.avplayDirect).toBe(false);
    expect(plan.playbackMode).toBe('remux');
  });

  it('marks the webOS master a transcode, because its MSE cannot decode AC3', () => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Web0S; Linux/SmartTV)' });
    webviewPlays({ 'video/mp4': 'probably' });
    const plan = planEngine(AV1_MP4, env({ platform: 'webos' }), 'auto');
    expect(plan.eng).toBe('video-remux');
    expect(plan.masterAac).toBe(true);
    expect(plan.playbackMode).toBe('transcode');
  });

  it('sends an item with no container at all to the remux', () => {
    webviewPlays({ 'video/mp4': 'probably' });
    expect(planEngine(NO_CONTAINER, env(), 'webview').eng).toBe('video-remux');
  });

  it('assumes the container is playable where there is no document to ask', () => {
    vi.stubGlobal('document', undefined);
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Macintosh)' });
    expect(planEngine(MKV, env(), 'webview').eng).toBe('video-direct');
  });

  describe('on the desktop shell', () => {
    it('opens the original file through mpv, on its own plane', () => {
      desktopShell();
      const plan = planEngine(PLAIN_MP4, env({ platform: 'desktop' }), 'auto');
      expect(plan.eng).toBe('mpv');
      expect(plan.surface).toBe('mpv');
      expect(plan.useMpv).toBe(true);
      expect(plan.playbackMode).toBe('direct');
      expect(plan.deviceLabel).toBe('Desktop');
    });

    it('honours an explicit mpv preference for a container no webview demuxes', () => {
      desktopShell();
      expect(planEngine(MKV, env({ platform: 'desktop' }), 'mpv').eng).toBe('mpv');
    });
  });

  it('names an unknown browser plainly, with or without a user agent to read', () => {
    webviewPlays({ 'video/mp4': 'probably' });
    vi.stubGlobal('navigator', {});
    expect(planEngine(PLAIN_MP4, env(), 'auto').deviceLabel).toBe('TV');
    vi.stubGlobal('navigator', undefined);
    expect(planEngine(PLAIN_MP4, env(), 'auto').deviceLabel).toBe('TV');
  });
});

describe('createTvEngine', () => {
  const client = {} as KromaClient;
  const listeners = {} as never;

  const plan = (over: Partial<EnginePlan>): EnginePlan => ({
    eng: 'video-direct',
    surface: 'video',
    useMpv: false,
    useAvplay: false,
    avplayDirect: false,
    direct: true,
    masterAac: false,
    masterShaka: true,
    playbackMode: 'direct',
    deviceLabel: 'TV',
    rebuildKey: 'k',
    ...over,
  });

  const args = (over: Partial<EnginePlan>, video: HTMLVideoElement | null = null) => ({
    plan: plan(over),
    client,
    item: PLAIN_MP4,
    durationSec: 100,
    rendition: 2,
    startSec: 5,
    audioFilter: 'off' as const,
    dom: { video, nativeHls: true },
    listeners,
  });

  beforeEach(() => {
    E.mpv.mockClear();
    E.start.mockClear();
    E.avplay.mockClear();
    E.html.mockClear();
  });

  it('opens the original file with mpv, starting it outside the constructor', () => {
    expect(createTvEngine(args({ eng: 'mpv' }))).not.toBeNull();
    expect(E.mpv).toHaveBeenCalledWith(
      expect.objectContaining({ direct: true, initialRendition: 2, startSec: 5 }),
    );
    expect(E.start).toHaveBeenCalledTimes(1);
  });

  it('builds the AVPlay plane with the direct flag the plan resolved', () => {
    expect(createTvEngine(args({ eng: 'avplay', avplayDirect: true }))).not.toBeNull();
    expect(E.avplay).toHaveBeenCalledWith(expect.objectContaining({ direct: true }));
    expect(E.start).not.toHaveBeenCalled();
  });

  it('waits for the in-page element rather than building a video engine without one', () => {
    expect(createTvEngine(args({ eng: 'video-direct' }))).toBeNull();
    expect(E.html).not.toHaveBeenCalled();
  });

  it('hands the html engine the element and the master flags', () => {
    const video = document.createElement('video');
    expect(
      createTvEngine(args({ eng: 'video-remux', direct: false, masterAac: true }, video)),
    ).not.toBeNull();
    expect(E.html).toHaveBeenCalledWith(
      expect.objectContaining({
        video,
        direct: false,
        masterAac: true,
        masterShaka: true,
        forceNativeHls: true,
      }),
    );
  });
});
