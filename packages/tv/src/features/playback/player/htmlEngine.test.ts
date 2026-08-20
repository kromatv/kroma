// @vitest-environment jsdom
import { decodableAudioCodecs, type KromaClient, type MediaItem } from '@kroma/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EngineListeners } from './engine';
import { HtmlEngine } from './htmlEngine';

// Every master carries what this device decodes, so the server knows which audio
// it may stream-copy; jsdom probes nothing, so here that is the empty set.
const DECODABLE = decodableAudioCodecs();

// Driven against a hand-rolled fake media element. The master path is forced onto
// the native-HLS branch so no hls.js dynamic import is needed.

const shakaMock = vi.hoisted(() => ({
  supported: true,
  installAll: vi.fn(),
  attach: vi.fn(() => Promise.resolve()),
  load: vi.fn(() => Promise.resolve()),
  configure: vi.fn(),
  destroy: vi.fn(() => Promise.resolve()),
}));
vi.mock('shaka-player/dist/shaka-player.compiled.js', () => ({
  default: {
    polyfill: { installAll: shakaMock.installAll },
    Player: class {
      static isBrowserSupported() {
        return shakaMock.supported;
      }
      attach = shakaMock.attach;
      load = shakaMock.load;
      configure = shakaMock.configure;
      destroy = shakaMock.destroy;
    },
  },
}));
const hlsMock = vi.hoisted(() => ({
  supported: false,
  loadSource: vi.fn(),
  attachMedia: vi.fn(),
  destroy: vi.fn(),
}));
vi.mock('hls.js', () => ({
  default: class {
    static isSupported() {
      return hlsMock.supported;
    }
    loadSource = hlsMock.loadSource;
    attachMedia = hlsMock.attachMedia;
    destroy = hlsMock.destroy;
  },
}));

interface FakeVideo {
  el: HTMLVideoElement;
  fire(type: string): void;
  setBuffered(ranges: [number, number][]): void;
  set(key: string, value: unknown): void;
  get(key: string): unknown;
  listenerCount(type: string): number;
}

function fakeVideo(init: Record<string, unknown> = {}): FakeVideo {
  const listeners = new Map<string, Set<EventListener>>();
  let ranges: [number, number][] = [];
  const buffered = {
    get length() {
      return ranges.length;
    },
    start: (i: number) => ranges[i]?.[0] ?? 0,
    end: (i: number) => ranges[i]?.[1] ?? 0,
  };
  const v: Record<string, unknown> = {
    currentTime: 0,
    duration: Number.NaN,
    paused: true,
    preload: '',
    src: '',
    buffered,
    canPlayType: (_t: string) => '',
    play() {
      v.paused = false;
      return Promise.resolve();
    },
    pause() {
      v.paused = true;
    },
    load() {},
    removeAttribute(_n: string) {
      v.src = '';
    },
    addEventListener(t: string, fn: EventListener) {
      let s = listeners.get(t);
      if (!s) {
        s = new Set();
        listeners.set(t, s);
      }
      s.add(fn);
    },
    removeEventListener(t: string, fn: EventListener) {
      listeners.get(t)?.delete(fn);
    },
    ...init,
  };
  return {
    el: v as unknown as HTMLVideoElement,
    fire: (t: string) => {
      for (const fn of [...(listeners.get(t) ?? [])]) fn(new Event(t));
    },
    setBuffered: (r) => {
      ranges = r;
    },
    set: (k, val) => {
      v[k] = val;
    },
    get: (k) => v[k],
    listenerCount: (t) => listeners.get(t)?.size ?? 0,
  };
}

function mkListeners(): EngineListeners {
  return {
    onTime: vi.fn(),
    onDuration: vi.fn(),
    onBuffered: vi.fn(),
    onPlay: vi.fn(),
    onPause: vi.fn(),
    onWaiting: vi.fn(),
    onPlaying: vi.fn(),
    onEnded: vi.fn(),
    onError: vi.fn(),
    onReady: vi.fn(),
    onAspect: vi.fn(),
  };
}

const item = { id: 'vid1' } as unknown as MediaItem;
const tick = () => new Promise<void>((r) => setTimeout(r, 0));

function mkClient() {
  const hlsMasterUrl = vi.fn(
    (id: string, aac: boolean, startSec: number, audio: number) =>
      `master:${id}:${aac}:${startSec}:${audio}`,
  );
  const streamUrl = vi.fn((id: string) => `stream:${id}`);
  return { client: { streamUrl, hlsMasterUrl } as unknown as KromaClient, hlsMasterUrl, streamUrl };
}

function makeEngine(opts: {
  fv: FakeVideo;
  direct: boolean;
  startSec?: number;
  rendition?: number;
  masterAac?: boolean;
  masterShaka?: boolean;
  forceNativeHls?: boolean;
  durationSec?: number;
  listeners?: EngineListeners;
}) {
  const { client, hlsMasterUrl, streamUrl } = mkClient();
  const listeners = opts.listeners ?? mkListeners();
  const engine = new HtmlEngine({
    video: opts.fv.el,
    client,
    item,
    direct: opts.direct,
    masterAac: opts.masterAac ?? false,
    masterShaka: opts.masterShaka ?? false,
    forceNativeHls: opts.forceNativeHls ?? true,
    initialRendition: opts.rendition ?? 0,
    durationSec: opts.durationSec ?? 120,
    startSec: opts.startSec ?? 0,
    listeners,
  });
  return { engine, listeners, hlsMasterUrl, streamUrl };
}

function watchLegacyTier(value: boolean) {
  const seen = { reads: 0 };
  Object.defineProperty(globalThis, '__KROMA_LEGACY_TIER__', {
    configurable: true,
    get() {
      seen.reads += 1;
      return value;
    },
  });
  return seen;
}

beforeEach(() => {
  // resolveMasterStart fetches the playlist for the X-Hls-Start correction.
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve({ headers: { get: (k: string) => (k === 'X-Hls-Start' ? '7.5' : null) } }),
    ),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(globalThis, '__KROMA_LEGACY_TIER__');
});

describe('HtmlEngine master construction', () => {
  it('points the element at the anchored master with the chosen audio rendition', async () => {
    const fv = fakeVideo();
    const { hlsMasterUrl } = makeEngine({ fv, direct: false, rendition: 2, masterAac: true });
    expect(hlsMasterUrl).toHaveBeenCalledWith('vid1', true, 0, 2, { copyCodecs: DECODABLE });
    await tick();
    expect(fv.get('src')).toBe('master:vid1:true:0:2');
    expect(fv.get('preload')).toBe('auto');
  });

  it('corrects baseSec to the server keyframe start from X-Hls-Start', async () => {
    const fv = fakeVideo();
    const { engine } = makeEngine({ fv, direct: false, startSec: 30 });
    await tick();
    fv.set('currentTime', 0);
    expect(engine.position()).toBe(7.5);
  });
});

describe('HtmlEngine Shaka master', () => {
  beforeEach(() => {
    shakaMock.supported = true;
    shakaMock.installAll.mockClear();
    shakaMock.attach.mockClear();
    shakaMock.load.mockClear();
    shakaMock.destroy.mockClear();
    hlsMock.supported = false;
    hlsMock.loadSource.mockClear();
    hlsMock.attachMedia.mockClear();
  });

  it('drives the MSE master through Shaka with the anchored URL', async () => {
    const fv = fakeVideo();
    makeEngine({ fv, direct: false, masterShaka: true, forceNativeHls: false, rendition: 2 });
    await tick();
    await tick();
    expect(shakaMock.installAll).toHaveBeenCalled();
    expect(shakaMock.attach).toHaveBeenCalledWith(fv.el);
    await tick();
    expect(shakaMock.load).toHaveBeenCalledWith('master:vid1:false:0:2');
    expect(fv.get('src')).toBe('');
  });

  it('falls back to hls.js when Shaka rejects the engine', async () => {
    shakaMock.supported = false;
    const fv = fakeVideo();
    makeEngine({ fv, direct: false, masterShaka: true, forceNativeHls: false });
    await tick();
    await tick();
    expect(shakaMock.attach).not.toHaveBeenCalled();
    // The mocked hls.js reports unsupported, so the fallback lands on the element.
    expect(fv.get('src')).toBe('master:vid1:false:0:0');
  });

  it('the remux preference drives the master through hls.js', async () => {
    hlsMock.supported = true;
    const fv = fakeVideo();
    makeEngine({ fv, direct: false, masterShaka: false, forceNativeHls: false });
    await tick();
    await tick();
    expect(hlsMock.loadSource).toHaveBeenCalledWith('master:vid1:false:0:0');
    expect(hlsMock.attachMedia).toHaveBeenCalledWith(fv.el);
    expect(shakaMock.attach).not.toHaveBeenCalled();
  });

  it('destroy tears the Shaka player down', async () => {
    const fv = fakeVideo();
    const { engine } = makeEngine({ fv, direct: false, masterShaka: true, forceNativeHls: false });
    await tick();
    await tick();
    engine.destroy();
    expect(shakaMock.destroy).toHaveBeenCalled();
  });

  it('swallows a Shaka attach failure instead of loading the master', async () => {
    shakaMock.attach.mockImplementationOnce(() => Promise.reject(new Error('no mse')));
    const fv = fakeVideo();
    makeEngine({ fv, direct: false, masterShaka: true, forceNativeHls: false });
    await vi.waitFor(() => expect(shakaMock.attach).toHaveBeenCalledWith(fv.el));
    await tick();
    expect(shakaMock.load).not.toHaveBeenCalled();
  });

  it('the legacy tier drives the master through hls.js and never loads Shaka', async () => {
    hlsMock.supported = true;
    watchLegacyTier(true);
    const fv = fakeVideo();
    makeEngine({ fv, direct: false, masterShaka: true, forceNativeHls: false });
    await vi.waitFor(() =>
      expect(hlsMock.loadSource).toHaveBeenCalledWith('master:vid1:false:0:0'),
    );
    expect(shakaMock.installAll).not.toHaveBeenCalled();
  });

  it('a destroy while Shaka is still loading never attaches a player', async () => {
    const seen = watchLegacyTier(false);
    const fv = fakeVideo();
    const { engine } = makeEngine({ fv, direct: false, masterShaka: true, forceNativeHls: false });
    for (let i = 0; i < 200 && seen.reads === 0; i += 1) await Promise.resolve();
    expect(seen.reads).toBe(1);
    engine.destroy();
    await import('shaka-player/dist/shaka-player.compiled.js');
    await tick();
    expect(shakaMock.installAll).not.toHaveBeenCalled();
    expect(shakaMock.attach).not.toHaveBeenCalled();
  });

  it('a destroy while hls.js is still loading never attaches the media', async () => {
    hlsMock.supported = true;
    const seen = watchLegacyTier(true);
    const fv = fakeVideo();
    const { engine } = makeEngine({ fv, direct: false, masterShaka: true, forceNativeHls: false });
    for (let i = 0; i < 200 && seen.reads === 0; i += 1) await Promise.resolve();
    expect(seen.reads).toBe(1);
    engine.destroy();
    await import('hls.js');
    await tick();
    expect(hlsMock.loadSource).not.toHaveBeenCalled();
    expect(hlsMock.attachMedia).not.toHaveBeenCalled();
  });
});

describe('HtmlEngine native-event mapping (master)', () => {
  it('maps element events to the normalised listeners', () => {
    const fv = fakeVideo();
    const { listeners } = makeEngine({ fv, direct: false, durationSec: 500 });
    fv.set('currentTime', 12);
    fv.fire('timeupdate');
    expect(listeners.onTime).toHaveBeenCalledWith(12);

    fv.fire('durationchange');
    expect(listeners.onDuration).toHaveBeenCalledWith(500);

    fv.setBuffered([[0, 40]]);
    fv.fire('progress');
    expect(listeners.onBuffered).toHaveBeenCalledWith(40);

    fv.fire('play');
    fv.fire('pause');
    fv.fire('waiting');
    fv.fire('playing');
    fv.fire('ended');
    fv.fire('error');
    fv.fire('canplay');
    expect(listeners.onPlay).toHaveBeenCalledTimes(1);
    expect(listeners.onPause).toHaveBeenCalledTimes(1);
    expect(listeners.onWaiting).toHaveBeenCalledTimes(1);
    expect(listeners.onPlaying).toHaveBeenCalledTimes(1);
    expect(listeners.onEnded).toHaveBeenCalledTimes(1);
    expect(listeners.onError).toHaveBeenCalledTimes(1);
    expect(listeners.onReady).toHaveBeenCalled();
  });

  it('durationchange falls back to the element duration when no catalogue runtime', () => {
    const fv = fakeVideo({ duration: 321 });
    const { listeners } = makeEngine({ fv, direct: false, durationSec: 0 });
    fv.fire('durationchange');
    expect(listeners.onDuration).toHaveBeenCalledWith(321);
  });

  it('durationchange stays silent while neither the catalogue nor the element knows', () => {
    const fv = fakeVideo();
    const { listeners } = makeEngine({ fv, direct: false, durationSec: 0 });
    fv.fire('durationchange');
    expect(listeners.onDuration).not.toHaveBeenCalled();
  });

  it('progress reports an empty buffer as zero rather than an anchored offset', async () => {
    const fv = fakeVideo();
    const { engine, listeners } = makeEngine({ fv, direct: false, startSec: 30 });
    await vi.waitFor(() => expect(engine.position()).toBe(7.5));
    fv.fire('progress');
    expect(listeners.onBuffered).toHaveBeenCalledWith(0);
  });
});

describe('HtmlEngine transport getters', () => {
  it('position adds the anchor to the element clock', async () => {
    const fv = fakeVideo();
    const { engine } = makeEngine({ fv, direct: false, startSec: 0 });
    await tick();
    fv.set('currentTime', 33);
    expect(engine.position()).toBe(33);
  });

  it('duration prefers the catalogue value, else a finite element duration, else 0', () => {
    const a = fakeVideo({ duration: 50 });
    expect(makeEngine({ fv: a, direct: false, durationSec: 999 }).engine.duration()).toBe(999);
    const b = fakeVideo({ duration: 50 });
    expect(makeEngine({ fv: b, direct: false, durationSec: 0 }).engine.duration()).toBe(50);
    const c = fakeVideo({ duration: Number.POSITIVE_INFINITY });
    expect(makeEngine({ fv: c, direct: false, durationSec: 0 }).engine.duration()).toBe(0);
  });

  it('bufferedEnd adds the anchor to the last buffered range end', () => {
    const fv = fakeVideo();
    const { engine } = makeEngine({ fv, direct: false });
    expect(engine.bufferedEnd()).toBe(0);
    fv.setBuffered([
      [0, 10],
      [20, 55],
    ]);
    expect(engine.bufferedEnd()).toBe(55);
  });

  it('isPaused reflects the element and play/pause drive it', () => {
    const fv = fakeVideo();
    const { engine } = makeEngine({ fv, direct: false });
    expect(engine.isPaused()).toBe(true);
    engine.play();
    expect(engine.isPaused()).toBe(false);
    engine.pause();
    expect(engine.isPaused()).toBe(true);
  });

  it('a rejected play() leaves the element paused without an unhandled rejection', async () => {
    const rejected = Promise.reject(new Error('gesture required'));
    const fv = fakeVideo({ play: () => rejected });
    const { engine } = makeEngine({ fv, direct: false });
    engine.play();
    await expect(rejected).rejects.toThrow('gesture required');
    expect(engine.isPaused()).toBe(true);
  });
});

describe('HtmlEngine seek (master)', () => {
  it('seeks natively inside the buffered range (no re-anchor)', async () => {
    const fv = fakeVideo();
    const { engine, hlsMasterUrl } = makeEngine({ fv, direct: false });
    await tick();
    hlsMasterUrl.mockClear();
    fv.setBuffered([[0, 100]]);
    engine.seekTo(30);
    expect(fv.get('currentTime')).toBe(30);
    expect(hlsMasterUrl).not.toHaveBeenCalled();
  });

  it('re-anchors when the target is outside the buffered range', async () => {
    const fv = fakeVideo();
    const { engine, hlsMasterUrl } = makeEngine({ fv, direct: false });
    await tick();
    hlsMasterUrl.mockClear();
    fv.setBuffered([[0, 10]]);
    engine.seekTo(600);
    expect(hlsMasterUrl).toHaveBeenCalledTimes(1);
    expect(hlsMasterUrl).toHaveBeenLastCalledWith('vid1', false, 600, 0, { copyCodecs: DECODABLE });
  });

  it('resumes playback once the re-anchored master can play', async () => {
    const fv = fakeVideo();
    const { engine } = makeEngine({ fv, direct: false });
    await tick();
    engine.play();
    fv.setBuffered([]);
    engine.seekTo(600);
    fv.set('paused', true);
    fv.fire('canplay');
    expect(engine.isPaused()).toBe(false);
  });

  it('leaves a re-anchor from a paused element paused', async () => {
    const fv = fakeVideo();
    const { engine } = makeEngine({ fv, direct: false });
    await tick();
    fv.setBuffered([]);
    engine.seekTo(600);
    fv.fire('canplay');
    expect(engine.isPaused()).toBe(true);
  });

  it('ignores a superseded re-anchor whose master start resolves last', async () => {
    const fv = fakeVideo();
    const pending: Array<(start: string) => void> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise((resolve) => {
            pending.push((start) => resolve({ headers: { get: () => start } }));
          }),
      ),
    );
    const { engine } = makeEngine({ fv, direct: false });
    await tick();

    fv.setBuffered([]);
    engine.seekTo(600);
    engine.seekTo(900);
    pending[1]?.('900');
    await tick();
    pending[0]?.('600');
    await tick();

    expect(engine.position()).toBe(900);
    expect(fv.get('src')).toBe('master:vid1:false:900:0');
  });

  it('re-anchors on a backward seek before the anchor', async () => {
    const fv = fakeVideo();
    const { engine, hlsMasterUrl } = makeEngine({ fv, direct: false, startSec: 0 });
    await tick();
    // Put the anchor forward so a small target is "before" it.
    fv.setBuffered([[0, 30]]);
    engine.seekTo(600);
    await tick();
    hlsMasterUrl.mockClear();
    engine.seekTo(5);
    expect(hlsMasterUrl).toHaveBeenCalledTimes(1);
    expect(hlsMasterUrl).toHaveBeenLastCalledWith('vid1', false, 5, 0, { copyCodecs: DECODABLE });
  });
});

describe('HtmlEngine audio rendition (master)', () => {
  it('a new rendition re-anchors the master at the current position with the new track', async () => {
    const fv = fakeVideo();
    const { engine, hlsMasterUrl } = makeEngine({ fv, direct: false, rendition: 0 });
    await tick();
    fv.set('currentTime', 42);
    hlsMasterUrl.mockClear();
    engine.setAudioRendition(1);
    expect(hlsMasterUrl).toHaveBeenCalledTimes(1);
    expect(hlsMasterUrl).toHaveBeenLastCalledWith('vid1', false, 42, 1, { copyCodecs: DECODABLE });
  });

  it('ignores selecting the already-active rendition', async () => {
    const fv = fakeVideo();
    const { engine, hlsMasterUrl } = makeEngine({ fv, direct: false, rendition: 1 });
    await tick();
    hlsMasterUrl.mockClear();
    engine.setAudioRendition(1);
    expect(hlsMasterUrl).not.toHaveBeenCalled();
  });
});

describe('HtmlEngine direct mode', () => {
  it('attaches the original file and seeks to the resume offset once metadata loads', () => {
    const fv = fakeVideo();
    const { streamUrl, listeners } = makeEngine({ fv, direct: true, startSec: 20 });
    expect(streamUrl).toHaveBeenCalledWith('vid1');
    expect(fv.get('src')).toBe('stream:vid1');
    expect(fv.get('currentTime')).toBe(0);
    fv.fire('loadedmetadata');
    expect(fv.get('currentTime')).toBe(20);
    expect(listeners.onReady).toHaveBeenCalled();
  });

  it('seekTo sets the absolute element time and audio switching is a no-op', () => {
    const fv = fakeVideo();
    const { engine, hlsMasterUrl } = makeEngine({ fv, direct: true, startSec: 0 });
    engine.seekTo(75);
    expect(fv.get('currentTime')).toBe(75);
    engine.setAudioRendition(3);
    expect(hlsMasterUrl).not.toHaveBeenCalled();
  });
});

describe('HtmlEngine destroy', () => {
  it('detaches every listener and clears the source', () => {
    const fv = fakeVideo();
    const { engine, listeners } = makeEngine({ fv, direct: false });
    expect(fv.listenerCount('timeupdate')).toBe(1);
    engine.destroy();
    expect(fv.listenerCount('timeupdate')).toBe(0);
    expect(fv.get('src')).toBe('');
    fv.fire('timeupdate');
    expect(listeners.onTime).not.toHaveBeenCalled();
  });

  it('reports the display aspect on metadata and on a variant switch', () => {
    const listeners = mkListeners();
    const fv = fakeVideo({ videoWidth: 1920, videoHeight: 816 });
    const { engine } = makeEngine({ fv, direct: true, listeners });
    fv.fire('loadedmetadata');
    expect(listeners.onAspect).toHaveBeenCalledWith(1920 / 816);
    fv.set('videoWidth', 1440);
    fv.set('videoHeight', 1080);
    fv.fire('resize');
    expect(listeners.onAspect).toHaveBeenLastCalledWith(4 / 3);
    engine.destroy();
  });

  it('stays quiet about the aspect while the stream has no dimensions yet', () => {
    const listeners = mkListeners();
    const fv = fakeVideo({ videoWidth: 0, videoHeight: 0 });
    const { engine } = makeEngine({ fv, direct: true, listeners });
    fv.fire('loadedmetadata');
    expect(listeners.onAspect).not.toHaveBeenCalled();
    engine.destroy();
  });

  it('disarms the re-anchor resume so the next item does not start itself', async () => {
    const fv = fakeVideo();
    const { engine } = makeEngine({ fv, direct: false });
    await tick();
    engine.play();
    fv.setBuffered([]);
    engine.seekTo(600);

    engine.destroy();
    fv.set('paused', true);
    fv.fire('canplay');

    expect(fv.listenerCount('canplay')).toBe(0);
    expect(engine.isPaused()).toBe(true);
  });

  it('drops the pending direct-play resume seek so the next item is not moved', () => {
    // Counted against an engine with nothing to resume, so the assertion stays
    // about the seek rather than about how many listeners the engine binds.
    const bare = fakeVideo();
    const bareEngine = makeEngine({ fv: bare, direct: true, startSec: 0 }).engine;
    const withSeek = bare.listenerCount('loadedmetadata') + 1;
    bareEngine.destroy();
    const fv = fakeVideo();
    const { engine } = makeEngine({ fv, direct: true, startSec: 20 });
    expect(fv.listenerCount('loadedmetadata')).toBe(withSeek);
    engine.destroy();
    expect(fv.listenerCount('loadedmetadata')).toBe(0);
    fv.fire('loadedmetadata');
    expect(fv.get('currentTime')).toBe(0);
  });
});
