// Shared base for the native video-plane backends (Samsung AVPlay, Android
// ExoPlayer, desktop mpv): a `direct` mode on the original file's absolute
// timeline, and a `master` mode on the server's HLS remux anchored at `baseSec`
// (its clock restarts at 0, so the absolute position is `baseSec + elSec`).

import { decodableAudioCodecs, type KromaClient, type MediaItem } from '@kroma/core';
import type { AudioFilterMode } from '@kroma/ui';
import type { EngineListeners, TvEngine } from '#tv/features/playback/player/engine';

export interface EngineOptions {
  client: KromaClient;
  item: MediaItem;
  durationSec: number;
  initialRendition: number;
  startSec: number;
  direct: boolean;
  audioFilter?: AudioFilterMode;
  listeners: EngineListeners;
}

/** Seconds: a master-mode seek further ahead than this re-anchors, since it is
 * past the anchored remux's production edge. Direct mode always seeks natively. */
export const NATIVE_SEEK_AHEAD = 60;

/**
 * The filter the SERVER can apply, which is not every mode the app offers:
 * `boost` is plain gain and belongs to whichever engine is decoding, so asking
 * the server for it would spend a re-encode on a filter it does not have.
 */
export function serverAudioFilter(mode: AudioFilterMode): 'standard' | 'night' | undefined {
  return mode === 'standard' || mode === 'night' ? mode : undefined;
}

export abstract class BaseTvEngine implements TvEngine {
  abstract readonly kind: TvEngine['kind'];
  protected readonly client: KromaClient;
  protected readonly item: MediaItem;
  protected readonly listeners: EngineListeners;
  protected mode: 'direct' | 'master';
  protected fellBack = false;
  protected durSec: number;
  protected baseSec = 0;
  protected elSec = 0;
  protected paused = false;
  protected destroyed = false;
  protected rendition: number;
  protected filter: AudioFilterMode;
  protected filterMaster = false;
  protected forceAac = false;
  protected resumeOnLoad = false;

  protected constructor(opts: EngineOptions) {
    this.client = opts.client;
    this.item = opts.item;
    this.listeners = opts.listeners;
    this.durSec = opts.durationSec;
    this.rendition = opts.initialRendition;
    this.filter = opts.audioFilter ?? 'off';
    this.mode = opts.direct ? 'direct' : 'master';
    if (this.mode === 'direct') {
      this.elSec = opts.startSec;
    } else {
      this.baseSec = opts.startSec;
    }
  }

  protected sourceUrl(): string {
    return this.mode === 'direct'
      ? this.client.streamUrl(this.item.id)
      : this.client.hlsMasterUrl(
          this.item.id,
          this.forceAac,
          this.baseSec,
          this.rendition,
          // Declared on every master, not just the fallback one: the server copies
          // audio unless it is told what this device decodes, so a master that says
          // nothing is served a codec it may only be able to play as silence.
          { copyCodecs: decodableAudioCodecs() },
        );
  }

  // `audioUnsupported`: the device can't decode the source audio track, so
  // the master must transcode it to AAC. Each fallback below fires once.
  protected fail(audioUnsupported = false): void {
    if (this.destroyed) return;
    const pos = this.position();
    if (audioUnsupported && !this.forceAac) {
      this.forceAac = true;
      this.fellBack = true;
      this.mode = 'master';
      this.listeners.onWaiting();
      this.reanchor(pos);
      return;
    }
    if (this.mode === 'direct' && !this.fellBack) {
      this.fellBack = true;
      this.mode = 'master';
      this.listeners.onWaiting();
      this.reanchor(pos);
      return;
    }
    // A remux the server can't produce must cost the filter, not the title.
    if (this.mode === 'master' && this.filterMaster && !this.fellBack) {
      this.fellBack = true;
      this.filterMaster = false;
      this.filter = 'off';
      this.mode = 'direct';
      this.listeners.onAudioFilterUnavailable?.();
      this.listeners.onWaiting();
      this.reanchor(pos);
      return;
    }
    this.listeners.onError();
  }

  position(): number {
    return this.baseSec + this.elSec;
  }
  duration(): number {
    return this.durSec;
  }
  isPaused(): boolean {
    return this.paused;
  }

  protected abstract reanchor(absSec: number): void;

  abstract play(): void;
  abstract pause(): void;
  abstract bufferedEnd(): number | null;
  abstract seekTo(absSec: number): void;
  abstract setAudioRendition(rendition: number): void;
  abstract destroy(): void;
}
