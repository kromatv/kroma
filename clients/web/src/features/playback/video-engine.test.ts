// @vitest-environment jsdom
import type { EngineDecision } from '@kroma/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeVideo } from '#web/features/playback/fake-video.fixture';
import type { MovieView } from '#web/shared/lib/api';
import { type AttachSourceOptions, attachMediaSource } from './video-engine';

const H = vi.hoisted(() => {
  const hlsMasterUrl = vi.fn(
    (id: string, aac: boolean, startSec: number, audio: number) =>
      `hls:${id}:${aac}:${startSec}:${audio}`,
  );
  const instances: Array<{
    loadSource: ReturnType<typeof vi.fn>;
    attachMedia: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
  }> = [];
  class FakeHls {
    static supported = true;
    static isSupported() {
      return FakeHls.supported;
    }
    loadSource = vi.fn();
    attachMedia = vi.fn();
    destroy = vi.fn();
    constructor(_cfg: unknown) {
      instances.push(this);
    }
  }
  const shakaInstances: Array<{
    attach: ReturnType<typeof vi.fn>;
    load: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
    configure: ReturnType<typeof vi.fn>;
  }> = [];
  class FakeShakaPlayer {
    static supported = true;
    static loadFails = false;
    static isBrowserSupported() {
      return FakeShakaPlayer.supported;
    }
    attach = vi.fn(() => Promise.resolve());
    load = vi.fn(() =>
      FakeShakaPlayer.loadFails ? Promise.reject(new Error('manifest 404')) : Promise.resolve(),
    );
    destroy = vi.fn(() => Promise.resolve());
    configure = vi.fn(() => true);
    constructor() {
      shakaInstances.push(this);
    }
  }
  const installAll = vi.fn();
  const FakeShaka = { Player: FakeShakaPlayer, polyfill: { installAll } };
  return { hlsMasterUrl, instances, FakeHls, shakaInstances, FakeShaka, installAll };
});

vi.mock('#web/shared/lib/api', () => ({
  kromaClient: () => ({ hlsMasterUrl: H.hlsMasterUrl }),
}));
vi.mock('hls.js', () => ({ default: H.FakeHls }));
vi.mock('shaka-player/dist/shaka-player.compiled.js', () => ({ default: H.FakeShaka }));

const item = { id: 'w1', stream: 'stream://w1', durationMs: 7_200_000 } as unknown as MovieView;
const tick = () => new Promise<void>((r) => setTimeout(r, 0));

afterEach(() => {
  H.hlsMasterUrl.mockClear();
  H.instances.length = 0;
  H.FakeHls.supported = true;
  H.shakaInstances.length = 0;
  H.FakeShaka.Player.supported = true;
  H.FakeShaka.Player.loadFails = false;
  H.installAll.mockClear();
});

describe('attachMediaSource direct-play', () => {
  function base(over: Partial<AttachSourceOptions> = {}): AttachSourceOptions {
    return {
      v: fakeVideo().el,
      item,
      decision: { kind: 'direct', aacMaster: false } as EngineDecision,
      useNativeHls: false,
      useShaka: false,
      startSec: 0,
      audioRel: 0,
      hlsRef: { current: null },
      shakaRef: { current: null },
      setUseHls: vi.fn(),
      setReady: vi.fn(),
      ...over,
    };
  }

  it('points a bare <video> at the original stream and marks direct', () => {
    const fv = fakeVideo();
    const opts = base({ v: fv.el });
    const cleanup = attachMediaSource(opts);
    expect(opts.setUseHls).toHaveBeenCalledWith(false);
    expect(fv.get('src')).toBe('stream://w1');
    expect(fv.get('preload')).toBe('auto');
    cleanup();
    expect(fv.get('src')).toBe('');
  });

  it('resume-seeks to the absolute start once metadata is available', () => {
    const fv = fakeVideo({ readyState: 0 });
    attachMediaSource(base({ v: fv.el, startSec: 300 }));
    expect(fv.get('currentTime')).toBe(0);
    fv.fire('loadedmetadata');
    expect(fv.get('currentTime')).toBe(300);
  });

  it('seeks immediately when the element already has metadata', () => {
    const fv = fakeVideo({ readyState: 1, currentTime: 0 });
    attachMediaSource(base({ v: fv.el, startSec: 300 }));
    expect(fv.get('currentTime')).toBe(300);
  });

  it('leaves a clock already within a second of the anchor alone', () => {
    const fv = fakeVideo({ readyState: 1, currentTime: 300 });
    attachMediaSource(base({ v: fv.el, startSec: 300.5 }));
    expect(fv.get('currentTime')).toBe(300);
  });
});

describe('attachMediaSource HLS master', () => {
  function hlsOpts(over: Partial<AttachSourceOptions> = {}): AttachSourceOptions {
    return {
      v: fakeVideo().el,
      item,
      decision: { kind: 'web-mse', aacMaster: true } as EngineDecision,
      useNativeHls: false,
      useShaka: false,
      startSec: 600,
      audioRel: 2,
      hlsRef: { current: null },
      shakaRef: { current: null },
      setUseHls: vi.fn(),
      setReady: vi.fn(),
      ...over,
    };
  }

  it('native HLS points the element at the muxed master URL', () => {
    const fv = fakeVideo();
    const opts = hlsOpts({ v: fv.el, useNativeHls: true });
    attachMediaSource(opts);
    expect(opts.setUseHls).toHaveBeenCalledWith(true);
    expect(H.hlsMasterUrl).toHaveBeenCalledWith('w1', true, 600, 2);
    expect(fv.get('src')).toBe('hls:w1:true:600:2');
  });

  it('hls.js attaches the master and stores the instance, then destroys on cleanup', async () => {
    const fv = fakeVideo();
    const opts = hlsOpts({ v: fv.el });
    const cleanup = attachMediaSource(opts);
    await tick();
    expect(H.instances).toHaveLength(1);
    const inst = H.instances[0];
    expect(inst?.loadSource).toHaveBeenCalledWith('hls:w1:true:600:2');
    expect(inst?.attachMedia).toHaveBeenCalledWith(fv.el);
    expect(opts.hlsRef.current).toBe(inst);
    cleanup();
    expect(inst?.destroy).toHaveBeenCalled();
    expect(opts.hlsRef.current).toBeNull();
  });

  it('falls back to a native src when hls.js is unsupported', async () => {
    H.FakeHls.supported = false;
    const fv = fakeVideo();
    attachMediaSource(hlsOpts({ v: fv.el }));
    await tick();
    expect(H.instances).toHaveLength(0);
    expect(fv.get('src')).toBe('hls:w1:true:600:2');
  });

  it('never builds an engine for an element already detached', async () => {
    const fv = fakeVideo();
    const cleanup = attachMediaSource(hlsOpts({ v: fv.el }));
    cleanup();
    await tick();
    expect(H.instances).toHaveLength(0);
    expect(fv.get('src')).toBe('');
  });

  it('native HLS releases the element on cleanup', () => {
    const fv = fakeVideo();
    const cleanup = attachMediaSource(hlsOpts({ v: fv.el, useNativeHls: true }));
    expect(fv.get('src')).toBe('hls:w1:true:600:2');
    cleanup();
    expect(fv.get('src')).toBe('');
  });
});

describe('attachMediaSource HLS master via Shaka', () => {
  function shakaOpts(over: Partial<AttachSourceOptions> = {}): AttachSourceOptions {
    return {
      v: fakeVideo().el,
      item,
      decision: { kind: 'web-mse', aacMaster: true } as EngineDecision,
      useNativeHls: false,
      useShaka: true,
      startSec: 600,
      audioRel: 2,
      hlsRef: { current: null },
      shakaRef: { current: null },
      setUseHls: vi.fn(),
      setReady: vi.fn(),
      ...over,
    };
  }

  it('installs polyfills, attaches and loads the muxed master, then destroys on cleanup', async () => {
    const fv = fakeVideo();
    const opts = shakaOpts({ v: fv.el });
    const cleanup = attachMediaSource(opts);
    expect(opts.setUseHls).toHaveBeenCalledWith(true);
    await tick();
    expect(H.installAll).toHaveBeenCalled();
    expect(H.shakaInstances).toHaveLength(1);
    const inst = H.shakaInstances[0];
    expect(inst?.attach).toHaveBeenCalledWith(fv.el);
    expect(inst?.load).toHaveBeenCalledWith('hls:w1:true:600:2');
    // Shaka's default bufferingGoal is only 10s.
    const cfg = inst?.configure.mock.calls[0]?.[0] as {
      streaming?: { bufferingGoal?: number };
    };
    expect(cfg?.streaming?.bufferingGoal).toBeGreaterThanOrEqual(60);
    cleanup();
    expect(inst?.destroy).toHaveBeenCalled();
  });

  it('uses Shaka even when useNativeHls is set', async () => {
    const fv = fakeVideo();
    attachMediaSource(shakaOpts({ v: fv.el, useNativeHls: true }));
    await tick();
    expect(H.shakaInstances).toHaveLength(1);
    expect(fv.get('src')).toBe('');
  });

  it('falls back to a native src when Shaka is unsupported', async () => {
    H.FakeShaka.Player.supported = false;
    const fv = fakeVideo();
    attachMediaSource(shakaOpts({ v: fv.el }));
    await tick();
    expect(H.shakaInstances).toHaveLength(0);
    expect(fv.get('src')).toBe('hls:w1:true:600:2');
  });

  it('never builds a player for an element already detached', async () => {
    const fv = fakeVideo();
    const cleanup = attachMediaSource(shakaOpts({ v: fv.el }));
    cleanup();
    await tick();
    expect(H.shakaInstances).toHaveLength(0);
    expect(H.installAll).not.toHaveBeenCalled();
  });

  it('survives a manifest Shaka cannot load', async () => {
    H.FakeShaka.Player.loadFails = true;
    const fv = fakeVideo();
    attachMediaSource(shakaOpts({ v: fv.el }));
    await tick();
    await tick();
    expect(H.shakaInstances[0]?.load).toHaveBeenCalled();
  });
});
