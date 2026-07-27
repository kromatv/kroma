// The NATIVE playback backend: expo-video, which is AVPlayer on Apple TV and
// Media3/ExoPlayer on Android TV.
//
// It follows the same direct/master model as the other native engines (see
// BaseTvEngine): `direct` opens the ORIGINAL file on its own absolute timeline,
// `master` opens the server's HLS remux anchored at `baseSec` (its clock
// restarts at 0, so the absolute position is `baseSec + elSec`), with a one-shot
// direct->master fallback for a file the platform player cannot demux. That is
// what makes an MKV play on a tvOS device whose AVPlayer has no Matroska
// demuxer: the direct attempt fails, and the same title comes back remuxed.
//
// Unlike AVPlay / mpv / ExoPlayer-over-a-bridge, this player does NOT render to
// a plane behind the page: its <VideoView> sits in the view tree like any other
// view, so the chrome transforms it into the settings card exactly as it does an
// in-page <video>. That is why `kind` is 'video' and `setRect` is absent.

import type { MediaItem } from '@kroma/core';
import { audioTracksOf } from '@kroma/core';
import { createVideoPlayer, type VideoPlayer } from 'expo-video';
import {
  BaseTvEngine,
  type EngineOptions,
  NATIVE_SEEK_AHEAD,
} from '#tv/features/playback/player/baseEngine';
import type { TvEngine } from '#tv/features/playback/player/engine';

/** How often the player reports its position. The chrome interpolates between
 * reports, so a coarser interval than the frame rate is plenty and costs less. */
const TIME_UPDATE_SEC = 0.25;

/** How long a replaced player is kept alive after it stops being the current
 * one. Long enough for React to have re-rendered the surface against its
 * successor, short enough that no one notices the memory. */
const RETIRE_MS = 1000;

/**
 * Stop a player we are done with, then let it go a beat later.
 *
 * Releasing it here and now is what the code used to do, and it is a
 * use-after-free: `<VideoView>` still holds this player as a prop until React
 * re-renders, and handing a RELEASED expo shared object to a native prop throws
 * ("Unable to find the native shared object associated with given JavaScript
 * object"). Thrown mid-commit, React cannot recover - the UI freezes with the
 * film still playing behind it, which is exactly how a seek used to end.
 *
 * So it is paused immediately (no decoding, no bandwidth) and released on a
 * timer, by which time nothing refers to it.
 */
function retire(player: VideoPlayer): void {
  try {
    player.pause();
  } catch {
    // Already gone; the release below is then a no-op too.
  }
  setTimeout(() => {
    try {
      player.release();
    } catch {
      // Released elsewhere, or the app is tearing down. Either way, done.
    }
  }, RETIRE_MS);
}

export class ExpoVideoEngine extends BaseTvEngine implements TvEngine {
  readonly kind = 'video' as const;
  private player: VideoPlayer | null = null;
  private subscriptions: { remove(): void }[] = [];
  /** Seek requested before the player reported a duration; applied on ready. */
  private pendingSeek: number | null = null;

  constructor(opts: EngineOptions) {
    super(opts);
    this.open(this.sourceUrl(), opts.startSec, true);
  }

  /** The player instance the <VideoView> surface renders. Null until the first
   * open, and replaced on every re-anchor, so the surface reads it per render. */
  get videoPlayer(): VideoPlayer | null {
    return this.player;
  }

  /**
   * Point the surface at `url`, from `seekSec`.
   *
   * `autoplay` is what the caller wants playback to be doing afterwards, and it
   * is not always "playing": a seek in master mode is a NEW anchor, which means a
   * new player, and starting it unconditionally meant that nudging the scrub bar
   * while paused silently resumed the film. Only the first open, and the
   * direct->remux fallback of something that was already playing, want it true.
   */
  private open(url: string, seekSec: number, autoplay: boolean): void {
    this.teardown();
    if (this.destroyed) return;
    const player = createVideoPlayer({ uri: url });
    player.timeUpdateEventInterval = TIME_UPDATE_SEC;
    // Direct mode carries the file's own absolute timeline, so the resume point
    // is a seek within it. The master is already anchored server-side at
    // `baseSec`, so its clock starts at 0 and there is nothing to seek.
    this.pendingSeek = this.mode === 'direct' && seekSec > 0 ? seekSec : null;
    this.player = player;
    this.subscribe(player);
    // Tell the surface BEFORE playing: <VideoView> is still rendering the player
    // this one replaced, and until React re-renders there is nothing on screen.
    this.listeners.onSurfaceChange?.();
    if (autoplay) player.play();
    this.paused = !autoplay;
  }

  private subscribe(player: VideoPlayer): void {
    const add = <K extends 'statusChange' | 'playingChange' | 'timeUpdate' | 'playToEnd'>(
      event: K,
      handler: Parameters<VideoPlayer['addListener']>[1],
    ) => {
      // Every handler runs only while `player` is still THE player. A direct
      // attempt that fails is replaced by the remuxed one, and the loser's
      // in-flight work (AVFoundation reports a failed track load many seconds
      // later) must not be allowed to write over the winner's position or read a
      // player we have released.
      const guarded = (payload: never) => {
        if (this.destroyed || this.player !== player) return;
        (handler as (p: never) => void)(payload);
      };
      this.subscriptions.push(player.addListener(event, guarded as never));
    };

    add('timeUpdate', (payload: { currentTime: number; bufferedPosition?: number }) => {
      this.elSec = payload.currentTime;
      this.listeners.onTime(this.position());
      const duration = this.readNumber(() => player.duration);
      // In master mode the reported duration is the remaining anchored span, so
      // the item's own runtime (durSec) stays authoritative.
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

  private teardown(): void {
    for (const sub of this.subscriptions) sub.remove();
    this.subscriptions = [];
    const retiring = this.player;
    this.player = null;
    if (retiring) retire(retiring);
  }

  /** Reopen the current mode's source at `absSec`. In master mode that means a
   * new server anchor; in direct mode a seek within the file. */
  protected reanchor(absSec: number): void {
    if (this.mode === 'master') {
      this.baseSec = absSec;
      this.elSec = 0;
    }
    const player = this.player;
    // Re-point the player we already have rather than building another one.
    // Swapping the whole VideoPlayer means a new native player AND a new
    // <VideoView> to host it, so the picture blacks out for the length of the
    // handover; `replace` keeps both and just changes the source.
    if (player && !this.destroyed) {
      this.pendingSeek = this.mode === 'direct' && absSec > 0 ? absSec : null;
      try {
        player.replace({ uri: this.sourceUrl() });
        if (!this.paused) player.play();
        return;
      } catch {
        // Fall through to a full reopen: a player that will not take a new
        // source is one we should not keep.
      }
    }
    // Carry the transport state across the swap: a paused player that seeks stays
    // paused, a playing one keeps playing.
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

  bufferedEnd(): number {
    const buffered = this.readNumber(() => this.player?.bufferedPosition ?? 0);
    return this.baseSec + Math.max(0, buffered);
  }

  /**
   * Read a number off the native player, or 0 if it is no longer there.
   *
   * expo-video properties are calls into a native shared object, and once that
   * object is released the call THROWS ("Unable to find the native shared object
   * associated with given JavaScript object"). Thrown from an event callback,
   * that is an unhandled error in the React tree: on Apple TV it did not degrade
   * the buffer bar, it unmounted the player mid-film and dropped the viewer back
   * on the home screen. A missing number is worth nothing; the film is worth
   * everything.
   */
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
    // The anchored master is a complete VOD playlist from `baseSec`, so a target
    // at or after the anchor is a NATIVE seek: instant, inside the stream that is
    // already open. This engine used to re-anchor for EVERY seek, which tore the
    // stream down and rebuilt it - seconds of spinner for a ten-second nudge.
    //
    // Two cases still need a new anchor: going back before the anchor (not in
    // this playlist at all), and jumping so far ahead that we would outrun what
    // the continuous remux has produced, where a native seek just stalls.
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
    // Direct mode plays the original file, whose audio tracks the platform
    // player exposes: switch in place, with no server round trip and no gap.
    if (this.mode === 'direct') {
      const track = player.availableAudioTracks[rendition];
      if (track) {
        player.audioTrack = track;
        return;
      }
    }
    // The master carries ONE audio rendition (the server picks it), so changing
    // track means a new master at the current position.
    this.reanchor(this.position());
  }

  /** Whether this item even offers a choice. Used by the chrome to hide the row
   * rather than show a picker with a single entry. */
  hasMultipleAudioTracks(item: MediaItem): boolean {
    return audioTracksOf(item).length > 1;
  }

  destroy(): void {
    this.destroyed = true;
    this.teardown();
  }
}
