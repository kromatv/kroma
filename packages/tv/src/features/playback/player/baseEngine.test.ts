import type { KromaClient, MediaItem } from '@kroma/core';
import type { AudioFilterMode } from '@kroma/ui';
import { describe, expect, it, vi } from 'vitest';
import { BaseTvEngine, type EngineOptions } from './baseEngine';
import type { EngineListeners } from './engine';

// BaseTvEngine is the platform-free transport shared by the three native
// backends (AVPlay / mpv / ExoPlayer). This suite drives that shared logic
// through a tiny concrete subclass that only records its `reanchor` hand-offs.

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
    onAudioFilterUnavailable: vi.fn(),
  };
}

// A fake client whose URL builders echo their arguments so a test can assert the
// EXACT direct / master URL the engine composed for the current mode.
const client = {
  streamUrl: (id: string) => `stream:${id}`,
  hlsMasterUrl: (id: string, aac: boolean, startSec: number, audio: number) =>
    `master:${id}:${aac}:${startSec}:${audio}`,
} as unknown as KromaClient;

const item = { id: 'm1' } as unknown as MediaItem;

class TestEngine extends BaseTvEngine {
  readonly kind = 'mpv' as const;
  readonly reanchorCalls: number[] = [];

  // biome-ignore lint/complexity/noUselessConstructor: exposes the protected base constructor for the test
  constructor(o: EngineOptions) {
    super(o);
  }

  protected reanchor(absSec: number): void {
    this.reanchorCalls.push(absSec);
  }
  play(): void {}
  pause(): void {}
  bufferedEnd(): number {
    return 0;
  }
  seekTo(): void {}
  setAudioRendition(): void {}
  destroy(): void {
    this.destroyed = true;
  }

  url(): string {
    return this.sourceUrl();
  }
  triggerFail(audioUnsupported = false): void {
    this.fail(audioUnsupported);
  }
  wantFilterOnMaster(): void {
    this.filterMaster = true;
  }
  get aacForced(): boolean {
    return this.forceAac;
  }
  get filterNow(): AudioFilterMode {
    return this.filter;
  }
  get modeNow(): 'direct' | 'master' {
    return this.mode;
  }
  get base(): number {
    return this.baseSec;
  }
  get el(): number {
    return this.elSec;
  }
  get fell(): boolean {
    return this.fellBack;
  }
  markDestroyed(): void {
    this.destroyed = true;
  }
  setPausedFlag(v: boolean): void {
    this.paused = v;
  }
}

function make(over: Partial<EngineOptions> = {}): TestEngine {
  const opts: EngineOptions = {
    client,
    item,
    durationSec: 120,
    initialRendition: 0,
    startSec: 0,
    direct: true,
    listeners: mkListeners(),
    ...over,
  };
  return new TestEngine(opts);
}

describe('BaseTvEngine mode init', () => {
  it('direct mode puts the start offset on the ABSOLUTE element clock', () => {
    const e = make({ direct: true, startSec: 42 });
    expect(e.modeNow).toBe('direct');
    expect(e.el).toBe(42);
    expect(e.base).toBe(0);
    expect(e.position()).toBe(42);
  });

  it('master mode puts the start offset on the ANCHOR (element restarts at 0)', () => {
    const e = make({ direct: false, startSec: 42 });
    expect(e.modeNow).toBe('master');
    expect(e.base).toBe(42);
    expect(e.el).toBe(0);
    expect(e.position()).toBe(42);
  });
});

describe('BaseTvEngine sourceUrl', () => {
  it('direct mode returns the original-file stream URL', () => {
    expect(make({ direct: true }).url()).toBe('stream:m1');
  });

  it('master mode returns the anchored HLS master with the chosen audio rendition', () => {
    const e = make({ direct: false, startSec: 30, initialRendition: 2 });
    expect(e.url()).toBe('master:m1:false:30:2');
  });
});

describe('BaseTvEngine position / duration / paused', () => {
  it('duration reports the catalogue runtime', () => {
    expect(make({ durationSec: 987 }).duration()).toBe(987);
  });

  it('isPaused reflects the paused flag', () => {
    const e = make();
    expect(e.isPaused()).toBe(false);
    e.setPausedFlag(true);
    expect(e.isPaused()).toBe(true);
  });
});

describe('BaseTvEngine fail / direct->master fallback', () => {
  it('a direct failure falls back ONCE to the master at the same position', () => {
    const listeners = mkListeners();
    const e = make({ direct: true, startSec: 55, listeners });
    e.triggerFail();
    expect(e.fell).toBe(true);
    expect(e.modeNow).toBe('master');
    expect(listeners.onWaiting).toHaveBeenCalledTimes(1);
    expect(listeners.onError).not.toHaveBeenCalled();
    // Re-anchored the master at the direct position (baseSec 0 + elSec 55).
    expect(e.reanchorCalls).toEqual([55]);
  });

  it('a second failure (now in master mode) surfaces the error', () => {
    const listeners = mkListeners();
    const e = make({ direct: true, startSec: 10, listeners });
    e.triggerFail(); // direct -> master
    e.triggerFail(); // master failure
    expect(listeners.onError).toHaveBeenCalledTimes(1);
    expect(e.reanchorCalls).toEqual([10]); // no second re-anchor
  });

  it('a failure that starts in master mode surfaces the error immediately', () => {
    const listeners = mkListeners();
    const e = make({ direct: false, startSec: 0, listeners });
    e.triggerFail();
    expect(listeners.onError).toHaveBeenCalledTimes(1);
    expect(listeners.onWaiting).not.toHaveBeenCalled();
    expect(e.reanchorCalls).toEqual([]);
  });

  it('audio the device cannot decode moves to a master that transcodes it', () => {
    const listeners = mkListeners();
    const e = make({ direct: true, startSec: 20, listeners });
    e.triggerFail(true);
    expect(e.modeNow).toBe('master');
    expect(e.aacForced).toBe(true);
    expect(e.url()).toBe('master:m1:true:0:0');
    expect(e.reanchorCalls).toEqual([20]);
    expect(listeners.onError).not.toHaveBeenCalled();
  });

  it('asks for the AAC master once, then gives up', () => {
    const listeners = mkListeners();
    const e = make({ direct: true, startSec: 20, listeners });
    e.triggerFail(true);
    e.triggerFail(true);
    expect(listeners.onError).toHaveBeenCalledTimes(1);
    expect(e.reanchorCalls).toEqual([20]);
  });

  it('a master the server cannot produce costs the filter, not the title', () => {
    const listeners = mkListeners();
    const e = make({ direct: false, startSec: 30, listeners });
    e.wantFilterOnMaster();
    e.triggerFail();
    expect(e.modeNow).toBe('direct');
    expect(e.filterNow).toBe('off');
    expect(listeners.onAudioFilterUnavailable).toHaveBeenCalledTimes(1);
    expect(listeners.onWaiting).toHaveBeenCalledTimes(1);
    expect(listeners.onError).not.toHaveBeenCalled();
    expect(e.reanchorCalls).toEqual([30]);
  });

  it('is inert once destroyed', () => {
    const listeners = mkListeners();
    const e = make({ direct: true, listeners });
    e.markDestroyed();
    e.triggerFail();
    expect(listeners.onError).not.toHaveBeenCalled();
    expect(listeners.onWaiting).not.toHaveBeenCalled();
    expect(e.reanchorCalls).toEqual([]);
  });
});
