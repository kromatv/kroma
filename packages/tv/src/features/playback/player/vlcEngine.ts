// The libVLC plane (Android only). Direct-only on purpose: this engine exists
// because VLC carries its own decoders, so the reason to reach for it is always
// the ORIGINAL file that the platform decoder refused. Sending it through the
// server's remux would spend the server's CPU to work around a limit VLC does
// not have.
//
// Unlike the expo-video engine, the player here IS the view: libVLC binds to a
// surface, so <PlayerSurface> renders the plane and drives it with props.

import type { AudioFilterMode } from '@kroma/ui';
import { BaseTvEngine, type EngineOptions } from '#tv/features/playback/player/baseEngine';
import type { TvEngine } from '#tv/features/playback/player/engine';
import { releaseVlcPlanes, type VlcPlaneStats } from '#tv/features/playback/player/vlcPlane';

interface VlcSourceState {
  uri: string;
  startMs: number;
}

export class VlcEngine extends BaseTvEngine implements TvEngine {
  readonly kind = 'vlc' as const;
  private seekMs = 0;
  private seekNonce = 0;
  private rate = 1;
  private bufferPercent = 0;
  private lastState = 'idle';
  private stats: VlcPlaneStats | null = null;
  readonly source: VlcSourceState;

  constructor(opts: EngineOptions) {
    super({ ...opts, direct: true });
    this.source = {
      uri: this.sourceUrl(),
      startMs: Math.max(0, Math.round(opts.startSec * 1000)),
    };
    // `engineRef` is a ref, so building this engine renders nothing: without the
    // nonce the plane that IS the player never mounts, and the screen stays black.
    this.listeners.onSurfaceChange?.();
  }

  /** What the surface hands the native view: a seek is a nonce it acts on once. */
  get viewState(): {
    paused: boolean;
    seekMs: number;
    seekNonce: number;
    audioTrack: number;
    audioFilter: AudioFilterMode;
    rate: number;
  } {
    return {
      paused: this.paused,
      seekMs: this.seekMs,
      seekNonce: this.seekNonce,
      audioTrack: this.rendition,
      audioFilter: this.filter,
      rate: this.rate,
    };
  }

  setAudioFilter(mode: AudioFilterMode): void {
    this.filter = mode;
  }

  setRate(rate: number): void {
    this.rate = rate;
  }

  // VLC carries its own compressor and its own gain, so unlike the platform
  // player this never has to ask the server to re-encode the soundtrack.
  audioFilterSupported(): boolean {
    return true;
  }

  /** Event plumbing for the surface: VLC reports in milliseconds. */
  reportTime(timeMs: number, lengthMs: number): void {
    if (this.destroyed) return;
    this.elSec = timeMs / 1000;
    this.listeners.onTime(this.position());
    this.listeners.onBuffered(this.bufferedEnd());
    const seconds = lengthMs / 1000;
    if (seconds > 0 && seconds !== this.durSec) {
      this.durSec = seconds;
      this.listeners.onDuration(seconds);
    }
  }

  reportState(state: string, percent = 100): void {
    if (this.destroyed) return;
    if (state === 'buffering') {
      this.bufferPercent = percent;
      this.listeners.onBuffered(this.bufferedEnd());
      // VLC keeps firing Buffering while it plays, 100 included. Spinning on
      // every one of them leaves the spinner over a picture that is running,
      // and reporting them as the state leaves the panel reading `buffering`
      // over a film that never stopped.
      if (percent < 100) {
        this.lastState = 'buffering';
        this.listeners.onWaiting();
        return;
      }
      this.lastState = this.paused ? 'paused' : 'playing';
      this.listeners.onReady();
      if (!this.paused) this.listeners.onPlaying();
      return;
    }
    this.lastState = state;
    if (state === 'playing') {
      this.paused = false;
      this.listeners.onPlaying();
      this.listeners.onReady();
    } else if (state === 'paused') {
      this.paused = true;
      this.listeners.onPause();
    } else if (state === 'ended') {
      this.listeners.onEnded();
    }
  }

  reportError(): void {
    if (!this.destroyed) this.listeners.onError();
  }

  /** libVLC's own media counters, pushed from the plane on the time tick. */
  reportStats(stats: VlcPlaneStats): void {
    if (this.destroyed) return;
    this.stats = stats;
  }

  // Only what libVLC actually answered: a counter it never reported is left out
  // rather than drawn as a zero, which would read as "no frames dropped".
  debugRows(): { label: string; value: string }[] {
    const rows = [
      { label: 'Plane', value: 'libVLC' },
      { label: 'VLC state', value: this.lastState },
      { label: 'VLC buffer', value: `${Math.round(this.bufferPercent)}%` },
    ];
    const stats = this.stats;
    if (!stats) return rows;
    if (stats.displayedPictures > 0) {
      rows.push({
        label: 'Dropped frames',
        value: `${stats.lostPictures} / ${stats.displayedPictures + stats.lostPictures}`,
      });
    }
    // libVLC reports input bitrate in bytes per microsecond, which is megabytes
    // per second, so a byte is eight bits away from the Mb/s the panel wants.
    if (stats.inputBitrate > 0) {
      rows.push({ label: 'Bitrate', value: `${(stats.inputBitrate * 8).toFixed(1)} Mb/s` });
    }
    return rows;
  }

  // The three below only move engine state: <VlcSurface> re-renders on the next
  // playback tick and hands the change to the native view as a prop, which is the
  // one path that works under Fabric without a view ref.
  play(): void {
    this.paused = false;
    this.listeners.onPlay();
  }

  pause(): void {
    this.paused = true;
    this.listeners.onPause();
  }

  seekTo(absSec: number): void {
    this.seekMs = Math.max(0, Math.round(absSec * 1000));
    this.seekNonce += 1;
    // Optimistic, so the bar lands where it was dropped instead of snapping back
    // for the round trip through VLC.
    this.elSec = absSec;
    this.listeners.onTime(this.position());
  }

  // libVLC's Android binding has no buffered range: it reports how full its own
  // cache is, which is a different quantity and one the seek bar would draw as
  // a length of film. `bufferPercent` still drives the spinner, where a
  // percentage is exactly what is being asked for.
  bufferedEnd(): null {
    return null;
  }

  // Direct-only: there is no anchored master to re-anchor onto, so every seek is
  // native and this is the same call.
  protected reanchor(absSec: number): void {
    this.seekTo(absSec);
  }

  setAudioRendition(rendition: number): void {
    this.rendition = rendition;
  }

  // The plane owns the native player, and React unmounts it a commit later than
  // this: on an engine switch the next player is built in between, so without
  // releasing here both decoders are resident at once.
  destroy(): void {
    this.destroyed = true;
    releaseVlcPlanes();
  }
}
