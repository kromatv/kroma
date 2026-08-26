import type { KromaClient, MediaItem } from '@kroma/core';
import { describe, expect, it, vi } from 'vitest';
import type { EngineListeners } from '#tv/features/playback/player/engine';
import { VlcEngine } from '#tv/features/playback/player/vlcEngine';
import { registerVlcPlane } from '#tv/features/playback/player/vlcPlane';

const listeners = (): EngineListeners => ({
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
});

const item = { id: 'ep1', durationMs: 1_470_000 } as MediaItem;
const client = { streamUrl: (id: string) => `http://server/api/items/${id}/stream` } as KromaClient;

function engine(startSec = 0, L = listeners(), durationSec = 1470) {
  return {
    L,
    e: new VlcEngine({
      client,
      item,
      durationSec,
      initialRendition: 0,
      startSec,
      direct: true,
      listeners: L,
    }),
  };
}

describe('VlcEngine source', () => {
  it('opens the original file, never the remux', () => {
    const { e } = engine();
    expect(e.source.uri).toBe('http://server/api/items/ep1/stream');
  });

  it('carries the resume point as the media start, in milliseconds', () => {
    expect(engine(354.729).e.source.startMs).toBe(354_729);
  });

  // `engineRef` is a ref, so nothing re-renders when the engine is built: without
  // this the plane that IS the player never mounts and the screen stays black.
  it('asks for a surface as soon as it exists', () => {
    const { L } = engine();
    expect(L.onSurfaceChange).toHaveBeenCalled();
  });
});

describe('VlcEngine controls', () => {
  it('reports a seek as a new nonce, so the same target twice is two seeks', () => {
    const { e } = engine();
    e.seekTo(60);
    const first = e.viewState;
    expect(first.seekMs).toBe(60_000);
    e.seekTo(60);
    expect(e.viewState.seekNonce).toBe(first.seekNonce + 1);
  });

  it('moves the clock on seek rather than waiting for VLC to answer', () => {
    const { e, L } = engine();
    e.seekTo(42);
    expect(e.position()).toBe(42);
    expect(L.onTime).toHaveBeenCalledWith(42);
  });

  it('never seeks before zero', () => {
    const { e } = engine();
    e.seekTo(-10);
    expect(e.viewState.seekMs).toBe(0);
  });

  it('carries pause through the view state', () => {
    const { e, L } = engine();
    e.pause();
    expect(e.viewState.paused).toBe(true);
    expect(L.onPause).toHaveBeenCalled();
    e.play();
    expect(e.viewState.paused).toBe(false);
    expect(L.onPlay).toHaveBeenCalled();
  });

  it('carries the filter, the rate and the audio track', () => {
    const { e } = engine();
    e.setAudioFilter('night');
    e.setRate(1.5);
    e.setAudioRendition(2);
    expect(e.viewState).toMatchObject({ audioFilter: 'night', rate: 1.5, audioTrack: 2 });
  });

  it('decodes everything itself, so the server is never asked to filter', () => {
    expect(engine().e.audioFilterSupported()).toBe(true);
  });

  // There is no anchored master to re-anchor onto, and nothing to draw ahead of
  // the picture: this backend never reports a buffered range at all.
  it('seeks natively and never claims a buffered range', () => {
    const { e } = engine();
    e.reportTime(30_000, 1_470_000);
    expect(e.position()).toBe(30);
    expect(e.bufferedEnd()).toBeNull();
    e.setAudioRendition(1);
    expect(e.viewState.audioTrack).toBe(1);
  });
});

describe('VlcEngine state', () => {
  // The catalogue runtime is what the engine starts with, so a duration equal to
  // it is not re-announced; VLC's own answer only matters when it differs.
  it('reports position and duration from what VLC last said', () => {
    const { e, L } = engine(0, listeners(), 0);
    e.reportTime(90_000, 1_470_000);
    expect(e.position()).toBe(90);
    expect(e.duration()).toBe(1470);
    expect(L.onDuration).toHaveBeenCalledWith(1470);
  });

  it('announces a duration once, not on every tick', () => {
    const { e, L } = engine(0, listeners(), 0);
    e.reportTime(1000, 1_470_000);
    e.reportTime(2000, 1_470_000);
    expect(L.onDuration).toHaveBeenCalledTimes(1);
  });

  // VLC keeps firing Buffering while it plays, 100 included; spinning on every one
  // of them leaves the spinner over a picture that is running.
  it('only spins while the buffer is short of full', () => {
    const { e, L } = engine();
    e.reportState('buffering', 40);
    expect(L.onWaiting).toHaveBeenCalledTimes(1);
    e.reportState('buffering', 100);
    expect(L.onWaiting).toHaveBeenCalledTimes(1);
    expect(L.onReady).toHaveBeenCalled();
  });

  it('reports playing, paused and ended', () => {
    const { e, L } = engine();
    e.reportState('playing');
    expect(L.onPlaying).toHaveBeenCalled();
    e.reportState('paused');
    expect(L.onPause).toHaveBeenCalled();
    e.reportState('ended');
    expect(L.onEnded).toHaveBeenCalled();
  });

  it('goes quiet once destroyed', () => {
    const { e, L } = engine();
    e.destroy();
    e.reportTime(5000, 1_470_000);
    e.reportState('playing');
    e.reportError();
    expect(L.onTime).not.toHaveBeenCalled();
    expect(L.onPlaying).not.toHaveBeenCalled();
    expect(L.onError).not.toHaveBeenCalled();
  });

  it('names the plane and what it is doing, for the stats panel', () => {
    const { e } = engine();
    e.reportState('buffering', 60);
    const rows = e.debugRows();
    expect(rows.map((r) => r.label)).toContain('VLC buffer');
    expect(rows.find((r) => r.label === 'VLC buffer')?.value).toBe('60%');
  });

  it('reports a full cache as playing, not as buffering', () => {
    const { e } = engine();

    e.reportState('playing');
    e.reportState('buffering', 100);

    expect(e.debugRows().find((r) => r.label === 'VLC state')?.value).toBe('playing');
  });

  it('reports a full cache as paused while the film is held', () => {
    const { e } = engine();

    e.reportState('paused');
    e.reportState('buffering', 100);

    expect(e.debugRows().find((r) => r.label === 'VLC state')?.value).toBe('paused');
  });

  it('omits the decoder counters until libVLC has reported some', () => {
    const { e } = engine();

    const labels = e.debugRows().map((r) => r.label);

    expect(labels).not.toContain('Dropped frames');
    expect(labels).not.toContain('Bitrate');
  });

  it('counts a dropped picture against every picture decoded', () => {
    const { e } = engine();

    e.reportStats({ lostPictures: 3, displayedPictures: 97, inputBitrate: 1.25 });
    const rows = e.debugRows();

    expect(rows.find((r) => r.label === 'Dropped frames')?.value).toBe('3 / 100');
    expect(rows.find((r) => r.label === 'Bitrate')?.value).toBe('10.0 Mb/s');
  });

  it('reports no buffered range, because libVLC has none to give', () => {
    const { e, L } = engine();

    e.reportState('buffering', 40);

    // Cache fullness is not a length of film, and the seek bar would draw it as
    // one. `bufferPercent` still drives the spinner.
    expect(e.bufferedEnd()).toBeNull();
    expect(L.onBuffered).toHaveBeenCalledWith(null);
  });

  it('releases the native player as soon as the engine is torn down', () => {
    const releaseNow = vi.fn();
    registerVlcPlane(null, releaseNow);
    const { e } = engine();

    e.destroy();

    expect(releaseNow).toHaveBeenCalled();
    registerVlcPlane(null);
  });
});
