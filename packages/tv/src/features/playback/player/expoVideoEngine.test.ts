import type { KromaClient, MediaItem } from '@kroma/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EngineOptions } from './baseEngine';
import { NATIVE_SEEK_AHEAD } from './baseEngine';
import { nativeBufferBudget } from './bufferBudget';
import type { EngineListeners } from './engine';
import { ExpoVideoEngine } from './expoVideoEngine';

// The native expo-video backend (AVPlayer on Apple TV, Media3 on Android TV),
// driven against a fake `createVideoPlayer` recording the players it hands out.

const { players, FakePlayer } = vi.hoisted(() => {
  interface Sub {
    event: string;
    handler: (payload: unknown) => void;
    removed: boolean;
  }

  class FakePlayer {
    uri: string;
    currentTime = 0;
    timeUpdateEventInterval = 0;
    availableAudioTracks: { id: string }[] = [];
    audioTrack: unknown = null;
    bufferOptions: unknown = null;
    plays = 0;
    pauses = 0;
    released = false;
    replaced: string[] = [];
    replaceThrows = false;
    throwOnRead = false;
    subs: Sub[] = [];
    private durationValue = 0;
    private bufferedValue = 0;

    constructor(uri: string) {
      this.uri = uri;
    }

    get duration(): number {
      if (this.throwOnRead) throw new Error('native shared object released');
      return this.durationValue;
    }
    set duration(value: number) {
      this.durationValue = value;
    }
    get bufferedPosition(): number {
      if (this.throwOnRead) throw new Error('native shared object released');
      return this.bufferedValue;
    }
    set bufferedPosition(value: number) {
      this.bufferedValue = value;
    }

    play(): void {
      this.plays += 1;
    }
    pause(): void {
      this.pauses += 1;
    }
    release(): void {
      this.released = true;
    }
    replace(source: { uri: string }): void {
      if (this.replaceThrows) throw new Error('will not take a new source');
      this.uri = source.uri;
      this.replaced.push(source.uri);
    }
    addListener(event: string, handler: (payload: unknown) => void): { remove(): void } {
      const sub: Sub = { event, handler, removed: false };
      this.subs.push(sub);
      return {
        remove: () => {
          sub.removed = true;
        },
      };
    }
    emit(event: string, payload: unknown = {}): void {
      for (const sub of this.subs) if (sub.event === event && !sub.removed) sub.handler(payload);
    }
    emitStale(event: string, payload: unknown = {}): void {
      for (const sub of this.subs) if (sub.event === event) sub.handler(payload);
    }
  }

  return { players: [] as FakePlayer[], FakePlayer };
});

vi.mock('expo-video', () => ({
  createVideoPlayer: (source: { uri: string }) => {
    const player = new FakePlayer(source.uri);
    players.push(player);
    return player;
  },
}));

vi.mock('react-native', () => ({ Platform: { OS: 'android' } }));

type Fake = InstanceType<typeof FakePlayer>;

const client = {
  streamUrl: (id: string) => `stream:${id}`,
  hlsMasterUrl: (id: string, aac: boolean, startSec: number, audio: number) =>
    `master:${id}:${aac}:${startSec}:${audio}`,
} as unknown as KromaClient;
const item = { id: 'ev1' } as unknown as MediaItem;
const budget = nativeBufferBudget();

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
    onSurfaceChange: vi.fn(),
  };
}

function opts(over: Partial<EngineOptions> = {}): EngineOptions {
  return {
    client,
    item,
    durationSec: 100,
    initialRendition: 0,
    startSec: 0,
    direct: true,
    listeners: mkListeners(),
    ...over,
  };
}

function make(over: Partial<EngineOptions> = {}) {
  const listeners = over.listeners ?? mkListeners();
  const e = new ExpoVideoEngine(opts({ ...over, listeners }));
  return { e, listeners };
}

function current(e: ExpoVideoEngine): Fake {
  return e.videoPlayer as unknown as Fake;
}

beforeEach(() => {
  players.length = 0;
});
afterEach(() => {
  vi.useRealTimers();
});

describe('ExpoVideoEngine construction', () => {
  it('direct mode opens the original file and plays it', () => {
    const { e } = make({ direct: true });
    expect(players).toHaveLength(1);
    expect(current(e).uri).toBe('stream:ev1');
    expect(current(e).plays).toBe(1);
    expect(e.isPaused()).toBe(false);
  });

  it('master mode opens the anchored remux at the resume point', () => {
    const { e } = make({ direct: false, startSec: 300, initialRendition: 2 });
    expect(current(e).uri).toBe('master:ev1:false:300:2');
    // The anchor is the resume: the master's own clock restarts at 0.
    expect(e.position()).toBe(300);
  });

  it('tells the surface about the player BEFORE starting it', () => {
    // <VideoView> still renders whatever this player replaced, so announcing
    // late costs a frame of picture.
    const listeners = mkListeners();
    let playsAtAnnounce = -1;
    listeners.onSurfaceChange = vi.fn(() => {
      playsAtAnnounce = players.at(-1)?.plays ?? -1;
    });
    make({ listeners });
    expect(playsAtAnnounce).toBe(0);
    expect(listeners.onSurfaceChange).toHaveBeenCalledTimes(1);
  });

  it('sets a coarse time-update interval rather than reporting per frame', () => {
    const { e } = make();
    expect(current(e).timeUpdateEventInterval).toBeGreaterThan(0);
  });

  it('bounds what Media3 may buffer, on every player it opens', () => {
    const { e } = make({ direct: false, startSec: 0 });
    expect(current(e).bufferOptions).toEqual(budget);

    e.seekTo(NATIVE_SEEK_AHEAD + 120);

    expect(players).toHaveLength(1);
    expect(current(e).replaced).toHaveLength(1);
    expect(current(e).bufferOptions).toEqual(budget);
  });
});

describe('ExpoVideoEngine resume seek', () => {
  it('direct: holds the resume seek until the player reports ready', () => {
    const { e, listeners } = make({ direct: true, startSec: 42 });
    // Seeking a player that has no duration yet is dropped by AVFoundation.
    expect(current(e).currentTime).toBe(0);
    current(e).emit('statusChange', { status: 'readyToPlay' });
    expect(current(e).currentTime).toBe(42);
    expect(e.position()).toBe(42);
    expect(listeners.onReady).toHaveBeenCalledTimes(1);
  });

  it('master: nothing to seek, the server anchored it', () => {
    const { e } = make({ direct: false, startSec: 300 });
    current(e).emit('statusChange', { status: 'readyToPlay' });
    expect(current(e).currentTime).toBe(0);
    expect(e.position()).toBe(300);
  });

  it('applies the resume seek only once', () => {
    const { e } = make({ direct: true, startSec: 42 });
    current(e).emit('statusChange', { status: 'readyToPlay' });
    current(e).currentTime = 55;
    current(e).emit('statusChange', { status: 'readyToPlay' });
    expect(current(e).currentTime).toBe(55);
  });
});

describe('ExpoVideoEngine event mapping', () => {
  it('time updates the absolute position and the buffer', () => {
    const { e, listeners } = make({ direct: true });
    current(e).bufferedPosition = 30;
    current(e).emit('timeUpdate', { currentTime: 15 });
    expect(e.position()).toBe(15);
    expect(listeners.onTime).toHaveBeenCalledWith(15);
    expect(listeners.onBuffered).toHaveBeenCalledWith(30);
  });

  it('takes the buffer off the event, so a player that throws still reports one', () => {
    const { e, listeners } = make({ direct: true });
    // Reading the property back off a player mid-swap throws, and the engine
    // answers a throw with 0 - which the seek bar draws as nothing buffered.
    Object.defineProperty(current(e), 'bufferedPosition', {
      get() {
        throw new Error('released');
      },
    });
    current(e).emit('timeUpdate', { currentTime: 15, bufferedPosition: 42 });
    expect(listeners.onBuffered).toHaveBeenCalledWith(42);
  });

  it('master reports position and buffer relative to the anchor', () => {
    const { e, listeners } = make({ direct: false, startSec: 300 });
    current(e).bufferedPosition = 20;
    current(e).emit('timeUpdate', { currentTime: 10 });
    expect(e.position()).toBe(310);
    expect(listeners.onTime).toHaveBeenCalledWith(310);
    expect(listeners.onBuffered).toHaveBeenCalledWith(320);
  });

  it('direct duration overrides the runtime; master keeps the catalogue value', () => {
    const direct = make({ direct: true });
    current(direct.e).duration = 5400;
    current(direct.e).emit('timeUpdate', { currentTime: 1 });
    expect(direct.e.duration()).toBe(5400);
    expect(direct.listeners.onDuration).toHaveBeenCalledWith(5400);

    // The master's duration is the remaining anchored span, not the runtime.
    const master = make({ direct: false, startSec: 300 });
    current(master.e).duration = 12;
    current(master.e).emit('timeUpdate', { currentTime: 1 });
    expect(master.e.duration()).toBe(100);
    expect(master.listeners.onDuration).not.toHaveBeenCalled();
  });

  it('maps transport, loading and end-of-file to the listeners', () => {
    const { e, listeners } = make();
    current(e).emit('playingChange', { isPlaying: false });
    expect(listeners.onPause).toHaveBeenCalledTimes(1);
    expect(e.isPaused()).toBe(true);

    current(e).emit('playingChange', { isPlaying: true });
    expect(listeners.onPlay).toHaveBeenCalledTimes(1);
    expect(e.isPaused()).toBe(false);

    current(e).emit('statusChange', { status: 'loading' });
    expect(listeners.onWaiting).toHaveBeenCalledTimes(1);

    current(e).emit('playToEnd');
    expect(listeners.onEnded).toHaveBeenCalledTimes(1);
  });

  it('ignores a status the player reports that the chrome has no state for', () => {
    const { e, listeners } = make();
    current(e).emit('statusChange', { status: 'idle' });
    expect(listeners.onWaiting).not.toHaveBeenCalled();
    expect(listeners.onReady).not.toHaveBeenCalled();
    expect(listeners.onError).not.toHaveBeenCalled();
  });
});

describe('ExpoVideoEngine transport', () => {
  it('play and pause drive the open player and the reported state', () => {
    const { e } = make({ direct: true });
    const player = current(e);
    const played = player.plays;
    e.pause();
    expect(player.pauses).toBe(1);
    expect(e.isPaused()).toBe(true);
    e.play();
    expect(player.plays).toBe(played + 1);
    expect(e.isPaused()).toBe(false);
  });

  it('play and pause are inert once the engine is destroyed', () => {
    const { e } = make({ direct: true });
    const player = current(e);
    const played = player.plays;
    const pausedCount = player.pauses;
    e.destroy();
    e.play();
    e.pause();
    expect(player.plays).toBe(played);
    expect(player.pauses).toBe(pausedCount + 1);
  });
});

describe('ExpoVideoEngine direct -> master fallback', () => {
  it('a file the platform cannot demux comes back remuxed, at the same position', () => {
    // AVFoundation has no Matroska demuxer.
    const { e, listeners } = make({ direct: true });
    current(e).emit('timeUpdate', { currentTime: 90 });
    current(e).emit('statusChange', { status: 'error' });

    expect(listeners.onWaiting).toHaveBeenCalled();
    expect(listeners.onError).not.toHaveBeenCalled();
    expect(current(e).uri).toBe('master:ev1:false:90:0');
    expect(e.position()).toBe(90);
  });

  it('falls back once; a second failure is a real error', () => {
    const { e, listeners } = make({ direct: true });
    current(e).emit('statusChange', { status: 'error' });
    expect(listeners.onError).not.toHaveBeenCalled();
    current(e).emit('statusChange', { status: 'error' });
    expect(listeners.onError).toHaveBeenCalledTimes(1);
  });

  it('resumes a film that was playing, and stays paused if it was not', () => {
    const playing = make({ direct: true });
    const before = current(playing.e).plays;
    current(playing.e).emit('statusChange', { status: 'error' });
    expect(current(playing.e).plays).toBe(before + 1);

    const paused = make({ direct: true });
    paused.e.pause();
    const pausedBefore = current(paused.e).plays;
    current(paused.e).emit('statusChange', { status: 'error' });
    expect(current(paused.e).plays).toBe(pausedBefore);
  });
});

describe('ExpoVideoEngine seeking', () => {
  it('direct: seeks the open file and reports the new position immediately', () => {
    const { e, listeners } = make({ direct: true });
    const player = current(e);
    e.seekTo(70);
    expect(player.currentTime).toBe(70);
    expect(player.replaced).toEqual([]);
    expect(listeners.onTime).toHaveBeenCalledWith(70);
  });

  it('master: a seek inside the anchored playlist is native, not a re-anchor', () => {
    const { e, listeners } = make({ direct: false, startSec: 300 });
    const player = current(e);
    e.seekTo(350);
    expect(player.replaced).toEqual([]);
    expect(player.currentTime).toBe(50);
    expect(e.position()).toBe(350);
    expect(listeners.onTime).toHaveBeenCalledWith(350);
  });

  it('master: the native-seek window ends exactly at NATIVE_SEEK_AHEAD', () => {
    const edge = make({ direct: false, startSec: 300 });
    edge.e.seekTo(300 + NATIVE_SEEK_AHEAD);
    expect(current(edge.e).replaced).toEqual([]);

    // One second past it outruns the continuous remux and stalls.
    const past = make({ direct: false, startSec: 300 });
    past.e.seekTo(300 + NATIVE_SEEK_AHEAD + 1);
    expect(current(past.e).replaced).toEqual(['master:ev1:false:361:0']);
    expect(past.e.position()).toBe(361);
  });

  it('master: seeking before the anchor needs a new one', () => {
    const { e } = make({ direct: false, startSec: 300 });
    e.seekTo(120);
    expect(current(e).replaced).toEqual(['master:ev1:false:120:0']);
    expect(e.position()).toBe(120);
  });

  it('re-anchors by re-pointing the SAME player, keeping the picture up', () => {
    const { e, listeners } = make({ direct: false, startSec: 300 });
    const player = current(e);
    e.seekTo(120);
    // A swap would mean a new <VideoView> and a black frame for the handover.
    expect(players).toHaveLength(1);
    expect(current(e)).toBe(player);
    expect(listeners.onSurfaceChange).toHaveBeenCalledTimes(1);
  });

  it('a player that will not take a new source is replaced outright', () => {
    const { e, listeners } = make({ direct: false, startSec: 300 });
    const first = current(e);
    first.replaceThrows = true;
    e.seekTo(120);
    expect(players).toHaveLength(2);
    expect(current(e)).not.toBe(first);
    expect(current(e).uri).toBe('master:ev1:false:120:0');
    expect(listeners.onSurfaceChange).toHaveBeenCalledTimes(2);
  });

  it('a re-anchor while paused does not start the film', () => {
    const { e } = make({ direct: false, startSec: 300 });
    const player = current(e);
    e.pause();
    const before = player.plays;
    e.seekTo(120);
    expect(player.plays).toBe(before);
    expect(e.isPaused()).toBe(true);
  });

  it('a replacement player opened while paused stays paused', () => {
    const { e } = make({ direct: false, startSec: 300 });
    const first = current(e);
    first.replaceThrows = true;
    e.pause();
    e.seekTo(120);
    expect(current(e)).not.toBe(first);
    expect(current(e).plays).toBe(0);
    expect(e.isPaused()).toBe(true);
  });

  it('seekTo is inert once the engine is destroyed', () => {
    const { e } = make({ direct: false, startSec: 300 });
    const player = current(e);
    e.destroy();
    e.seekTo(120);
    expect(players).toHaveLength(1);
    expect(player.replaced).toEqual([]);
    expect(e.position()).toBe(300);
  });
});

describe('ExpoVideoEngine audio', () => {
  it('direct: switches track in place, with no server round trip', () => {
    const { e } = make({ direct: true });
    const player = current(e);
    player.availableAudioTracks = [{ id: 'en' }, { id: 'fr' }];
    e.setAudioRendition(1);
    expect(player.audioTrack).toEqual({ id: 'fr' });
    expect(player.replaced).toEqual([]);
  });

  it('direct: a track the player does not expose re-opens the source', () => {
    // Re-anchoring the direct file brings back the same track list, so this is a
    // no-op reload rather than the master fallback the master branch gets.
    const { e } = make({ direct: true });
    const player = current(e);
    player.availableAudioTracks = [{ id: 'en' }];
    e.setAudioRendition(1);
    expect(player.replaced).toEqual(['stream:ev1']);
  });

  it('direct: re-opening for a missing track holds the resume seek until ready', () => {
    const { e } = make({ direct: true, startSec: 42 });
    const player = current(e);
    player.emit('statusChange', { status: 'readyToPlay' });
    player.availableAudioTracks = [{ id: 'en' }];
    player.currentTime = 0;
    e.setAudioRendition(1);
    expect(player.replaced).toEqual(['stream:ev1']);
    expect(player.currentTime).toBe(0);
    player.emit('statusChange', { status: 'readyToPlay' });
    expect(player.currentTime).toBe(42);
  });

  it('setAudioRendition is inert once the engine is destroyed', () => {
    const { e } = make({ direct: false, startSec: 300 });
    const player = current(e);
    e.destroy();
    e.setAudioRendition(1);
    expect(players).toHaveLength(1);
    expect(player.replaced).toEqual([]);
  });

  it('master: a new track means a new master at the current position', () => {
    const { e } = make({ direct: false, startSec: 300 });
    const player = current(e);
    e.setAudioRendition(1);
    expect(player.replaced).toEqual(['master:ev1:false:300:1']);
  });

  it('ignores a repeat of the rendition already playing', () => {
    const { e } = make({ direct: false, startSec: 300, initialRendition: 1 });
    e.setAudioRendition(1);
    expect(current(e).replaced).toEqual([]);
  });

  it('reports whether the item offers a choice at all', () => {
    const { e } = make();
    const one = { audio: { index: 0 } } as unknown as MediaItem;
    const two = { audioTracks: [{ index: 0 }, { index: 1 }] } as unknown as MediaItem;
    expect(e.hasMultipleAudioTracks(one)).toBe(false);
    expect(e.hasMultipleAudioTracks(two)).toBe(true);
  });
});

describe('ExpoVideoEngine player lifetime', () => {
  it('pauses a retired player at once but releases it a beat later', () => {
    // Releasing it at once is a use-after-free: <VideoView> holds it as a prop
    // until React re-renders, and a released shared object takes the UI down.
    vi.useFakeTimers();
    const { e } = make({ direct: false, startSec: 300 });
    const first = current(e);
    first.replaceThrows = true;
    e.seekTo(120);

    expect(first.pauses).toBeGreaterThan(0);
    expect(first.released).toBe(false);
    vi.advanceTimersByTime(5000);
    expect(first.released).toBe(true);
  });

  it('releases at once when the ENGINE is destroyed, not a beat later', () => {
    // Switching engines: whatever replaces this one opens its own decoder
    // immediately, and a 2 GB television cannot hold two. There is no successor
    // <VideoView> to wait for here, so the grace above buys nothing.
    vi.useFakeTimers();
    const { e } = make({ direct: true, startSec: 0 });
    const player = current(e);

    e.destroy();

    expect(player.released).toBe(true);
  });

  it('a retired player cannot write over the one that replaced it', () => {
    // AVFoundation reports a failed track load many seconds late.
    const { e, listeners } = make({ direct: false, startSec: 300 });
    const first = current(e);
    first.replaceThrows = true;
    e.seekTo(120);
    const second = current(e);
    expect(second).not.toBe(first);

    first.emit('timeUpdate', { currentTime: 900 });
    first.emit('statusChange', { status: 'error' });
    expect(e.position()).toBe(120);
    expect(listeners.onError).not.toHaveBeenCalled();

    second.emit('timeUpdate', { currentTime: 5 });
    expect(e.position()).toBe(125);
  });

  it('reading a released player returns nothing rather than throwing', () => {
    // A property read on a released shared object throws, and from an event
    // callback that would unmount the player mid-film.
    const { e } = make({ direct: false, startSec: 300 });
    current(e).throwOnRead = true;
    expect(() => e.bufferedEnd()).not.toThrow();
    expect(e.bufferedEnd()).toBe(300);
    expect(() => current(e).emit('timeUpdate', { currentTime: 4 })).not.toThrow();
  });

  it('a non-finite buffer reads as zero', () => {
    const { e } = make({ direct: true });
    current(e).bufferedPosition = Number.NaN;
    expect(e.bufferedEnd()).toBe(0);
  });

  it('an engine with no player left reports only its anchor as buffered', () => {
    const { e } = make({ direct: false, startSec: 300 });
    e.destroy();
    expect(e.videoPlayer).toBeNull();
    expect(e.bufferedEnd()).toBe(300);
  });

  it('an in-flight event from a retired player cannot move the successor', () => {
    const { e, listeners } = make({ direct: false, startSec: 300 });
    const first = current(e);
    first.replaceThrows = true;
    e.seekTo(120);
    const second = current(e);
    expect(second).not.toBe(first);

    first.emitStale('timeUpdate', { currentTime: 900 });
    first.emitStale('statusChange', { status: 'error' });
    expect(e.position()).toBe(120);
    expect(listeners.onError).not.toHaveBeenCalled();
    expect(listeners.onWaiting).not.toHaveBeenCalled();
  });

  it('an in-flight event after destroy reaches nothing', () => {
    const { e, listeners } = make({ direct: true });
    const player = current(e);
    e.destroy();
    player.emitStale('timeUpdate', { currentTime: 900 });
    player.emitStale('statusChange', { status: 'error' });
    expect(e.position()).toBe(0);
    expect(listeners.onTime).not.toHaveBeenCalled();
    expect(listeners.onError).not.toHaveBeenCalled();
  });

  it('destroy detaches the listeners and retires the player', () => {
    vi.useFakeTimers();
    const { e, listeners } = make({ direct: true });
    const player = current(e);
    e.destroy();

    expect(e.videoPlayer).toBeNull();
    expect(player.subs.every((s) => s.removed)).toBe(true);
    vi.advanceTimersByTime(5000);
    expect(player.released).toBe(true);

    player.emit('statusChange', { status: 'error' });
    expect(listeners.onError).not.toHaveBeenCalled();
  });
});

describe('what the stats panel asks the engine', () => {
  const rowsOf = (e: ReturnType<typeof make>['e']) =>
    Object.fromEntries((e.debugRows?.() ?? []).map((r) => [r.label, r.value]));

  it('names the plane even before a player exists', () => {
    const { e } = make({ direct: true });
    e.destroy();
    expect(rowsOf(e).Plane).toBeTruthy();
  });

  it('reports only what the player answered, never a zero standing for unknown', () => {
    const { e } = make({ direct: true });
    Object.assign(current(e), {
      status: 'readyToPlay',
      playbackRate: 1,
      videoTrack: {
        mimeType: 'video/hevc',
        size: { width: 3840, height: 2160 },
        frameRate: 23.976,
        peakBitrate: 42_000_000,
        averageBitrate: null,
        bitrate: null,
        videoRange: 'HLG',
        isSupported: true,
      },
    });

    const rows = rowsOf(e);
    expect(rows['Player state']).toBe('readyToPlay');
    expect(rows.Track).toBe('video/hevc');
    expect(rows['Track size']).toBe('3840×2160');
    expect(rows['Frame rate']).toBe('23.98 fps');
    expect(rows.Bitrate).toBe('42.0 Mb/s');
    expect(rows.Range).toBe('HLG');
    // Playing at 1x is not a fact worth a row, and the device CAN decode it.
    expect(rows.Rate).toBeUndefined();
    expect(rows.Decoder).toBeUndefined();
  });

  it('says so when the device has no decoder for the track', () => {
    const { e } = make({ direct: true });
    Object.assign(current(e), {
      status: 'readyToPlay',
      playbackRate: 1.5,
      videoTrack: {
        mimeType: null,
        size: { width: 0, height: 0 },
        frameRate: null,
        peakBitrate: null,
        averageBitrate: null,
        bitrate: null,
        videoRange: null,
        isSupported: false,
      },
    });

    const rows = rowsOf(e);
    expect(rows.Decoder).toBe('unsupported');
    expect(rows.Rate).toBe('1.5x');
    // Nothing the track left null is invented.
    expect(rows.Track).toBeUndefined();
    expect(rows['Track size']).toBeUndefined();
    expect(rows.Bitrate).toBeUndefined();
  });

  it('survives a player that throws on every read, which is what a swap looks like', () => {
    const { e } = make({ direct: true });
    current(e).throwOnRead = true;
    expect(() => e.debugRows?.()).not.toThrow();
    expect(rowsOf(e).Plane).toBeTruthy();
  });
});
