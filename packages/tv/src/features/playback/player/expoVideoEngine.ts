// The NATIVE playback backend: expo-video (AVPlayer on Apple TV, Media3/ExoPlayer
// on Android TV). Follows BaseTvEngine's direct/master model, with a one-shot
// direct->master fallback for containers the platform demuxer can't open (e.g.
// MKV on tvOS).
//
// Unlike the other native engines, its <VideoView> sits in the view tree instead
// of rendering to a plane behind the page - hence `kind` is 'video' and `setRect`
// is absent.

import type { MediaItem } from '@kroma/core';
import { audioTracksOf } from '@kroma/core';
import { createVideoPlayer, type VideoPlayer } from 'expo-video';
import { Platform } from 'react-native';
import {
  BaseTvEngine,
  type EngineOptions,
  NATIVE_SEEK_AHEAD,
} from '#tv/features/playback/player/baseEngine';
import { nativeBufferBudget } from '#tv/features/playback/player/bufferBudget';
import type { TvEngine } from '#tv/features/playback/player/engine';

// What the platform player is actually made of, so the stats panel names the
// same thing the logs do.
const PLANE = Platform.OS === 'android' ? 'media3' : 'AVPlayer';

// The chrome interpolates between reports, so a coarser interval than the
// frame rate is plenty and costs less.
const TIME_UPDATE_SEC = 0.25;

// Long enough for React to have re-rendered the surface onto the successor,
// short enough that nobody notices the memory.
const RETIRE_MS = 1000;

// Releasing immediately is a use-after-free: <VideoView> still holds this
// player as a prop until React re-renders, and handing a released expo shared
// object to a native prop throws mid-commit, freezing the UI with the film
// still playing behind it. Pause now (no decoding), release on a timer once
// nothing refers to it.
function retire(player: VideoPlayer, now = false): void {
  try {
    player.pause();
  } catch {
    // no-op: already gone.
  }
  const free = () => {
    try {
      player.release();
    } catch {
      // no-op: released elsewhere, or the app is tearing down.
    }
  };
  // Immediately when the ENGINE is going away rather than one of its players:
  // there is no successor <VideoView> to wait for, and whatever replaces this
  // engine opens its own decoder at once. A second of both resident is what the
  // low-memory killer takes the app for on a 2 GB set, and a libVLC core
  // carrying a software decoder is the worst possible thing to hold it next to.
  if (now) {
    free();
    return;
  }
  setTimeout(free, RETIRE_MS);
}

export class ExpoVideoEngine extends BaseTvEngine implements TvEngine {
  readonly kind = 'video' as const;
  private player: VideoPlayer | null = null;
  private bufSec: number | null = null;
  private subscriptions: { remove(): void }[] = [];
  private pendingSeek: number | null = null;

  constructor(opts: EngineOptions) {
    super(opts);
    this.open(this.sourceUrl(), opts.startSec, true);
  }

  /** Null until the first open; replaced on every re-anchor. */
  get videoPlayer(): VideoPlayer | null {
    return this.player;
  }

  // `autoplay` is what playback should be doing afterwards, not always
  // "playing": starting it unconditionally meant a scrub while paused silently
  // resumed the film.
  private open(url: string, seekSec: number, autoplay: boolean): void {
    this.teardown();
    if (this.destroyed) return;
    const player = createVideoPlayer({ uri: url });
    player.timeUpdateEventInterval = TIME_UPDATE_SEC;
    // Survives `replace`, so a re-anchor keeps the bounds this player opened with.
    const budget = nativeBufferBudget();
    if (budget) player.bufferOptions = budget;
    // Only direct mode needs a seek: master's clock already starts at baseSec.
    this.pendingSeek = this.mode === 'direct' && seekSec > 0 ? seekSec : null;
    this.player = player;
    this.subscribe(player);
    // Notify the surface before playing: React hasn't re-rendered <VideoView>
    // onto the new player yet.
    this.listeners.onSurfaceChange?.();
    if (autoplay) player.play();
    this.paused = !autoplay;
  }

  private subscribe(player: VideoPlayer): void {
    const add = <K extends 'statusChange' | 'playingChange' | 'timeUpdate' | 'playToEnd'>(
      event: K,
      handler: Parameters<VideoPlayer['addListener']>[1],
    ) => {
      // Guard against a stale player: a failed direct attempt's in-flight
      // events (AVFoundation can report failure seconds late) must not
      // overwrite the replacement's state.
      const guarded = (payload: never) => {
        if (this.destroyed || this.player !== player) return;
        (handler as (p: never) => void)(payload);
      };
      this.subscriptions.push(player.addListener(event, guarded as never));
    };

    add('timeUpdate', (payload: { currentTime: number; bufferedPosition?: number }) => {
      this.elSec = payload.currentTime;
      // The event carries it, so take it from there: reading the property back
      // off a player that is mid-swap throws, and `readNumber` answers that with
      // a 0 the seek bar draws as "nothing buffered".
      if (payload.bufferedPosition != null) this.bufSec = payload.bufferedPosition;
      this.listeners.onTime(this.position());
      const duration = this.readNumber(() => player.duration);
      // In master mode the reported duration is the remaining anchored span,
      // so the item's own runtime (durSec) stays authoritative.
      if (this.mode === 'direct' && duration > 0 && duration !== this.durSec) {
        this.durSec = duration;
        this.listeners.onDuration(duration);
      }
      this.listeners.onBuffered(this.bufferedEnd());
    });

    add('playingChange', (payload: { isPlaying: boolean }) => {
      this.paused = !payload.isPlaying;
      if (payload.isPlaying) this.listeners.onPlay();
      else this.listeners.onPause();
    });

    add('statusChange', (payload: { status: string; error?: unknown }) => {
      if (payload.status === 'loading') {
        this.listeners.onWaiting();
        return;
      }
      if (payload.status === 'readyToPlay') {
        this.applyPendingSeek();
        this.listeners.onPlaying();
        this.listeners.onReady();
        return;
      }
      if (payload.status === 'error') this.fail();
    });

    add('playToEnd', () => {
      this.listeners.onEnded();
    });
  }

  private applyPendingSeek(): void {
    const seek = this.pendingSeek;
    this.pendingSeek = null;
    if (seek == null || !this.player) return;
    this.player.currentTime = seek;
    this.elSec = seek;
  }

  private teardown(now = false): void {
    for (const sub of this.subscriptions) sub.remove();
    this.subscriptions = [];
    const retiring = this.player;
    this.player = null;
    this.bufSec = null;
    if (retiring) retire(retiring, now);
  }

  /** In master mode, re-anchors at `absSec` on the server; in direct mode, seeks
   * within the file. */
  protected reanchor(absSec: number): void {
    if (this.mode === 'master') {
      this.baseSec = absSec;
      this.elSec = 0;
    }
    const player = this.player;
    // `replace` keeps the existing player and <VideoView>; swapping the whole
    // VideoPlayer would black the picture out for the handover.
    if (player && !this.destroyed) {
      this.pendingSeek = this.mode === 'direct' && absSec > 0 ? absSec : null;
      try {
        player.replace({ uri: this.sourceUrl() });
        if (!this.paused) player.play();
        return;
      } catch {
        // Fall through to a full reopen: a player refusing a new source is one
        // we should not keep.
      }
    }
    this.open(this.sourceUrl(), absSec, !this.paused);
  }

  play(): void {
    this.player?.play();
    this.paused = false;
  }

  pause(): void {
    this.player?.pause();
    this.paused = true;
  }

  // Only what the platform player actually answered: a field it left null is
  // left out rather than drawn as a zero, which would read as a measurement.
  // `isSupported` is the one worth reading twice - it is the device saying it
  // has no decoder for this track, which is the difference between a slow
  // picture and no picture at all.
  debugRows(): { label: string; value: string }[] {
    const rows = [{ label: 'Plane', value: PLANE }];
    const player = this.player;
    if (!player) return rows;
    const read = <T>(get: () => T): T | null => {
      try {
        return get();
      } catch {
        return null;
      }
    };

    const status = read(() => player.status);
    if (status) rows.push({ label: 'Player state', value: status });

    const rate = read(() => player.playbackRate);
    if (rate != null && rate !== 1) rows.push({ label: 'Rate', value: `${rate}x` });

    const track = read(() => player.videoTrack);
    if (!track) return rows;

    if (track.mimeType) rows.push({ label: 'Track', value: track.mimeType });
    if (track.size.width > 0) {
      rows.push({ label: 'Track size', value: `${track.size.width}×${track.size.height}` });
    }
    if (track.frameRate)
      rows.push({ label: 'Frame rate', value: `${track.frameRate.toFixed(2)} fps` });
    const bitrate = track.peakBitrate ?? track.averageBitrate ?? track.bitrate;
    if (bitrate) rows.push({ label: 'Bitrate', value: `${(bitrate / 1e6).toFixed(1)} Mb/s` });
    if (track.videoRange) rows.push({ label: 'Range', value: track.videoRange });
    if (!track.isSupported) rows.push({ label: 'Decoder', value: 'unsupported' });
    return rows;
  }

  bufferedEnd(): number {
    const buffered = this.bufSec ?? this.readNumber(() => this.player?.bufferedPosition ?? 0);
    return this.baseSec + Math.max(0, buffered);
  }

  // A released expo-video player throws on property access rather than
  // returning stale data; thrown from an event callback that used to unmount
  // the player mid-film and drop the viewer back to the home screen on Apple
  // TV. Swallow it and report 0.
  private readNumber(read: () => number): number {
    try {
      const value = read();
      return Number.isFinite(value) ? value : 0;
    } catch {
      return 0;
    }
  }

  seekTo(absSec: number): void {
    const player = this.player;
    if (!player) return;
    if (this.mode === 'direct') {
      player.currentTime = absSec;
      this.elSec = absSec;
      this.listeners.onTime(this.position());
      return;
    }
    // The anchored master is a complete VOD playlist from baseSec, so a target
    // at or after it is a native seek - instant, no re-anchor. Two exceptions
    // still need one: seeking before the anchor, or far enough ahead to outrun
    // the remux.
    const here = this.position();
    if (absSec >= this.baseSec && absSec <= here + NATIVE_SEEK_AHEAD) {
      this.elSec = absSec - this.baseSec;
      player.currentTime = this.elSec;
      this.listeners.onTime(this.position());
      return;
    }
    this.reanchor(absSec);
  }

  setAudioRendition(rendition: number): void {
    if (rendition === this.rendition) return;
    this.rendition = rendition;
    const player = this.player;
    if (!player) return;
    // Direct mode exposes the file's own audio tracks: switch in place, no
    // server round trip.
    if (this.mode === 'direct') {
      const track = player.availableAudioTracks[rendition];
      if (track) {
        player.audioTrack = track;
        return;
      }
    }
    // The master carries one audio rendition, so changing track means a new
    // master at the current position.
    this.reanchor(this.position());
  }

  hasMultipleAudioTracks(item: MediaItem): boolean {
    return audioTracksOf(item).length > 1;
  }

  destroy(): void {
    this.destroyed = true;
    this.teardown(true);
  }
}
