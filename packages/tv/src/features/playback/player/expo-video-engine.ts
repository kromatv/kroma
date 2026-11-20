// The NATIVE playback backend: expo-video (AVPlayer on Apple TV, Media3/ExoPlayer
// on Android TV). Follows BaseTvEngine's direct/master model, with a one-shot
// direct->master fallback for containers the platform demuxer can't open (e.g.
// MKV on tvOS).
//
// Unlike the other native engines, its <VideoView> sits in the view tree instead
// of rendering to a plane behind the page - hence `kind` is 'video' and `setRect`
// is absent.

import type { MediaItem } from '@kromatv/client/media';
import { AT_FILM_START_SEC, audioTracksOf, resolveMasterStart } from '@kromatv/core';
import type { VideoPlayer, VideoPlayerEvents } from 'expo-video';
import {
  BaseTvEngine,
  type EngineOptions,
  NATIVE_SEEK_AHEAD,
} from '#tv/features/playback/player/base-engine';
import type { TvEngine } from '#tv/features/playback/player/engine';
import { MasterRescue } from '#tv/features/playback/player/engine-rescue';
import { ExpoDirectAudio } from '#tv/features/playback/player/expo-direct-audio';
import {
  createPlayer,
  playerDebugRows,
  readPlayerNumber,
  releasePlayer,
  retirePlayer,
} from '#tv/features/playback/player/expo-video-player';

export class ExpoVideoEngine extends BaseTvEngine implements TvEngine {
  readonly kind = 'video' as const;
  private player: VideoPlayer | null = null;
  private bufSec: number | null = null;
  private subscriptions: { remove(): void }[] = [];
  private pendingSeek: number | null = null;
  private readonly audio = new ExpoDirectAudio(audioTracksOf(this.item));
  private clockSettled = true;
  private ended = false;
  private startSeq = 0;
  private readonly rescue = new MasterRescue({
    refreshSession: () => this.client.refreshSession(),
    restart: () => this.reanchor(this.position()),
    broken: () => this.listeners.onError(),
    gone: () => this.destroyed,
  });

  constructor(opts: EngineOptions) {
    super(opts);
    this.open(this.sourceUrl(), opts.startSec, true);
    this.settleStart();
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
    if (this.destroyed) {
      return;
    }
    const player = createPlayer(url);
    // Only direct mode needs a seek: master's clock already starts at baseSec.
    this.pendingSeek = this.mode === 'direct' && seekSec > 0 ? seekSec : null;
    this.audio.opened(this.mode);
    this.clockSettled = true;
    this.player = player;
    this.subscribe(player);
    // Notify the surface before playing: React hasn't re-rendered <VideoView>
    // onto the new player yet.
    this.listeners.onSurfaceChange?.();
    if (autoplay) {
      player.play();
    }
    this.paused = !autoplay;
  }

  private subscribe(player: VideoPlayer): void {
    const add = (
      event: keyof VideoPlayerEvents,
      handler: Parameters<VideoPlayer['addListener']>[1],
    ) => {
      // Guard against a stale player: a failed direct attempt's in-flight
      // events (AVFoundation can report failure seconds late) must not
      // overwrite the replacement's state.
      const guarded = (payload: never) => {
        if (this.destroyed || this.player !== player) {
          return;
        }
        handler(payload);
      };
      this.subscriptions.push(player.addListener(event, guarded));
    };

    add('timeUpdate', (payload: { currentTime: number; bufferedPosition?: number }) => {
      if (!this.clockSettled) {
        return;
      }
      this.elSec = payload.currentTime;
      // The event carries it, so take it from there: reading the property back
      // off a player that is mid-swap throws, and `readPlayerNumber` answers
      // that with a 0 the seek bar draws as "nothing buffered".
      if (payload.bufferedPosition != null) {
        this.bufSec = payload.bufferedPosition;
      }
      this.listeners.onTime(this.position());
      const duration = readPlayerNumber(() => player.duration);
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
      if (payload.isPlaying) {
        this.rescue.playing();
        this.listeners.onPlay();
      } else {
        this.listeners.onPause();
      }
    });

    add('statusChange', (payload: { status: string; error?: unknown }) => {
      this.clockSettled = true;
      if (payload.status === 'loading') {
        this.listeners.onWaiting();
        return;
      }
      if (payload.status === 'readyToPlay') {
        if (!this.applyPending()) {
          return;
        }
        this.listeners.onPlaying();
        this.listeners.onReady();
        return;
      }
      if (payload.status === 'error') {
        this.failed(payload.error);
      }
    });

    add('playToEnd', () => {
      this.ended = true;
      this.listeners.onEnded();
    });

    add('availableAudioTracksChange', () => {
      if (!this.audio.listed(player, this.rendition)) {
        this.playTrackFromServer();
      }
    });
  }

  private failed(error: unknown): void {
    if (this.mode !== 'master' || !this.rescue.failed(error)) {
      this.fail();
    }
  }

  private applyPending(): boolean {
    const player = this.player;
    if (!player) {
      return false;
    }
    if (!this.audio.ready(player, this.rendition)) {
      this.playTrackFromServer();
      return false;
    }
    const seek = this.pendingSeek;
    this.pendingSeek = null;
    if (seek != null) {
      player.currentTime = seek;
      this.elSec = seek;
    }
    return true;
  }

  private playTrackFromServer(): void {
    const at = this.pendingSeek ?? this.position();
    this.mode = 'master';
    this.listeners.onWaiting();
    this.reanchor(at);
  }

  private teardown(release: (player: VideoPlayer) => void = retirePlayer): void {
    for (const sub of this.subscriptions) {
      sub.remove();
    }
    this.subscriptions = [];
    const retiring = this.player;
    this.player = null;
    this.bufSec = null;
    if (retiring) {
      release(retiring);
    }
  }

  // Every path that moves the anchor comes through here, so none can leave the
  // previous source's buffered depth to be drawn against the new one.
  private resetClock(absSec: number): void {
    if (this.mode === 'master') {
      this.baseSec = absSec;
      this.elSec = 0;
    }
    this.pendingSeek = this.mode === 'direct' && absSec > 0 ? absSec : null;
    this.audio.opened(this.mode);
    this.bufSec = null;
    this.clockSettled = false;
  }

  /** In master mode, re-anchors at `absSec` on the server; in direct mode, seeks
   * within the file. */
  protected reanchor(absSec: number): void {
    this.resetClock(absSec);
    this.settleStart();
    const player = this.player;
    // `replace` keeps the existing player and <VideoView>; swapping the whole
    // VideoPlayer would black the picture out for the handover.
    if (player && !this.destroyed) {
      try {
        player.replace({ uri: this.sourceUrl() });
        if (!this.paused) {
          player.play();
        }
        return;
      } catch {
        // Fall through to a full reopen: a player refusing a new source is one
        // we should not keep.
      }
    }
    this.open(this.sourceUrl(), absSec, !this.paused);
  }

  private settleStart(): void {
    const seq = ++this.startSeq;
    if (this.mode !== 'master' || this.baseSec <= AT_FILM_START_SEC) {
      return;
    }
    void resolveMasterStart(this.sourceUrl(), this.baseSec).then((real) => {
      if (this.destroyed || seq !== this.startSeq) {
        return;
      }
      this.baseSec = real;
      this.listeners.onTime(this.position());
    });
  }

  play(): void {
    if (this.ended) {
      this.playFromStart();
    } else {
      this.player?.play();
    }
    this.paused = false;
  }

  // A film that ran to its end starts again from its beginning, as a video
  // element does. `play` alone leaves this player sitting on its last frame.
  private playFromStart(): void {
    this.ended = false;
    if (this.mode === 'direct') {
      this.player?.replay();
    } else {
      this.seekTo(0);
    }
    this.player?.play();
  }

  pause(): void {
    this.player?.pause();
    this.paused = true;
  }

  debugRows(): { label: string; value: string }[] {
    return playerDebugRows(this.player);
  }

  bufferedEnd(): number {
    const buffered = this.bufSec ?? readPlayerNumber(() => this.player?.bufferedPosition ?? 0);
    return this.baseSec + Math.max(0, buffered);
  }

  seekTo(absSec: number): void {
    const player = this.player;
    if (!player) {
      return;
    }
    this.ended = false;
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
    const changed = rendition !== this.rendition;
    this.rendition = rendition;
    const player = this.player;
    if (!player) {
      return;
    }
    // Direct mode exposes the file's own audio tracks: switch in place, no
    // server round trip.
    if (this.mode === 'direct') {
      if (!this.audio.picked(player, rendition)) {
        this.playTrackFromServer();
      }
      return;
    }
    // The master carries one audio rendition, so changing track means a new
    // master at the current position.
    if (changed) {
      this.reanchor(this.position());
    }
  }

  hasMultipleAudioTracks(item: MediaItem): boolean {
    return audioTracksOf(item).length > 1;
  }

  destroy(): void {
    this.destroyed = true;
    this.teardown(releasePlayer);
  }
}
