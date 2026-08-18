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
    const seconds = lengthMs / 1000;
    if (seconds > 0 && seconds !== this.durSec) {
      this.durSec = seconds;
      this.listeners.onDuration(seconds);
    }
  }

  reportState(state: string, percent = 100): void {
    if (this.destroyed) return;
    this.lastState = state;
    if (state === 'playing') {
      this.paused = false;
      this.listeners.onPlaying();
      this.listeners.onReady();
    } else if (state === 'paused') {
      this.paused = true;
      this.listeners.onPause();
    } else if (state === 'buffering') {
      this.bufferPercent = percent;
      // VLC keeps firing Buffering while it plays, 100 included. Spinning on
      // every one of them leaves the spinner over a picture that is running.
      if (percent < 100) this.listeners.onWaiting();
      else {
        this.listeners.onReady();
        if (!this.paused) this.listeners.onPlaying();
      }
    } else if (state === 'ended') {
      this.listeners.onEnded();
    }
  }

  reportError(): void {
    if (!this.destroyed) this.listeners.onError();
  }

  debugRows(): { label: string; value: string }[] {
    return [
      { label: 'Plane', value: 'libVLC' },
      { label: 'VLC state', value: this.lastState },
      { label: 'VLC buffer', value: `${Math.round(this.bufferPercent)}%` },
    ];
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

  // VLC exposes no buffered range through the Android binding, so the reported
  // edge is the position: the chrome draws no phantom buffer it cannot know.
  bufferedEnd(): number {
    return this.position();
  }

  // Direct-only: there is no anchored master to re-anchor onto, so every seek is
  // native and this is the same call.
  protected reanchor(absSec: number): void {
    this.seekTo(absSec);
  }

  setAudioRendition(rendition: number): void {
    this.rendition = rendition;
  }

  destroy(): void {
    this.destroyed = true;
  }
}
